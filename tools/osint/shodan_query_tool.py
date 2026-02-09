"""Shodan 查询工具：通过 Shodan API 查询目标 IP 的开放端口、服务、漏洞等信息"""
import asyncio
import json
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class ShodanQueryTool(BaseTool):
    """Shodan OSINT 情报查询工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="shodan_query",
            description=(
                "通过 Shodan 查询目标 IP 的开放端口、服务、漏洞及地理位置等情报。"
                "参数: target(IP 地址，可选) 或 query(Shodan 搜索语法，可选)，至少提供一个。"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        target = kwargs.get("target", "").strip()
        query = kwargs.get("query", "").strip()

        if not target and not query:
            return ToolResult(success=False, result=None, error="缺少参数: 请提供 target(IP) 或 query(搜索语法)")

        try:
            import shodan as shodan_lib
        except ImportError:
            return ToolResult(
                success=False, result=None,
                error="缺少依赖: pip install shodan",
            )

        from config import settings
        api_key = getattr(settings, "shodan_api_key", "") or ""
        if not api_key:
            return ToolResult(success=False, result=None, error="未配置 SHODAN_API_KEY，请在 .env 中设置")

        try:
            api = shodan_lib.Shodan(api_key)
            loop = asyncio.get_event_loop()

            if target:
                # 查询指定 IP
                def _host():
                    return api.host(target)

                info = await loop.run_in_executor(None, _host)
                result = {
                    "ip": info.get("ip_str"),
                    "org": info.get("org"),
                    "os": info.get("os"),
                    "country": info.get("country_name"),
                    "city": info.get("city"),
                    "ports": info.get("ports", []),
                    "vulns": info.get("vulns", []),
                    "hostnames": info.get("hostnames", []),
                    "services": [],
                }
                for item in info.get("data", [])[:20]:
                    result["services"].append({
                        "port": item.get("port"),
                        "transport": item.get("transport"),
                        "product": item.get("product"),
                        "version": item.get("version"),
                        "banner": (item.get("data") or "")[:200],
                    })
                return ToolResult(success=True, result=result)
            else:
                # 搜索模式
                def _search():
                    return api.search(query, limit=20)

                results = await loop.run_in_executor(None, _search)
                matches = []
                for m in results.get("matches", []):
                    matches.append({
                        "ip": m.get("ip_str"),
                        "port": m.get("port"),
                        "org": m.get("org"),
                        "product": m.get("product"),
                        "hostnames": m.get("hostnames", []),
                        "banner": (m.get("data") or "")[:200],
                    })
                return ToolResult(
                    success=True,
                    result={"query": query, "total": results.get("total", 0), "matches": matches},
                )
        except Exception as e:
            return ToolResult(success=False, result=None, error=f"Shodan 查询失败: {e}")

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "target": {"type": "string", "description": "目标 IP 地址（与 query 二选一）", "required": False},
                "query": {"type": "string", "description": "Shodan 搜索语法（与 target 二选一）", "required": False},
            },
        }
