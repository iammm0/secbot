"""
实用工具包：哈希计算、编码解码、IP 地理位置、文件分析、CVE 查询、日志分析
"""
from tools.utility.hash_tool import HashTool
from tools.utility.encode_decode_tool import EncodeDecodeTool
from tools.utility.ip_geo_tool import IpGeoTool
from tools.utility.file_analyze_tool import FileAnalyzeTool
from tools.utility.cve_lookup_tool import CveLookupTool
from tools.utility.log_analyze_tool import LogAnalyzeTool

UTILITY_TOOLS = [
    HashTool(),
    EncodeDecodeTool(),
    IpGeoTool(),
    FileAnalyzeTool(),
    CveLookupTool(),
    LogAnalyzeTool(),
]

__all__ = [
    "HashTool", "EncodeDecodeTool", "IpGeoTool",
    "FileAnalyzeTool", "CveLookupTool", "LogAnalyzeTool",
    "UTILITY_TOOLS",
]
