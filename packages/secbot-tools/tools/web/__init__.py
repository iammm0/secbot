"""
Web 安全工具包：目录枚举、WAF 检测、技术栈识别、安全头分析、CORS 检查、JWT 分析、
             参数 Fuzzer、SSRF 检测
"""
from tools.web.dir_bruteforce_tool import DirBruteforceTool
from tools.web.waf_detect_tool import WafDetectTool
from tools.web.tech_detect_tool import TechDetectTool
from tools.web.header_analyze_tool import HeaderAnalyzeTool
from tools.web.cors_check_tool import CorsCheckTool
from tools.web.jwt_analyze_tool import JwtAnalyzeTool
from tools.web.param_fuzzer_tool import ParamFuzzerTool
from tools.web.ssrf_detect_tool import SsrfDetectTool

WEB_TOOLS = [
    DirBruteforceTool(),
    WafDetectTool(),
    TechDetectTool(),
    HeaderAnalyzeTool(),
    CorsCheckTool(),
    JwtAnalyzeTool(),
    ParamFuzzerTool(),
    SsrfDetectTool(),
]

__all__ = [
    "DirBruteforceTool", "WafDetectTool", "TechDetectTool",
    "HeaderAnalyzeTool", "CorsCheckTool", "JwtAnalyzeTool",
    "ParamFuzzerTool", "SsrfDetectTool",
    "WEB_TOOLS",
]
