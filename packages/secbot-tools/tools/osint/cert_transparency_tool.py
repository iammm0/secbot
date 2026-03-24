"""证书透明度查询工具：通过 crt.sh 查询域名的 SSL 证书记录，发现子域名"""
import asyncio
import json
from typing import Any, Dict
from urllib.request import Request, urlopen
from urllib.parse import quote
from tools.base import BaseTool, ToolResult


class CertTransparencyTool(BaseTool):
    """证书透明度日志查询工具（crt.sh）"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="cert_transparency",
            description=(
                "通过证书透明度日志（crt.sh）查询域名的所有 SSL 证书记录，"
                "可用于发现子域名和历史证书。参数: domain(目标域名)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        domain = kwargs.get("domain", "").strip()
        if not domain:
            return ToolResult(success=False, result=None, error="缺少参数: domain")

        try:
            loop = asyncio.get_event_loop()
            url = f"https://crt.sh/?q=%25.{quote(domain)}&output=json"

            def _fetch():
                req = Request(url)
                req.add_header("User-Agent", "Mozilla/5.0 (HackBot Security Scanner)")
                with urlopen(req, timeout=30) as resp:
                    return json.loads(resp.read().decode())

            data = await loop.run_in_executor(None, _fetch)

            # 提取唯一子域名
            subdomains = set()
            certs = []
            for entry in data:
                name_value = entry.get("name_value", "")
                for name in name_value.split("\n"):
                    name = name.strip().lower()
                    if name and "*" not in name:
                        subdomains.add(name)
                if len(certs) < 50:
                    certs.append({
                        "id": entry.get("id"),
                        "common_name": entry.get("common_name"),
                        "name_value": name_value,
                        "issuer": entry.get("issuer_name"),
                        "not_before": entry.get("not_before"),
                        "not_after": entry.get("not_after"),
                    })

            sorted_subs = sorted(subdomains)
            return ToolResult(
                success=True,
                result={
                    "domain": domain,
                    "total_certs": len(data),
                    "unique_subdomains_count": len(sorted_subs),
                    "subdomains": sorted_subs[:200],
                    "recent_certs": certs[:20],
                },
            )

        except Exception as e:
            return ToolResult(success=False, result=None, error=f"证书透明度查询失败: {e}")

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "domain": {"type": "string", "description": "目标域名（如 example.com）", "required": True},
            },
        }
