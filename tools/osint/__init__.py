"""
OSINT 情报工具包：Shodan 查询、VirusTotal 检测、证书透明度查询、凭据泄露检查
"""
from tools.osint.shodan_query_tool import ShodanQueryTool
from tools.osint.virustotal_tool import VirusTotalTool
from tools.osint.cert_transparency_tool import CertTransparencyTool
from tools.osint.credential_leak_tool import CredentialLeakTool

OSINT_TOOLS = [
    ShodanQueryTool(),
    VirusTotalTool(),
    CertTransparencyTool(),
    CredentialLeakTool(),
]

__all__ = [
    "ShodanQueryTool", "VirusTotalTool", "CertTransparencyTool", "CredentialLeakTool",
    "OSINT_TOOLS",
]
