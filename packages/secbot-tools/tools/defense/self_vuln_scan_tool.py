"""本机漏洞自检工具：扫描当前主机的安全漏洞"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class SelfVulnScanTool(BaseTool):
    """本机漏洞自检工具：检测本机的系统漏洞、网络漏洞、应用漏洞"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="self_vuln_scan",
            description="扫描本机安全漏洞（系统更新、密码策略、不必要服务、文件权限、开放端口、防火墙状态、应用漏洞等）。参数: scan_type(system/network/application/all, 默认all)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        scan_type = kwargs.get("scan_type", "all").lower()

        try:
            from defense.vulnerability_scanner import SelfVulnerabilityScanner

            scanner = SelfVulnerabilityScanner()
            vulnerabilities = []

            if scan_type in ("system", "all"):
                vulnerabilities.extend(scanner.scan_system_vulnerabilities())
            if scan_type in ("network", "all"):
                vulnerabilities.extend(scanner.scan_network_vulnerabilities())
            if scan_type in ("application", "all"):
                vulnerabilities.extend(scanner.scan_application_vulnerabilities())

            # 按严重程度分组
            by_severity = {}
            for v in vulnerabilities:
                sev = v.get("severity", "Unknown")
                by_severity.setdefault(sev, []).append(v)

            return ToolResult(
                success=True,
                result={
                    "scan_type": scan_type,
                    "total_vulnerabilities": len(vulnerabilities),
                    "by_severity": {k: len(v) for k, v in by_severity.items()},
                    "vulnerabilities": vulnerabilities,
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
                "scan_type": {
                    "type": "string",
                    "description": "扫描类型: system/network/application/all",
                    "default": "all",
                },
            },
        }
