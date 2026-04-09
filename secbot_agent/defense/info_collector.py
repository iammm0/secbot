"""
信息收集模块：收集系统和网络信息
"""
import os
import platform
import socket
import psutil
import subprocess
from typing import Dict, List, Optional
from datetime import datetime
from utils.logger import logger


def _current_user_fallback() -> str:
    """当前用户名回退（不依赖 psutil.users）。"""
    try:
        import getpass
        return getpass.getuser()
    except Exception:
        return os.environ.get("USER", os.environ.get("USERNAME", "unknown"))


class InfoCollector:
    """信息收集器：收集主机和网络信息"""
    
    def __init__(self):
        self.collected_info: Dict = {}
    
    def collect_system_info(self) -> Dict:
        """收集系统信息（逐项 try 避免单点失败导致整体报错）"""
        info = {"timestamp": datetime.now().isoformat()}
        try:
            info["hostname"] = socket.gethostname()
            info["platform"] = platform.system()
            info["platform_version"] = platform.version()
            info["architecture"] = platform.machine()
            info["processor"] = platform.processor()
            info["cpu_count"] = psutil.cpu_count()
        except Exception as e:
            logger.warning(f"收集基础系统信息异常: {e}")
        try:
            cf = psutil.cpu_freq()
            info["cpu_freq"] = cf._asdict() if cf else None
        except Exception as e:
            logger.warning(f"cpu_freq 不可用: {e}")
            info["cpu_freq"] = None
        try:
            vm = psutil.virtual_memory()
            info["memory_total"] = vm.total
            info["memory_available"] = vm.available
        except Exception as e:
            logger.warning(f"内存信息不可用: {e}")
        try:
            disk_usage = {}
            for partition in psutil.disk_partitions():
                try:
                    du = psutil.disk_usage(partition.mountpoint)
                    disk_usage[partition.device] = {
                        "mountpoint": partition.mountpoint,
                        "fstype": partition.fstype,
                        "total": du.total,
                        "used": du.used,
                        "free": du.free,
                    }
                except Exception as e:
                    logger.warning(f"磁盘 {partition.mountpoint} 不可用: {e}")
            info["disk_usage"] = disk_usage
        except Exception as e:
            logger.warning(f"磁盘信息不可用: {e}")
            info["disk_usage"] = {}
        try:
            info["boot_time"] = datetime.fromtimestamp(psutil.boot_time()).isoformat()
        except Exception as e:
            logger.warning(f"boot_time 不可用: {e}")
        self.collected_info["system"] = info
        logger.info("系统信息收集完成")
        return info
    
    def collect_network_info(self) -> Dict:
        """收集网络信息"""
        info = {
            "interfaces": {},
            "connections": [],
            "ip_addresses": []
        }
        
        # 网络接口信息
        interfaces = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        
        for interface_name, addresses in interfaces.items():
            interface_info = {
                "name": interface_name,
                "addresses": [],
                "isup": stats[interface_name].isup if interface_name in stats else False,
                "speed": stats[interface_name].speed if interface_name in stats else 0
            }
            
            for addr in addresses:
                interface_info["addresses"].append({
                    "family": str(addr.family),
                    "address": addr.address,
                    "netmask": addr.netmask,
                    "broadcast": addr.broadcast
                })
                
                if addr.family == socket.AF_INET:
                    info["ip_addresses"].append(addr.address)
            
            info["interfaces"][interface_name] = interface_info
        
        # 网络连接信息
        connections = psutil.net_connections(kind='inet')
        for conn in connections[:100]:  # 限制数量
            if conn.status:
                info["connections"].append({
                    "fd": conn.fd,
                    "family": str(conn.family),
                    "type": str(conn.type),
                    "laddr": f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else None,
                    "raddr": f"{conn.raddr.ip}:{conn.raddr.port}" if conn.raddr else None,
                    "status": conn.status,
                    "pid": conn.pid
                })
        
        self.collected_info["network"] = info
        logger.info("网络信息收集完成")
        return info
    
    def collect_process_info(self) -> Dict:
        """收集进程信息"""
        processes = []
        
        for proc in psutil.process_iter(['pid', 'name', 'username', 'cpu_percent', 'memory_percent', 'status', 'create_time']):
            try:
                proc_info = proc.info
                proc_info["create_time"] = datetime.fromtimestamp(proc_info["create_time"]).isoformat() if proc_info.get("create_time") else None
                processes.append(proc_info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        
        info = {
            "process_count": len(processes),
            "processes": processes[:100],  # 限制数量
            "timestamp": datetime.now().isoformat()
        }
        
        self.collected_info["processes"] = info
        logger.info("进程信息收集完成")
        return info
    
    def collect_open_ports(self) -> Dict:
        """收集开放端口信息"""
        open_ports = []
        
        connections = psutil.net_connections(kind='inet')
        ports = set()
        
        for conn in connections:
            if conn.laddr and conn.status in ['LISTEN', 'ESTABLISHED']:
                ports.add(conn.laddr.port)
        
        for port in sorted(ports):
            open_ports.append({
                "port": port,
                "protocol": "tcp",
                "status": "open"
            })
        
        info = {
            "open_ports": open_ports,
            "port_count": len(open_ports),
            "timestamp": datetime.now().isoformat()
        }
        
        self.collected_info["open_ports"] = info
        logger.info(f"发现 {len(open_ports)} 个开放端口")
        return info
    
    def collect_user_info(self) -> Dict:
        """收集用户信息"""
        try:
            if platform.system() == "Windows":
                # Windows用户信息
                users = []
                try:
                    result = subprocess.run(
                        ["net", "user"],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    # 解析输出（简化处理）
                    users = [line.strip() for line in result.stdout.split("\n") if line.strip() and not line.startswith("--")]
                except:
                    pass
            else:
                # Linux/Unix用户信息
                users = []
                try:
                    with open("/etc/passwd", "r") as f:
                        users = [line.split(":")[0] for line in f.readlines()]
                except:
                    pass
            
            # psutil 为 users()（小写）；部分环境无此接口，用 getpass/os 回退
            current_user = None
            try:
                u = getattr(psutil, "users", None)
                if callable(u) and u():
                    current_user = u()[0].name
            except Exception:
                pass
            if current_user is None:
                current_user = _current_user_fallback()
            info = {
                "users": users,
                "current_user": current_user,
                "timestamp": datetime.now().isoformat(),
            }
            
            self.collected_info["users"] = info
            logger.info("用户信息收集完成")
            return info
        except Exception as e:
            logger.error(f"收集用户信息失败: {e}")
            return {}
    
    def collect_all(self) -> Dict:
        """收集所有信息"""
        logger.info("开始收集系统信息...")
        
        self.collect_system_info()
        self.collect_network_info()
        self.collect_process_info()
        self.collect_open_ports()
        self.collect_user_info()
        
        self.collected_info["collection_time"] = datetime.now().isoformat()
        
        logger.info("所有信息收集完成")
        return self.collected_info
    
    def get_info(self, category: Optional[str] = None) -> Dict:
        """获取收集的信息"""
        if category:
            return self.collected_info.get(category, {})
        return self.collected_info

