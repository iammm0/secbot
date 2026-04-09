"""
远程控制模块：在授权后控制远程主机
"""
import paramiko
import subprocess
import socket
from typing import Dict, Optional, List
from datetime import datetime
from utils.logger import logger


class RemoteController:
    """远程控制器：执行远程控制操作"""
    
    def __init__(self):
        self.active_sessions: Dict[str, Dict] = {}
    
    def connect_ssh(self, host: str, port: int, username: str, password: Optional[str] = None, key_file: Optional[str] = None) -> Optional[paramiko.SSHClient]:
        """建立SSH连接"""
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            if key_file:
                client.connect(host, port=port, username=username, key_filename=key_file, timeout=10)
            else:
                client.connect(host, port=port, username=username, password=password, timeout=10)
            
            logger.info(f"SSH连接成功: {host}:{port}")
            return client
        except Exception as e:
            logger.error(f"SSH连接失败 {host}:{port}: {e}")
            return None
    
    def connect_winrm(self, host: str, username: str, password: str) -> Optional[Dict]:
        """建立WinRM连接（Windows远程管理）"""
        try:
            # 使用pywinrm或subprocess调用winrs
            # 这里简化实现
            session = {
                "type": "winrm",
                "host": host,
                "username": username,
                "connected_at": datetime.now().isoformat()
            }
            
            logger.info(f"WinRM连接成功: {host}")
            return session
        except Exception as e:
            logger.error(f"WinRM连接失败 {host}: {e}")
            return None
    
    def execute_command(
        self,
        target_ip: str,
        command: str,
        connection_type: str = "ssh",
        **kwargs
    ) -> Dict:
        """执行远程命令"""
        result = {
            "target_ip": target_ip,
            "command": command,
            "timestamp": datetime.now().isoformat(),
            "success": False,
            "output": "",
            "error": ""
        }
        
        try:
            if connection_type == "ssh":
                # SSH执行
                session_key = f"{target_ip}_ssh"
                if session_key not in self.active_sessions:
                    # 需要先连接
                    auth = kwargs.get("auth")
                    if not auth:
                        result["error"] = "需要授权信息"
                        return result
                    
                    credentials = auth.get("credentials", {})
                    client = self.connect_ssh(
                        target_ip,
                        kwargs.get("port", 22),
                        credentials.get("username"),
                        credentials.get("password"),
                        credentials.get("key_file")
                    )
                    
                    if not client:
                        result["error"] = "SSH连接失败"
                        return result
                    
                    self.active_sessions[session_key] = {
                        "client": client,
                        "type": "ssh",
                        "connected_at": datetime.now().isoformat()
                    }
                
                session = self.active_sessions[session_key]
                client = session["client"]
                
                stdin, stdout, stderr = client.exec_command(command)
                output = stdout.read().decode('utf-8', errors='ignore')
                error = stderr.read().decode('utf-8', errors='ignore')
                
                result["success"] = True
                result["output"] = output
                result["error"] = error
                result["exit_code"] = stdout.channel.recv_exit_status()
            
            elif connection_type == "winrm":
                # WinRM执行（Windows）
                # 使用winrs命令
                cmd = f'winrs -r:{target_ip} -u:{kwargs.get("username")} -p:{kwargs.get("password")} {command}'
                process = subprocess.run(
                    cmd,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                result["success"] = process.returncode == 0
                result["output"] = process.stdout
                result["error"] = process.stderr
                result["exit_code"] = process.returncode
            
            elif connection_type == "smb":
                # SMB执行（Windows，需要psexec等工具）
                result["error"] = "SMB执行暂未实现"
            
            else:
                result["error"] = f"不支持的连接类型: {connection_type}"
        
        except Exception as e:
            logger.error(f"执行命令失败 {target_ip}: {e}")
            result["error"] = str(e)
        
        return result
    
    def upload_file(
        self,
        target_ip: str,
        local_path: str,
        remote_path: str,
        connection_type: str = "ssh",
        **kwargs
    ) -> Dict:
        """上传文件"""
        result = {
            "target_ip": target_ip,
            "local_path": local_path,
            "remote_path": remote_path,
            "timestamp": datetime.now().isoformat(),
            "success": False,
            "error": ""
        }
        
        try:
            if connection_type == "ssh":
                session_key = f"{target_ip}_ssh"
                if session_key not in self.active_sessions:
                    result["error"] = "需要先建立连接"
                    return result
                
                session = self.active_sessions[session_key]
                client = session["client"]
                
                sftp = client.open_sftp()
                sftp.put(local_path, remote_path)
                sftp.close()
                
                result["success"] = True
                logger.info(f"文件上传成功: {local_path} -> {target_ip}:{remote_path}")
            
            else:
                result["error"] = f"不支持的连接类型: {connection_type}"
        
        except Exception as e:
            logger.error(f"文件上传失败 {target_ip}: {e}")
            result["error"] = str(e)
        
        return result
    
    def download_file(
        self,
        target_ip: str,
        remote_path: str,
        local_path: str,
        connection_type: str = "ssh",
        **kwargs
    ) -> Dict:
        """下载文件"""
        result = {
            "target_ip": target_ip,
            "remote_path": remote_path,
            "local_path": local_path,
            "timestamp": datetime.now().isoformat(),
            "success": False,
            "error": ""
        }
        
        try:
            if connection_type == "ssh":
                session_key = f"{target_ip}_ssh"
                if session_key not in self.active_sessions:
                    result["error"] = "需要先建立连接"
                    return result
                
                session = self.active_sessions[session_key]
                client = session["client"]
                
                sftp = client.open_sftp()
                sftp.get(remote_path, local_path)
                sftp.close()
                
                result["success"] = True
                logger.info(f"文件下载成功: {target_ip}:{remote_path} -> {local_path}")
            
            else:
                result["error"] = f"不支持的连接类型: {connection_type}"
        
        except Exception as e:
            logger.error(f"文件下载失败 {target_ip}: {e}")
            result["error"] = str(e)
        
        return result
    
    def disconnect(self, target_ip: str, connection_type: str = "ssh"):
        """断开连接"""
        session_key = f"{target_ip}_{connection_type}"
        if session_key in self.active_sessions:
            session = self.active_sessions[session_key]
            if session["type"] == "ssh" and "client" in session:
                session["client"].close()
            
            del self.active_sessions[session_key]
            logger.info(f"断开连接: {target_ip} ({connection_type})")
    
    def get_active_sessions(self) -> List[Dict]:
        """获取活动会话"""
        return [
            {
                "target_ip": key.split("_")[0],
                "type": session["type"],
                "connected_at": session["connected_at"]
            }
            for key, session in self.active_sessions.items()
        ]

