"""
CVE 数据源适配器
基于 MITRE CVE API (cveawg.mitre.org) 获取漏洞信息并归一化为 UnifiedVuln。
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
    Mitigation,
    UnifiedVuln,
    VulnSeverity,
    VulnSource,
)
from .base_adapter import BaseVulnAdapter

_SEVERITY_MAP = {
    "CRITICAL": VulnSeverity.CRITICAL,
    "HIGH": VulnSeverity.HIGH,
    "MEDIUM": VulnSeverity.MEDIUM,
    "LOW": VulnSeverity.LOW,
    "NONE": VulnSeverity.INFO,
}

CVE_API_BASE = "https://cveawg.mitre.org/api/cve"


class CveAdapter(BaseVulnAdapter):
    """MITRE CVE API 适配器"""

    source_name = "cve"

    def __init__(self, timeout: int = 15):
        self._timeout = timeout

    # ------------------------------------------------------------------
    async def fetch_by_id(self, cve_id: str) -> Optional[UnifiedVuln]:
        url = f"{CVE_API_BASE}/{cve_id}"
        data = await self._fetch_json(url)
        if data is None:
            return None
        return self._normalize(data)

    async def search(self, keyword: str, limit: int = 20) -> List[UnifiedVuln]:
        encoded = urllib.parse.quote(keyword)
        url = f"{CVE_API_BASE}?keyword={encoded}&limit={min(limit, 50)}"
        data = await self._fetch_json(url)
        if data is None:
            return []

        items: list = []
        if isinstance(data, dict):
            items = data.get("cves", data.get("vulnerabilities", []))
        elif isinstance(data, list):
            items = data

        results: List[UnifiedVuln] = []
        for item in items[:limit]:
            try:
                vuln = self._normalize(item)
                if vuln:
                    results.append(vuln)
            except Exception as exc:
                logger.debug(f"CVE normalize 跳过: {exc}")
        return results

    # ------------------------------------------------------------------
    async def _fetch_json(self, url: str) -> Optional[dict]:
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(None, self._sync_get, url)
        except Exception as exc:
            logger.warning(f"CVE API 请求失败 ({url}): {exc}")
            return None

    def _sync_get(self, url: str) -> dict:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "secbot/1.0")
        with urllib.request.urlopen(req, timeout=self._timeout) as resp:
            return json.loads(resp.read().decode())

    # ------------------------------------------------------------------
    def _normalize(self, data: dict) -> Optional[UnifiedVuln]:
        meta = data.get("cveMetadata", {})
        cve_id = meta.get("cveId", "")
        if not cve_id:
            return None

        cna = data.get("containers", {}).get("cna", {})
        descriptions = cna.get("descriptions", [])
        desc = descriptions[0].get("value", "") if descriptions else ""

        # CVSS
        cvss_score, cvss_vector, severity = None, None, VulnSeverity.UNKNOWN
        for metric in cna.get("metrics", []):
            cvss_data = (
                metric.get("cvssV3_1")
                or metric.get("cvssV3_0")
                or metric.get("cvssV2_0")
            )
            if cvss_data:
                cvss_score = cvss_data.get("baseScore")
                cvss_vector = cvss_data.get("vectorString")
                sev_str = (cvss_data.get("baseSeverity") or "").upper()
                severity = _SEVERITY_MAP.get(sev_str, VulnSeverity.UNKNOWN)
                break

        # 受影响产品
        products: List[AffectedProduct] = []
        for a in cna.get("affected", []):
            products.append(
                AffectedProduct(
                    vendor=a.get("vendor", ""),
                    product=a.get("product", ""),
                    versions=[
                        v.get("version", "") for v in a.get("versions", [])[:10]
                    ],
                )
            )

        # 引用
        refs = [r.get("url", "") for r in cna.get("references", [])[:10] if r.get("url")]

        # 日期
        date_pub = None
        raw_date = meta.get("datePublished", "")
        if raw_date:
            try:
                date_pub = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
            except Exception:
                pass

        return UnifiedVuln(
            vuln_id=cve_id,
            source=VulnSource.CVE,
            title=cve_id,
            description=desc[:2000],
            affected_software=products,
            severity=severity,
            cvss_score=cvss_score,
            cvss_vector=cvss_vector,
            references=refs,
            date_published=date_pub,
            state=meta.get("state", ""),
            raw_data=data,
        )
