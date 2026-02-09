"""WHOIS 查询工具：查询域名或 IP 的注册信息"""
import asyncio
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class WhoisTool(BaseTool):
    """WHOIS 查询工具：获取域名或 IP 的注册、所有者等信息"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="whois_lookup",
            description="查询域名或IP的WHOIS注册信息（注册人、注册时间、到期时间、NS等）。参数: target(域名或IP)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        target = kwargs.get("target", "")
        if not target:
            return ToolResult(success=False, result=None, error="缺少参数: target")

        try:
            # 尝试使用 python-whois 库
            try:
                import whois as pywhois
                w = pywhois.whois(target)
                info = {
                    "domain_name": w.domain_name,
                    "registrar": w.registrar,
                    "creation_date": str(w.creation_date) if w.creation_date else None,
                    "expiration_date": str(w.expiration_date) if w.expiration_date else None,
                    "updated_date": str(w.updated_date) if w.updated_date else None,
                    "name_servers": w.name_servers,
                    "status": w.status,
                    "emails": w.emails,
                    "org": w.org,
                    "country": w.country,
                }
                return ToolResult(success=True, result={"target": target, "whois": info})
            except ImportError:
                pass

            # Fallback: 系统 whois 命令
            proc = await asyncio.create_subprocess_exec(
                "whois", target,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=15)
            output = stdout.decode(errors="ignore").strip()
            if not output:
                output = stderr.decode(errors="ignore").strip()

            # 简单解析
            parsed = {}
            for line in output.split("\n"):
                if ":" in line and not line.strip().startswith("%"):
                    key, _, val = line.partition(":")
                    key = key.strip().lower().replace(" ", "_")
                    val = val.strip()
                    if key and val:
                        parsed[key] = val

            return ToolResult(
                success=True,
                result={"target": target, "whois": parsed, "raw": output[:2000]},
            )
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "target": {"type": "string", "description": "目标域名或 IP", "required": True},
            },
        }
