"""端口扫描工具"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class PortScanTool(BaseTool):
    """端口扫描工具：扫描目标主机的开放端口"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="port_scan",
            description="扫描目标主机的开放端口。参数: host(目标IP/域名), scan_type(quick/full, 默认quick), ports(可选, 指定端口列表)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        from scanner.port_scanner import PortScanner

        host = kwargs.get("host", "")
        if not host:
            return ToolResult(success=False, result=None, error="缺少参数: host")

        scan_type = kwargs.get("scan_type", "quick")
        ports = kwargs.get("ports")

        try:
            scanner = PortScanner()
            if scan_type == "full":
                result = await scanner.full_scan(host)
            elif ports:
                result = await scanner.scan_host(host, ports=ports)
            else:
                result = await scanner.quick_scan(host)
            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "host": {"type": "string", "description": "目标主机 IP 或域名", "required": True},
                "scan_type": {"type": "string", "description": "扫描类型: quick / full", "default": "quick"},
                "ports": {"type": "array", "description": "指定端口列表（可选）"},
            },
        }
