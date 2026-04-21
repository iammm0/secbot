"""
NVD (National Vulnerability Database) 适配器
基于 NVD 2.0 REST API 获取漏洞与 CVSS 评分信息。
参考: https://nvd.nist.gov/developers/vulnerabilities
"""
import asyncio
import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import List, Optional

from loguru import logger

from secbot_agent.core.vuln_db.schema import (
    AffectedProduct,
    ExploitRef,
    UnifiedVuln,
    VulnSeverity,
    VulnSource,
)
from .base_adapter import BaseVulnAdapter

NVD_API_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0"

_SEVERITY_MAP = {
    "CRITICAL": VulnSeverity.CRITICAL,
    "HIGH": VulnSeverity.HIGH,
    "MEDIUM": VulnSeverity.MEDIUM,
    "LOW": VulnSeverity.LOW,
    "NONE": VulnSeverity.INFO,
}


class NvdAdapter(BaseVulnAdapter):
    """NVD 2.0 API 适配器"""

    source_name = "nvd"

    def __init__(self, api_key: Optional[str] = None, timeout: int = 20):
        self._api_key = api_key
        self._timeout = timeout

    # ------------------------------------------------------------------
    async def fetch_by_id(self, cve_id: str) -> Optional[UnifiedVuln]:
        url = f"{NVD_API_BASE}?cveId={cve_id}"
        data = await self._fetch_json(url)
        if not data:
            return None
        vulns = data.get("vulnerabilities", [])
        if not vulns:
            return None
        return self._normalize(vulns[0])

    async def search(self, keyword: str, limit: int = 20) -> List[UnifiedVuln]:
        encoded = urllib.parse.quote(keyword)
        url = f"{NVD_API_BASE}?keywordSearch={encoded}&resultsPerPage={min(limit, 100)}"
        data = await self._fetch_json(url)
        if not data:
            return []

        results: List[UnifiedVuln] = []
        for item in data.get("vulnerabilities", [])[:limit]:
            try:
                vuln = self._normalize(item)
                if vuln:
                    results.append(vuln)
            except Exception as exc:
                logger.debug(f"NVD normalize 跳过: {exc}")
        return results

    async def search_by_cpe(self, cpe_name: str, limit: int = 20) -> List[UnifiedVuln]:
        """按 CPE 名称检索漏洞"""
        encoded = urllib.parse.quote(cpe_name)
        url = f"{NVD_API_BASE}?cpeName={encoded}&resultsPerPage={min(limit, 100)}"
        data = await self._fetch_json(url)
        if not data:
            return []
        results: List[UnifiedVuln] = []
        for item in data.get("vulnerabilities", [])[:limit]:
            vuln = self._normalize(item)
            if vuln:
                results.append(vuln)
        return results

    # ------------------------------------------------------------------
    async def _fetch_json(self, url: str) -> Optional[dict]:
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(None, self._sync_get, url)
        except Exception as exc:
            logger.warning(f"NVD API 请求失败: {exc}")
            return None

    def _sync_get(self, url: str) -> dict:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "secbot/1.0")
        if self._api_key:
            req.add_header("apiKey", self._api_key)
        with urllib.request.urlopen(req, timeout=self._timeout) as resp:
            return json.loads(resp.read().decode())

    # ------------------------------------------------------------------
    def _normalize(self, item: dict) -> Optional[UnifiedVuln]:
        """将 NVD 2.0 vulnerabilities[] 条目归一化"""
        cve_data = item.get("cve", {})
        cve_id = cve_data.get("id", "")
        if not cve_id:
            return None

        # 描述
        desc_list = cve_data.get("descriptions", [])
        desc = ""
        for d in desc_list:
            if d.get("lang") == "en":
                desc = d.get("value", "")
                break
        if not desc and desc_list:
            desc = desc_list[0].get("value", "")

        # CVSS v3.1 → v3.0 → v2.0
        cvss_score, cvss_vector, severity = None, None, VulnSeverity.UNKNOWN
        metrics = cve_data.get("metrics", {})
        for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
            metric_list = metrics.get(key, [])
            if metric_list:
                cvss_obj = metric_list[0].get("cvssData", {})
                cvss_score = cvss_obj.get("baseScore")
                cvss_vector = cvss_obj.get("vectorString")
                sev_str = (
                    metric_list[0].get("baseSeverity")
                    or cvss_obj.get("baseSeverity", "")
                ).upper()
                severity = _SEVERITY_MAP.get(sev_str, VulnSeverity.UNKNOWN)
                break

        # 受影响配置 (CPE)
        products: List[AffectedProduct] = []
        for config in cve_data.get("configurations", []):
            for node in config.get("nodes", []):
                for match in node.get("cpeMatch", []):
                    cpe_uri = match.get("criteria", "")
                    parts = cpe_uri.split(":")
                    if len(parts) >= 5:
                        products.append(
                            AffectedProduct(
                                vendor=parts[3] if len(parts) > 3 else "",
                                product=parts[4] if len(parts) > 4 else "",
                                versions=[parts[5]] if len(parts) > 5 and parts[5] != "*" else [],
                                cpe=cpe_uri,
                            )
                        )

        # CWE
        tags: List[str] = []
        for weakness in cve_data.get("weaknesses", []):
            for wd in weakness.get("description", []):
                cwe_val = wd.get("value", "")
                if cwe_val and cwe_val not in tags:
                    tags.append(cwe_val)

        # 引用
        refs = [
            r.get("url", "")
            for r in cve_data.get("references", [])[:10]
            if r.get("url")
        ]

        # Exploit 标记
        exploits: List[ExploitRef] = []
        for ref_obj in cve_data.get("references", []):
            ref_tags = ref_obj.get("tags", [])
            if "Exploit" in ref_tags or "Third Party Advisory" in ref_tags:
                exploits.append(
                    ExploitRef(
                        url=ref_obj.get("url", ""),
                        title=ref_obj.get("url", "").split("/")[-1],
                        exploit_type="reference",
                        source=ref_obj.get("source", ""),
                    )
                )

        # 日期
        date_pub = self._parse_date(cve_data.get("published"))
        date_mod = self._parse_date(cve_data.get("lastModified"))

        return UnifiedVuln(
            vuln_id=cve_id,
            source=VulnSource.NVD,
            title=cve_id,
            description=desc[:2000],
            affected_software=products[:20],
            severity=severity,
            cvss_score=cvss_score,
            cvss_vector=cvss_vector,
            exploits=exploits,
            references=refs,
            tags=tags,
            date_published=date_pub,
            date_modified=date_mod,
            state=cve_data.get("vulnStatus", ""),
        )

    @staticmethod
    def _parse_date(raw: Optional[str]) -> Optional[datetime]:
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            return None
