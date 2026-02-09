"""IP 地理位置查询工具"""
import asyncio
import json
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class IpGeoTool(BaseTool):
    """IP 地理位置查询工具：查询 IP 的地理位置、ISP、AS 等信息"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="ip_geolocation",
            description="查询IP地址的地理位置信息（国家、城市、ISP、AS号、经纬度等）。参数: ip(目标IP, 留空查自己的公网IP)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        ip = kwargs.get("ip", "")

        try:
            import urllib.request

            # 使用免费的 ip-api.com
            url = f"http://ip-api.com/json/{ip}" if ip else "http://ip-api.com/json/"

            loop = asyncio.get_event_loop()

            def _fetch():
                req = urllib.request.Request(url)
                req.add_header("User-Agent", "hackbot/1.0")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    return json.loads(resp.read().decode())

            data = await loop.run_in_executor(None, _fetch)

            if data.get("status") == "fail":
                return ToolResult(success=False, result=None, error=data.get("message", "查询失败"))

            result = {
                "ip": data.get("query"),
                "country": data.get("country"),
                "country_code": data.get("countryCode"),
                "region": data.get("regionName"),
                "city": data.get("city"),
                "zip": data.get("zip"),
                "latitude": data.get("lat"),
                "longitude": data.get("lon"),
                "timezone": data.get("timezone"),
                "isp": data.get("isp"),
                "org": data.get("org"),
                "as_number": data.get("as"),
            }

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "ip": {"type": "string", "description": "目标 IP（留空查自己的公网 IP）"},
            },
        }
