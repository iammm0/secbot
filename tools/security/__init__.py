"""
安全工具包
将 scanner/、exploit/ 模块包装为标准 BaseTool，供 ReAct 引擎调用。
每个工具带有 sensitivity 属性（low / high），superhackbot 对 high 级别要求用户确认。
"""
from tools.security.port_scan_tool import PortScanTool
from tools.security.service_detect_tool import ServiceDetectTool
from tools.security.vuln_scan_tool import VulnScanTool
from tools.security.recon_tool import ReconTool
from tools.security.attack_test_tool import AttackTestTool
from tools.security.exploit_tool import ExploitTool

# 基础工具（hackbot + superhackbot 都可用）
BASIC_SECURITY_TOOLS = [
    PortScanTool(),
    ServiceDetectTool(),
    VulnScanTool(),
    ReconTool(),
]

# 高级工具（仅 superhackbot 可用，需用户确认）
ADVANCED_SECURITY_TOOLS = [
    AttackTestTool(),
    ExploitTool(),
]

# 全部安全工具
ALL_SECURITY_TOOLS = BASIC_SECURITY_TOOLS + ADVANCED_SECURITY_TOOLS

__all__ = [
    "PortScanTool", "ServiceDetectTool", "VulnScanTool", "ReconTool",
    "AttackTestTool", "ExploitTool",
    "BASIC_SECURITY_TOOLS", "ADVANCED_SECURITY_TOOLS", "ALL_SECURITY_TOOLS",
]
