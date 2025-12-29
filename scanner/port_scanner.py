"""
端口扫描器
"""
import asyncio
import socket
from typing import List, Dict, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor
from utils.logger import logger


class PortScanner:
    """端口扫描器"""
    
    def __init__(self, timeout: float = 1.0, max_workers: int = 100):
        self.timeout = timeout
        self.max_workers = max_workers
        self.common_ports = [
            21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445,
            993, 995, 1723, 3306, 3389, 5900, 8080, 8443
        ]
    
    async def scan_port(self, host: str, port: int) -> Tuple[int, bool, Optional[str]]:
        """扫描单个端口"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            result = sock.connect_ex((host, port))
            sock.close()
            
            if result == 0:
                # 尝试获取服务banner
                service = await self._get_service_banner(host, port)
                return (port, True, service)
            else:
                return (port, False, None)
        except Exception as e:
            logger.debug(f"扫描端口 {host}:{port} 时出错: {e}")
            return (port, False, None)
    
    async def _get_service_banner(self, host: str, port: int) -> Optional[str]:
        """获取服务banner"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.5)
            sock.connect((host, port))
            
            # 发送一些常见探测数据
            if port == 21:  # FTP
                sock.send(b"QUIT\r\n")
            elif port == 22:  # SSH
                sock.send(b"SSH-2.0-Client\r\n")
            elif port == 80 or port == 8080:  # HTTP
                sock.send(b"GET / HTTP/1.1\r\nHost: " + host.encode() + b"\r\n\r\n")
            elif port == 443 or port == 8443:  # HTTPS
                # SSL握手会返回服务信息
                pass
            
            banner = sock.recv(1024).decode('utf-8', errors='ignore').strip()
            sock.close()
            
            if banner:
                return banner[:100]  # 限制长度
        except:
            pass
        return None
    
    async def scan_host(self, host: str, ports: Optional[List[int]] = None) -> Dict:
        """扫描主机的端口"""
        if ports is None:
            ports = self.common_ports
        
        logger.info(f"开始扫描主机: {host}, 端口数: {len(ports)}")
        
        # 使用线程池并发扫描
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            tasks = [
                loop.run_in_executor(executor, lambda p=p: asyncio.run(self.scan_port(host, p)))
                for p in ports
            ]
            results = await asyncio.gather(*tasks)
        
        open_ports = []
        for port, is_open, service in results:
            if is_open:
                open_ports.append({
                    "port": port,
                    "service": service or "Unknown",
                    "status": "open"
                })
                logger.info(f"发现开放端口: {host}:{port} - {service or 'Unknown'}")
        
        return {
            "host": host,
            "total_ports": len(ports),
            "open_ports": len(open_ports),
            "ports": open_ports
        }
    
    async def scan_network(self, network: str, ports: Optional[List[int]] = None) -> List[Dict]:
        """扫描整个网络段"""
        # 解析网络段 (例如: 192.168.1.0/24)
        import ipaddress
        
        try:
            network_obj = ipaddress.ip_network(network, strict=False)
            hosts = [str(ip) for ip in network_obj.hosts()]
        except ValueError:
            logger.error(f"无效的网络地址: {network}")
            return []
        
        logger.info(f"开始扫描网络: {network}, 主机数: {len(hosts)}")
        
        results = []
        for host in hosts:
            result = await self.scan_host(host, ports)
            if result["open_ports"] > 0:
                results.append(result)
        
        return results
    
    async def quick_scan(self, host: str) -> Dict:
        """快速扫描（只扫描常见端口）"""
        return await self.scan_host(host, self.common_ports)
    
    async def full_scan(self, host: str) -> Dict:
        """全端口扫描（1-65535）"""
        all_ports = list(range(1, 65536))
        return await self.scan_host(host, all_ports)

