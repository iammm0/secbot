"""
实用工具包：哈希计算、编码解码、IP 地理位置、文件分析、CVE 查询、日志分析、
           密码审计、敏感信息扫描、依赖漏洞审计、Payload 生成
"""
from tools.utility.hash_tool import HashTool
from tools.utility.encode_decode_tool import EncodeDecodeTool
from tools.utility.ip_geo_tool import IpGeoTool
from tools.utility.file_analyze_tool import FileAnalyzeTool
from tools.utility.cve_lookup_tool import CveLookupTool
from tools.utility.log_analyze_tool import LogAnalyzeTool
from tools.utility.password_audit_tool import PasswordAuditTool
from tools.utility.secret_scanner_tool import SecretScannerTool
from tools.utility.dependency_audit_tool import DependencyAuditTool
from tools.utility.payload_generator_tool import PayloadGeneratorTool

UTILITY_TOOLS = [
    HashTool(),
    EncodeDecodeTool(),
    IpGeoTool(),
    FileAnalyzeTool(),
    CveLookupTool(),
    LogAnalyzeTool(),
    PasswordAuditTool(),
    SecretScannerTool(),
    DependencyAuditTool(),
    PayloadGeneratorTool(),
]

__all__ = [
    "HashTool", "EncodeDecodeTool", "IpGeoTool",
    "FileAnalyzeTool", "CveLookupTool", "LogAnalyzeTool",
    "PasswordAuditTool", "SecretScannerTool", "DependencyAuditTool",
    "PayloadGeneratorTool",
    "UTILITY_TOOLS",
]
