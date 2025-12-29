"""
服务识别器
"""
import asyncio
import httpx
from typing import Dict, Optional, List
from utils.logger import logger


class ServiceDetector:
    """服务识别器：识别运行的服务和版本"""
    
    def __init__(self, timeout: float = 5.0):
        self.timeout = timeout
        self.service_signatures = {
            21: "FTP",
            22: "SSH",
            23: "Telnet",
            25: "SMTP",
            53: "DNS",
            80: "HTTP",
            110: "POP3",
            135: "MSRPC",
            139: "NetBIOS",
            143: "IMAP",
            443: "HTTPS",
            445: "SMB",
            993: "IMAPS",
            995: "POP3S",
            1723: "PPTP",
            3306: "MySQL",
            3389: "RDP",
            5900: "VNC",
            8080: "HTTP-Proxy",
            8443: "HTTPS-Alt"
        }
    
    async def detect_service(self, host: str, port: int) -> Dict:
        """检测服务类型和版本"""
        service_name = self.service_signatures.get(port, "Unknown")
        
        result = {
            "host": host,
            "port": port,
            "service": service_name,
            "version": None,
            "banner": None,
            "vulnerabilities": []
        }
        
        # 根据端口类型进行特定检测
        if port in [80, 8080, 443, 8443]:
            result.update(await self._detect_web_service(host, port))
        elif port == 22:
            result.update(await self._detect_ssh(host, port))
        elif port == 3306:
            result.update(await self._detect_mysql(host, port))
        elif port == 3389:
            result.update(await self._detect_rdp(host, port))
        
        return result
    
    async def _detect_web_service(self, host: str, port: int) -> Dict:
        """检测Web服务"""
        protocol = "https" if port in [443, 8443] else "http"
        url = f"{protocol}://{host}:{port}"
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
                response = await client.get(url, follow_redirects=True)
                
                server_header = response.headers.get("Server", "")
                x_powered_by = response.headers.get("X-Powered-By", "")
                
                return {
                    "version": server_header or x_powered_by or "Unknown",
                    "banner": f"HTTP/{response.http_version} {response.status_code}",
                    "headers": dict(response.headers)
                }
        except Exception as e:
            logger.debug(f"检测Web服务失败 {host}:{port}: {e}")
            return {}
    
    async def _detect_ssh(self, host: str, port: int) -> Dict:
        """检测SSH服务"""
        import socket
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2.0)
            sock.connect((host, port))
            
            banner = sock.recv(1024).decode('utf-8', errors='ignore')
            sock.close()
            
            if banner.startswith("SSH-"):
                version = banner.strip().split()[1] if len(banner.split()) > 1 else "Unknown"
                return {
                    "version": version,
                    "banner": banner.strip()
                }
        except Exception as e:
            logger.debug(f"检测SSH失败 {host}:{port}: {e}")
        return {}
    
    async def _detect_mysql(self, host: str, port: int) -> Dict:
        """检测MySQL服务"""
        # 这里可以集成mysql-connector或使用socket直接连接
        # 简化实现
        return {
            "version": "Unknown",
            "banner": "MySQL detected"
        }
    
    async def _detect_rdp(self, host: str, port: int) -> Dict:
        """检测RDP服务"""
        # RDP检测需要特定的协议握手
        return {
            "version": "Unknown",
            "banner": "RDP detected"
        }
    
    async def detect_all_services(self, host: str, ports: List[int]) -> List[Dict]:
        """检测多个端口的服务"""
        results = []
        for port in ports:
            result = await self.detect_service(host, port)
            results.append(result)
        return results

