"""
系统操作命令集合
"""
import os
import subprocess
import shutil
import psutil
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime
import json
from utils.logger import logger
from system.detector import OSDetector


class SystemCommands:
    """系统操作命令集合"""
    
    def __init__(self):
        self.detector = OSDetector()
        self.system_info = self.detector.detect()
    
    # ========== 文件操作 ==========
    
    def list_files(self, path: str = ".", recursive: bool = False) -> List[Dict]:
        """列出文件"""
        try:
            path_obj = Path(path)
            if not path_obj.exists():
                return []
            
            files = []
            if recursive:
                for item in path_obj.rglob("*"):
                    files.append({
                        "name": item.name,
                        "path": str(item),
                        "type": "directory" if item.is_dir() else "file",
                        "size": item.stat().st_size if item.is_file() else 0,
                        "modified": datetime.fromtimestamp(item.stat().st_mtime).isoformat()
                    })
            else:
                for item in path_obj.iterdir():
                    files.append({
                        "name": item.name,
                        "path": str(item),
                        "type": "directory" if item.is_dir() else "file",
                        "size": item.stat().st_size if item.is_file() else 0,
                        "modified": datetime.fromtimestamp(item.stat().st_mtime).isoformat()
                    })
            
            return files
        except Exception as e:
            logger.error(f"列出文件错误: {e}")
            return []
    
    def read_file(self, file_path: str, encoding: str = "utf-8") -> str:
        """读取文件"""
        try:
            with open(file_path, "r", encoding=encoding) as f:
                return f.read()
        except Exception as e:
            logger.error(f"读取文件错误: {e}")
            raise
    
    def write_file(self, file_path: str, content: str, encoding: str = "utf-8") -> bool:
        """写入文件"""
        try:
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w", encoding=encoding) as f:
                f.write(content)
            return True
        except Exception as e:
            logger.error(f"写入文件错误: {e}")
            return False
    
    def create_directory(self, dir_path: str) -> bool:
        """创建目录"""
        try:
            Path(dir_path).mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            logger.error(f"创建目录错误: {e}")
            return False
    
    def delete_file(self, file_path: str) -> bool:
        """删除文件"""
        try:
            Path(file_path).unlink()
            return True
        except Exception as e:
            logger.error(f"删除文件错误: {e}")
            return False
    
    def delete_directory(self, dir_path: str) -> bool:
        """删除目录"""
        try:
            shutil.rmtree(dir_path)
            return True
        except Exception as e:
            logger.error(f"删除目录错误: {e}")
            return False
    
    def copy_file(self, src: str, dst: str) -> bool:
        """复制文件"""
        try:
            shutil.copy2(src, dst)
            return True
        except Exception as e:
            logger.error(f"复制文件错误: {e}")
            return False
    
    def move_file(self, src: str, dst: str) -> bool:
        """移动文件"""
        try:
            shutil.move(src, dst)
            return True
        except Exception as e:
            logger.error(f"移动文件错误: {e}")
            return False
    
    def get_file_info(self, file_path: str) -> Dict:
        """获取文件信息"""
        try:
            path_obj = Path(file_path)
            if not path_obj.exists():
                return {}
            
            stat = path_obj.stat()
            return {
                "path": str(path_obj),
                "name": path_obj.name,
                "size": stat.st_size,
                "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "is_file": path_obj.is_file(),
                "is_dir": path_obj.is_dir()
            }
        except Exception as e:
            logger.error(f"获取文件信息错误: {e}")
            return {}
    
    # ========== 进程操作 ==========
    
    def list_processes(self, filter_name: Optional[str] = None) -> List[Dict]:
        """列出进程"""
        try:
            processes = []
            for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
                try:
                    proc_info = proc.info
                    if filter_name and filter_name.lower() not in proc_info['name'].lower():
                        continue
                    processes.append(proc_info)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            return processes
        except Exception as e:
            logger.error(f"列出进程错误: {e}")
            return []
    
    def kill_process(self, pid: int) -> bool:
        """终止进程"""
        try:
            proc = psutil.Process(pid)
            proc.terminate()
            return True
        except Exception as e:
            logger.error(f"终止进程错误: {e}")
            return False
    
    def get_process_info(self, pid: int) -> Dict:
        """获取进程信息"""
        try:
            proc = psutil.Process(pid)
            return {
                "pid": proc.pid,
                "name": proc.name(),
                "status": proc.status(),
                "cpu_percent": proc.cpu_percent(),
                "memory_percent": proc.memory_percent(),
                "memory_info": proc.memory_info()._asdict(),
                "create_time": datetime.fromtimestamp(proc.create_time()).isoformat()
            }
        except Exception as e:
            logger.error(f"获取进程信息错误: {e}")
            return {}
    
    # ========== 系统信息 ==========
    
    def get_system_info(self) -> Dict:
        """获取系统信息"""
        return self.system_info.to_dict()
    
    def get_cpu_info(self) -> Dict:
        """获取CPU信息"""
        try:
            return {
                "count": psutil.cpu_count(),
                "percent": psutil.cpu_percent(interval=1),
                "per_cpu": psutil.cpu_percent(interval=1, percpu=True),
                "freq": psutil.cpu_freq()._asdict() if psutil.cpu_freq() else {}
            }
        except Exception as e:
            logger.error(f"获取CPU信息错误: {e}")
            return {}
    
    def get_memory_info(self) -> Dict:
        """获取内存信息"""
        try:
            mem = psutil.virtual_memory()
            return {
                "total": mem.total,
                "available": mem.available,
                "used": mem.used,
                "percent": mem.percent,
                "free": mem.free
            }
        except Exception as e:
            logger.error(f"获取内存信息错误: {e}")
            return {}
    
    def get_disk_info(self) -> List[Dict]:
        """获取磁盘信息"""
        try:
            disks = []
            for partition in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(partition.mountpoint)
                    disks.append({
                        "device": partition.device,
                        "mountpoint": partition.mountpoint,
                        "fstype": partition.fstype,
                        "total": usage.total,
                        "used": usage.used,
                        "free": usage.free,
                        "percent": usage.percent
                    })
                except PermissionError:
                    pass
            return disks
        except Exception as e:
            logger.error(f"获取磁盘信息错误: {e}")
            return []
    
    def get_network_info(self) -> Dict:
        """获取网络信息"""
        try:
            net_io = psutil.net_io_counters()
            net_if = psutil.net_if_addrs()
            
            interfaces = {}
            for interface_name, addresses in net_if.items():
                interfaces[interface_name] = [
                    {
                        "family": str(addr.family),
                        "address": addr.address,
                        "netmask": addr.netmask if hasattr(addr, 'netmask') else None
                    }
                    for addr in addresses
                ]
            
            return {
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv,
                "packets_sent": net_io.packets_sent,
                "packets_recv": net_io.packets_recv,
                "interfaces": interfaces
            }
        except Exception as e:
            logger.error(f"获取网络信息错误: {e}")
            return {}
    
    # ========== 命令执行 ==========
    
    def execute_command(self, command: str, shell: bool = True, timeout: int = 30) -> Dict:
        """执行系统命令"""
        try:
            if self.system_info.os_type == "windows":
                # Windows使用cmd.exe（不使用PowerShell）
                if shell:
                    # 使用 cmd.exe 执行命令
                    # 格式: cmd /c "command"
                    cmd_command = f'cmd /c "{command}"'
                    result = subprocess.run(
                        cmd_command,
                        shell=False,  # 不使用 shell，直接执行 cmd
                        capture_output=True,
                        text=True,
                        timeout=timeout,
                        encoding="utf-8",
                        errors="ignore"
                    )
                else:
                    result = subprocess.run(
                        command.split(),
                        capture_output=True,
                        text=True,
                        timeout=timeout,
                        encoding="utf-8",
                        errors="ignore"
                    )
            else:
                # Linux/macOS使用bash
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    executable="/bin/bash" if self.system_info.os_type == "linux" else "/bin/zsh"
                )
            
            return {
                "success": result.returncode == 0,
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "returncode": -1,
                "stdout": "",
                "stderr": "命令执行超时"
            }
        except Exception as e:
            logger.error(f"执行命令错误: {e}")
            return {
                "success": False,
                "returncode": -1,
                "stdout": "",
                "stderr": str(e)
            }
    
    # ========== 环境变量 ==========
    
    def get_env(self, key: str) -> Optional[str]:
        """获取环境变量"""
        return os.environ.get(key)
    
    def set_env(self, key: str, value: str) -> bool:
        """设置环境变量"""
        try:
            os.environ[key] = value
            return True
        except Exception as e:
            logger.error(f"设置环境变量错误: {e}")
            return False
    
    def list_env(self) -> Dict[str, str]:
        """列出所有环境变量"""
        return dict(os.environ)
    
    # ========== 路径操作 ==========
    
    def get_current_directory(self) -> str:
        """获取当前工作目录"""
        return os.getcwd()
    
    def change_directory(self, path: str) -> bool:
        """切换目录"""
        try:
            os.chdir(path)
            return True
        except Exception as e:
            logger.error(f"切换目录错误: {e}")
            return False
    
    def expand_path(self, path: str) -> str:
        """展开路径（处理~和变量）"""
        return os.path.expanduser(os.path.expandvars(path))
    
    def path_exists(self, path: str) -> bool:
        """检查路径是否存在"""
        return os.path.exists(path)
    
    def is_file(self, path: str) -> bool:
        """检查是否为文件"""
        return os.path.isfile(path)
    
    def is_directory(self, path: str) -> bool:
        """检查是否为目录"""
        return os.path.isdir(path)

