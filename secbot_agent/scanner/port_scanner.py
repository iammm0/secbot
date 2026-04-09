"""
端口扫描器：基于 TCP connect 的端口扫描
"""
import asyncio
import socket
from typing import Dict, List, Optional

# 常见端口
COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 5432, 8080, 8443]
# 全端口扫描的常用子集（避免过多）
FULL_SCAN_PORTS = list(range(1, 1025)) + [3306, 5432, 6379, 8080, 8443, 27017]


class PortScanner:
    """端口扫描器"""

    def __init__(self, timeout: float = 1.0):
        self.timeout = timeout

    async def _check_port(self, host: str, port: int) -> bool:
        """检查单个端口是否开放"""
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=self.timeout,
            )
            writer.close()
            await writer.wait_closed()
            return True
        except (OSError, asyncio.TimeoutError, ConnectionRefusedError):
            return False

    async def scan_host(
        self, host: str, ports: Optional[List[int]] = None
    ) -> Dict:
        """扫描指定端口列表"""
        ports = ports or COMMON_PORTS
        tasks = [self._check_port(host, p) for p in ports]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        open_ports = []
        for port, ok in zip(ports, results):
            is_open = ok if isinstance(ok, bool) else False
            open_ports.append({
                "port": port,
                "open": is_open,
                "status": "open" if is_open else "closed",
            })

        return {
            "host": host,
            "ports": open_ports,
            "open_count": sum(1 for p in open_ports if p["open"]),
        }

    async def quick_scan(self, host: str) -> Dict:
        """快速扫描：仅常见端口"""
        return await self.scan_host(host, COMMON_PORTS)

    async def full_scan(self, host: str) -> Dict:
        """完整扫描：扩展端口范围"""
        return await self.scan_host(host, FULL_SCAN_PORTS)
