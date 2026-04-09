"""完整防御扫描工具：对本机执行全面安全审计"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class DefenseScanTool(BaseTool):
    """完整防御扫描工具：综合安全自检（系统漏洞+网络分析+入侵检测+报告生成）"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="defense_scan",
            description="对本机执行完整安全自检（系统漏洞扫描+网络连接分析+入侵检测+综合报告）。无需参数。",
        )

    async def execute(self, **kwargs) -> ToolResult:
        try:
            from secbot_agent.defense.defense_manager import DefenseManager

            manager = DefenseManager(auto_response=False)
            report = await manager.full_scan()

            # 提取关键信息，避免结果过大
            summary = {
                "report_id": report.get("report_id"),
                "generated_at": report.get("generated_at"),
                "summary": report.get("summary"),
                "vulnerabilities": {
                    "total": report.get("vulnerabilities", {}).get("total", 0),
                    "by_severity": report.get("vulnerabilities", {}).get("by_severity", {}),
                },
                "network": {
                    "total_connections": report.get("network_analysis", {}).get("total_connections", 0),
                    "suspicious_count": report.get("network_analysis", {}).get("suspicious_connections", 0),
                },
                "attacks_detected": report.get("detected_attacks", {}).get("total", 0),
                "recommendations": report.get("recommendations", []),
            }

            return ToolResult(success=True, result=summary)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {},
        }
