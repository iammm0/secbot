"""CVE 漏洞查询工具：查询 CVE 漏洞详情"""
import asyncio
import json
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class CveLookupTool(BaseTool):
    """CVE 漏洞查询工具：通过 CVE ID 或关键词查询漏洞详情"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="cve_lookup",
            description="查询CVE漏洞信息（CVSS评分、描述、影响产品、修复建议等）。参数: cve_id(CVE编号如CVE-2021-44228), keyword(关键词搜索), product(产品名称搜索)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        cve_id = kwargs.get("cve_id", "")
        keyword = kwargs.get("keyword", "")
        product = kwargs.get("product", "")

        try:
            import urllib.request

            loop = asyncio.get_event_loop()

            if cve_id:
                return await self._lookup_by_id(cve_id, loop)
            elif keyword or product:
                return await self._search(keyword or product, loop)
            else:
                return ToolResult(success=False, result=None, error="需要 cve_id、keyword 或 product 参数")

        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    async def _lookup_by_id(self, cve_id: str, loop) -> ToolResult:
        """通过 CVE ID 查询"""
        url = f"https://cveawg.mitre.org/api/cve/{cve_id}"

        def _fetch():
            req = urllib.request.Request(url)
            req.add_header("User-Agent", "secbot-cli/1.0")
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())

        try:
            data = await loop.run_in_executor(None, _fetch)

            cna = data.get("containers", {}).get("cna", {})
            descriptions = cna.get("descriptions", [])
            desc_text = descriptions[0].get("value", "") if descriptions else ""

            metrics = cna.get("metrics", [])
            cvss = None
            if metrics:
                cvss_data = metrics[0].get("cvssV3_1") or metrics[0].get("cvssV3_0") or metrics[0].get("cvssV2_0")
                if cvss_data:
                    cvss = {
                        "score": cvss_data.get("baseScore"),
                        "severity": cvss_data.get("baseSeverity"),
                        "vector": cvss_data.get("vectorString"),
                    }

            affected = cna.get("affected", [])
            products = []
            for a in affected:
                products.append({
                    "vendor": a.get("vendor"),
                    "product": a.get("product"),
                    "versions": [v.get("version", "") for v in a.get("versions", [])[:5]],
                })

            references = [r.get("url") for r in cna.get("references", [])[:5]]

            result = {
                "cve_id": cve_id,
                "description": desc_text[:1000],
                "cvss": cvss,
                "affected_products": products,
                "references": references,
                "state": data.get("cveMetadata", {}).get("state"),
                "date_published": data.get("cveMetadata", {}).get("datePublished"),
            }

            return ToolResult(success=True, result=result)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return ToolResult(success=False, result=None, error=f"未找到 {cve_id}")
            raise

    async def _search(self, keyword: str, loop) -> ToolResult:
        """关键词搜索"""
        import urllib.parse
        url = f"https://cveawg.mitre.org/api/cve?keyword={urllib.parse.quote(keyword)}&limit=10"

        def _fetch():
            req = urllib.request.Request(url)
            req.add_header("User-Agent", "secbot-cli/1.0")
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())

        try:
            data = await loop.run_in_executor(None, _fetch)
            cves = data.get("cves", data) if isinstance(data, dict) else data

            results = []
            items = cves if isinstance(cves, list) else []
            for item in items[:10]:
                meta = item.get("cveMetadata", {})
                cna = item.get("containers", {}).get("cna", {})
                descs = cna.get("descriptions", [])
                results.append({
                    "cve_id": meta.get("cveId"),
                    "state": meta.get("state"),
                    "description": descs[0].get("value", "")[:200] if descs else "",
                })

            return ToolResult(
                success=True,
                result={"keyword": keyword, "count": len(results), "cves": results},
            )
        except Exception as e:
            return ToolResult(success=False, result=None, error=f"搜索失败: {e}")

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "cve_id": {"type": "string", "description": "CVE 编号（如 CVE-2021-44228）"},
                "keyword": {"type": "string", "description": "关键词搜索"},
                "product": {"type": "string", "description": "产品名称搜索"},
            },
        }
