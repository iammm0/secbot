"""
服务识别器：识别端口上运行的服务
"""
import asyncio
from typing import Dict, List, Optional

# 端口到服务的映射
PORT_SERVICES = {
    21: "ftp",
    22: "ssh",
    23: "telnet",
    25: "smtp",
    53: "dns",
    80: "http",
    110: "pop3",
    143: "imap",
    443: "https",
    445: "smb",
    3306: "mysql",
    3389: "rdp",
    5432: "postgresql",
    6379: "redis",
    8080: "http",
    8443: "https",
    27017: "mongodb",
}


class ServiceDetector:
    """服务识别器"""

    async def detect_service(self, host: str, port: int) -> Dict:
        """识别单个端口的服务"""
        service = PORT_SERVICES.get(port, "unknown")
        return {
            "port": port,
            "service": service,
            "name": service.upper(),
            "version": None,
        }

    async def detect_all_services(self, host: str) -> Dict:
        """识别主机上所有常见端口的服务"""
        from secbot_agent.scanner.port_scanner import PortScanner

        scanner = PortScanner()
        result = await scanner.quick_scan(host)
        open_ports = [p["port"] for p in result.get("ports", []) if p.get("open")]

        services = []
        for port in open_ports:
            svc = await self.detect_service(host, port)
            services.append(svc)

        return {"host": host, "services": services}
