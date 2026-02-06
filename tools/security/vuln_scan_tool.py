"""漏洞扫描工具"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class VulnScanTool(BaseTool):
    """漏洞扫描工具：检测目标主机上的常见漏洞"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="vuln_scan",
            description="检测目标的常见漏洞（SQL注入、XSS、目录遍历、敏感文件等）。参数: host(目标), port(端口), service(服务类型: http/ssh/ftp)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        from scanner.vulnerability_scanner import VulnerabilityScanner

        host = kwargs.get("host", "")
        port = kwargs.get("port", 80)
        service = kwargs.get("service", "http")

        if not host:
            return ToolResult(success=False, result=None, error="缺少参数: host")

        try:
            scanner = VulnerabilityScanner()
            vulns = await scanner.scan_vulnerabilities(host, int(port), service)
            return ToolResult(
                success=True,
                result={
                    "host": host,
                    "port": port,
                    "service": service,
                    "vulnerabilities": vulns,
                    "count": len(vulns),
                },
            )
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "host": {"type": "string", "description": "目标主机", "required": True},
                "port": {"type": "integer", "description": "端口号", "default": 80},
                "service": {"type": "string", "description": "服务类型 (http/ssh/ftp)", "default": "http"},
            },
        }
