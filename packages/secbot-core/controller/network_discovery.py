"""
内网发现模块：发现内网中的所有目标主机
"""
import ipaddress
import socket
import subprocess
import platform
import asyncio
from typing import List, Dict, Optional, Set
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from utils.logger import logger


class NetworkDiscovery:
    """内网发现器：扫描和发现内网中的主机"""
    
    def __init__(self, timeout: float = 1.0, max_workers: int = 100):
        self.timeout = timeout
        self.max_workers = max_workers
        self.discovered_hosts: List[Dict] = []
        self.scan_history: List[Dict] = []
    
    def get_local_network(self) -> Optional[str]:
        """获取本地网络段"""
        try:
            import psutil
            
            # 获取默认网关
            gateways = psutil.net_if_addrs()
            for interface_name, addresses in gateways.items():
                for addr in addresses:
                    if addr.family == socket.AF_INET:
                        ip = ipaddress.IPv4Address(addr.address)
                        # 计算网络段（假设/24）
                        network = ipaddress.IPv4Network(f"{ip}/{24}", strict=False)
                        return str(network)
        except Exception as e:
            logger.error(f"获取本地网络失败: {e}")
        
        return None
    
    async def ping_host(self, ip: str) -> bool:
        """Ping主机检测是否在线"""
        try:
            if platform.system() == "Windows":
                result = subprocess.run(
                    ["ping", "-n", "1", "-w", "1000", ip],
                    capture_output=True,
                    timeout=2
                )
                return result.returncode == 0
            else:
                result = subprocess.run(
                    ["ping", "-c", "1", "-W", "1", ip],
                    capture_output=True,
                    timeout=2
                )
                return result.returncode == 0
        except:
            return False
    
    async def scan_port(self, ip: str, port: int) -> bool:
        """扫描端口"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            result = sock.connect_ex((ip, port))
            sock.close()
            return result == 0
        except:
            return False
    
    async def discover_host(self, ip: str) -> Optional[Dict]:
        """发现单个主机"""
        # 先ping检测
        if not await self.ping_host(ip):
            return None
        
        host_info = {
            "ip": ip,
            "hostname": None,
            "mac_address": None,
            "os_type": None,
            "open_ports": [],
            "services": {},
            "discovered_at": datetime.now().isoformat(),
            "status": "online"
        }
        
        # 尝试获取主机名
        try:
            hostname = socket.gethostbyaddr(ip)[0]
            host_info["hostname"] = hostname
        except:
            pass
        
        # 扫描常见端口
        common_ports = [22, 23, 80, 135, 139, 443, 445, 3389, 5985, 5986]
        for port in common_ports:
            if await self.scan_port(ip, port):
                host_info["open_ports"].append(port)
                # 识别服务
                service = self._identify_service(port)
                if service:
                    host_info["services"][port] = service
        
        # 尝试获取MAC地址（需要ARP）
        mac = self._get_mac_address(ip)
        if mac:
            host_info["mac_address"] = mac
        
        # 尝试识别操作系统（通过TTL等）
        os_type = self._detect_os(ip)
        if os_type:
            host_info["os_type"] = os_type
        
        logger.info(f"发现主机: {ip} ({host_info['hostname'] or 'Unknown'})")
        return host_info
    
    async def scan_network(self, network: Optional[str] = None) -> List[Dict]:
        """扫描整个网络段"""
        if network is None:
            network = self.get_local_network()
        
        if not network:
            logger.error("无法确定网络段")
            return []
        
        try:
            network_obj = ipaddress.ip_network(network, strict=False)
            hosts = [str(ip) for ip in network_obj.hosts()]
        except ValueError as e:
            logger.error(f"无效的网络地址: {network}, {e}")
            return []
        
        logger.info(f"开始扫描网络: {network}, 主机数: {len(hosts)}")
        
        # 并发扫描
        tasks = [self.discover_host(ip) for ip in hosts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        discovered = []
        for result in results:
            if isinstance(result, dict):
                discovered.append(result)
        
        self.discovered_hosts = discovered
        self.scan_history.append({
            "network": network,
            "timestamp": datetime.now().isoformat(),
            "hosts_found": len(discovered)
        })
        
        logger.info(f"扫描完成，发现 {len(discovered)} 个在线主机")
        return discovered
    
    def _identify_service(self, port: int) -> Optional[str]:
        """识别服务"""
        services = {
            22: "SSH",
            23: "Telnet",
            80: "HTTP",
            135: "MSRPC",
            139: "NetBIOS",
            443: "HTTPS",
            445: "SMB",
            3389: "RDP",
            5985: "WinRM",
            5986: "WinRM-SSL"
        }
        return services.get(port)
    
    def _get_mac_address(self, ip: str) -> Optional[str]:
        """获取MAC地址（通过ARP表）"""
        try:
            if platform.system() == "Windows":
                result = subprocess.run(
                    ["arp", "-a", ip],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                # 解析ARP输出
                for line in result.stdout.split("\n"):
                    if ip in line:
                        parts = line.split()
                        if len(parts) >= 2:
                            return parts[1]
            else:
                result = subprocess.run(
                    ["arp", "-n", ip],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                # 解析ARP输出
                for line in result.stdout.split("\n"):
                    if ip in line:
                        parts = line.split()
                        if len(parts) >= 3:
                            return parts[2]
        except Exception as e:
            logger.debug(f"获取MAC地址失败 {ip}: {e}")
        
        return None
    
    def _detect_os(self, ip: str) -> Optional[str]:
        """检测操作系统（简化实现）"""
        # 通过TTL和开放端口推断
        # 这里简化处理，实际可以使用nmap等工具
        return None
    
    def get_discovered_hosts(self) -> List[Dict]:
        """获取已发现的主机"""
        return self.discovered_hosts
    
    def get_host_by_ip(self, ip: str) -> Optional[Dict]:
        """根据IP获取主机信息"""
        for host in self.discovered_hosts:
            if host["ip"] == ip:
                return host
        return None
    
    def update_host_info(self, ip: str, info: Dict):
        """更新主机信息"""
        for i, host in enumerate(self.discovered_hosts):
            if host["ip"] == ip:
                self.discovered_hosts[i].update(info)
                self.discovered_hosts[i]["updated_at"] = datetime.now().isoformat()
                break

