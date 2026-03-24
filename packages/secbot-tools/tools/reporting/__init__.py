"""
报告工具包：安全报告生成与导出
"""
from tools.reporting.report_generator_tool import ReportGeneratorTool

REPORTING_TOOLS = [
    ReportGeneratorTool(),
]

__all__ = [
    "ReportGeneratorTool",
    "REPORTING_TOOLS",
]
