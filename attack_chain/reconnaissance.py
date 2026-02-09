"""
信息收集模块
"""
import asyncio
import socket
import httpx
from typing import Dict, Optional, List
from utils.logger import logger


class Reconnaissance:
    """信息收集工具"""
    
    def __init__(self):
        pass
    
    async def gather_info(self, target: str, options: Optional[Dict] = None) -> Dict:
        """收集目标信息"""
        logger.info(f"开始信息收集: {target}")
        
        info = {
            "target": target,
            "hostname": await self._get_hostname(target),
            "ip_address": await self._resolve_ip(target),
            "open_ports": await self._scan_ports(target),
            "services": await self._identify_services(target),
            "web_info": await self._gather_web_info(target),
            "dns_info": await self._gather_dns_info(target)
        }
        
        return {
            "success": True,
            "info": info
        }
    
    async def _get_hostname(self, target: str) -> Optional[str]:
        """获取主机名"""
        try:
            ip = await self._resolve_ip(target)
            if ip:
                hostname = socket.gethostbyaddr(ip)[0]
                return hostname
        except:
            pass
        return None
    
    async def _resolve_ip(self, target: str) -> Optional[str]:
        """解析IP地址"""
        try:
            # 移除协议前缀
            host = target.replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
            ip = socket.gethostbyname(host)
            return ip
        except:
            return None
    
    async def _scan_ports(self, target: str) -> List[Dict]:
        """扫描开放端口"""
        from scanner.port_scanner import PortScanner

        scanner = PortScanner()
        host = target.split(":")[0] if ":" in target else target.replace("http://", "").replace("https://", "").split("/")[0]

        # 扫描常见端口（PortScanner 使用 scan_host，返回 Dict 含 "ports" 列表）
        common_ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 5432, 8080]
        result = await scanner.scan_host(host, ports=common_ports)
        return result.get("ports", [])
    
    async def _identify_services(self, target: str) -> List[Dict]:
        """识别服务"""
        from scanner.service_detector import ServiceDetector
        
        detector = ServiceDetector()
        host = target.split(":")[0] if ":" in target else target.replace("http://", "").replace("https://", "").split("/")[0]
        
        services = []
        open_ports = await self._scan_ports(target)
        
        for port_info in open_ports:
            if port_info.get("open"):
                service = await detector.detect_service(host, port_info["port"])
                services.append(service)
        
        return services
    
    async def _gather_web_info(self, target: str) -> Dict:
        """收集Web信息"""
        if not target.startswith("http"):
            target = f"http://{target}"
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(target)
                
                return {
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "server": response.headers.get("Server", "Unknown"),
                    "technologies": self._detect_technologies(response),
                    "title": self._extract_title(response.text)
                }
        except:
            return {}
    
    def _detect_technologies(self, response) -> List[str]:
        """检测使用的技术"""
        technologies = []
        headers = response.headers
        
        if "X-Powered-By" in headers:
            technologies.append(headers["X-Powered-By"])
        if "Server" in headers:
            technologies.append(headers["Server"])
        
        # 检测框架
        if "wp-content" in response.text:
            technologies.append("WordPress")
        if "drupal" in response.text.lower():
            technologies.append("Drupal")
        if "laravel_session" in response.text:
            technologies.append("Laravel")
        
        return technologies
    
    def _extract_title(self, html: str) -> Optional[str]:
        """提取页面标题"""
        import re
        match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
        if match:
            return match.group(1)
        return None
    
    async def _gather_dns_info(self, target: str) -> Dict:
        """收集DNS信息"""
        import socket
        
        host = target.replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
        
        try:
            ip = socket.gethostbyname(host)
            hostname = socket.gethostbyaddr(ip)[0]
            
            return {
                "ip": ip,
                "hostname": hostname
            }
        except:
            return {}

