"""VirusTotal 检测工具：查询 IP / 域名 / URL / 文件哈希的恶意检测结果"""
import asyncio
import json
from typing import Any, Dict
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from tools.base import BaseTool, ToolResult


class VirusTotalTool(BaseTool):
    """VirusTotal 恶意检测工具"""

    sensitivity = "low"

    _TYPE_PATH = {
        "ip": "ip_addresses",
        "domain": "domains",
        "url": "urls",
        "hash": "files",
    }

    def __init__(self):
        super().__init__(
            name="virustotal_check",
            description=(
                "通过 VirusTotal 查询 IP / 域名 / URL / 文件哈希的恶意检测结果。"
                "参数: target(查询对象), type(ip/domain/url/hash)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        target = kwargs.get("target", "").strip()
        scan_type = kwargs.get("type", "").strip().lower()

        if not target:
            return ToolResult(success=False, result=None, error="缺少参数: target")
        if scan_type not in self._TYPE_PATH:
            return ToolResult(
                success=False, result=None,
                error=f"参数 type 无效，可选值: {list(self._TYPE_PATH.keys())}",
            )

        from hackbot_config import settings
        api_key = getattr(settings, "virustotal_api_key", "") or ""
        if not api_key:
            return ToolResult(success=False, result=None, error="未配置 VIRUSTOTAL_API_KEY，请在 .env 中设置")

        try:
            loop = asyncio.get_event_loop()
            resource = target
            # URL 需要 base64 编码（VT v3 API 要求）
            if scan_type == "url":
                import base64
                resource = base64.urlsafe_b64encode(target.encode()).decode().rstrip("=")

            path = self._TYPE_PATH[scan_type]
            url = f"https://www.virustotal.com/api/v3/{path}/{resource}"

            def _fetch():
                req = Request(url)
                req.add_header("x-apikey", api_key)
                req.add_header("Accept", "application/json")
                with urlopen(req, timeout=20) as resp:
                    return json.loads(resp.read().decode())

            data = await loop.run_in_executor(None, _fetch)
            attrs = data.get("data", {}).get("attributes", {})

            # 提取通用检测信息
            stats = attrs.get("last_analysis_stats", {})
            result = {
                "target": target,
                "type": scan_type,
                "reputation": attrs.get("reputation"),
                "analysis_stats": stats,
                "malicious": stats.get("malicious", 0),
                "suspicious": stats.get("suspicious", 0),
                "harmless": stats.get("harmless", 0),
                "undetected": stats.get("undetected", 0),
                "tags": attrs.get("tags", []),
            }

            # 类型特定字段
            if scan_type == "ip":
                result["country"] = attrs.get("country")
                result["as_owner"] = attrs.get("as_owner")
                result["network"] = attrs.get("network")
            elif scan_type == "domain":
                result["registrar"] = attrs.get("registrar")
                result["creation_date"] = attrs.get("creation_date")
                result["whois"] = (attrs.get("whois") or "")[:500]
            elif scan_type == "hash":
                result["file_type"] = attrs.get("type_description")
                result["size"] = attrs.get("size")
                result["names"] = attrs.get("names", [])[:10]
                result["sha256"] = attrs.get("sha256")

            return ToolResult(success=True, result=result)

        except HTTPError as e:
            if e.code == 404:
                return ToolResult(success=True, result={"target": target, "type": scan_type, "message": "未在 VirusTotal 数据库中找到该目标"})
            return ToolResult(success=False, result=None, error=f"VirusTotal API 错误 ({e.code}): {e.reason}")
        except Exception as e:
            return ToolResult(success=False, result=None, error=f"VirusTotal 查询失败: {e}")

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "target": {"type": "string", "description": "查询目标（IP / 域名 / URL / 文件哈希）", "required": True},
                "type": {"type": "string", "description": "目标类型: ip / domain / url / hash", "required": True},
            },
        }
