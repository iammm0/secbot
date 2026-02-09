"""
防御工具包：安全自检、漏洞扫描、网络分析、入侵检测、系统信息收集
"""
from tools.defense.defense_scan_tool import DefenseScanTool
from tools.defense.self_vuln_scan_tool import SelfVulnScanTool
from tools.defense.network_analyze_tool import NetworkAnalyzeTool
from tools.defense.intrusion_detect_tool import IntrusionDetectTool
from tools.defense.system_info_tool import SystemInfoTool

DEFENSE_TOOLS = [
    DefenseScanTool(),
    SelfVulnScanTool(),
    NetworkAnalyzeTool(),
    IntrusionDetectTool(),
    SystemInfoTool(),
]

__all__ = [
    "DefenseScanTool", "SelfVulnScanTool", "NetworkAnalyzeTool",
    "IntrusionDetectTool", "SystemInfoTool",
    "DEFENSE_TOOLS",
]
