"""
主控制器：统一管理内网发现和远程控制
"""
from typing import Dict, List, Optional
from datetime import datetime

from secbot_agent.controller.network_discovery import NetworkDiscovery
from secbot_agent.controller.authorization import AuthorizationManager
from secbot_agent.controller.remote_control import RemoteController
from secbot_agent.controller.session_manager import SessionManager
from utils.logger import logger


class MainController:
    """主控制器：统一管理所有控制功能"""
    
    def __init__(self):
        self.discovery = NetworkDiscovery()
        self.auth_manager = AuthorizationManager()
        self.remote_controller = RemoteController()
        self.session_manager = SessionManager()
        
        logger.info("主控制器初始化完成")
    
    async def discover_network(self, network: Optional[str] = None) -> List[Dict]:
        """发现内网中的所有主机"""
        logger.info("开始内网发现...")
        hosts = await self.discovery.scan_network(network)
        
        # 检查每个主机的授权状态
        for host in hosts:
            host["authorized"] = self.auth_manager.is_authorized(host["ip"])
        
        return hosts
    
    def authorize_target(
        self,
        target_ip: str,
        auth_type: str = "full",
        credentials: Optional[Dict] = None,
        expires_at: Optional[datetime] = None,
        description: Optional[str] = None
    ) -> bool:
        """授权目标主机"""
        # 验证目标是否存在
        host = self.discovery.get_host_by_ip(target_ip)
        if not host:
            logger.warning(f"目标主机未发现: {target_ip}")
            # 仍然允许添加授权，可能目标暂时离线
        
        return self.auth_manager.add_authorization(
            target_ip=target_ip,
            auth_type=auth_type,
            credentials=credentials,
            expires_at=expires_at,
            description=description
        )
    
    def connect_target(self, target_ip: str, connection_type: Optional[str] = None) -> Optional[str]:
        """连接到目标主机"""
        # 检查授权
        if not self.auth_manager.is_authorized(target_ip):
            logger.error(f"目标未授权: {target_ip}")
            return None
        
        auth = self.auth_manager.get_authorization(target_ip)
        credentials = auth.get("credentials", {})
        
        # 确定连接类型
        if not connection_type:
            host = self.discovery.get_host_by_ip(target_ip)
            if host:
                # 根据开放端口判断
                if 22 in host.get("open_ports", []):
                    connection_type = "ssh"
                elif 3389 in host.get("open_ports", []):
                    connection_type = "rdp"
                elif 5985 in host.get("open_ports", []) or 5986 in host.get("open_ports", []):
                    connection_type = "winrm"
                else:
                    connection_type = "ssh"  # 默认
            else:
                connection_type = "ssh"
        
        # 建立连接
        if connection_type == "ssh":
            client = self.remote_controller.connect_ssh(
                target_ip,
                credentials.get("port", 22),
                credentials.get("username"),
                credentials.get("password"),
                credentials.get("key_file")
            )
            if client:
                # 创建会话
                session_id = self.session_manager.create_session(
                    target_ip=target_ip,
                    connection_type=connection_type,
                    auth_info=auth
                )
                return session_id
        
        elif connection_type == "winrm":
            session = self.remote_controller.connect_winrm(
                target_ip,
                credentials.get("username"),
                credentials.get("password")
            )
            if session:
                session_id = self.session_manager.create_session(
                    target_ip=target_ip,
                    connection_type=connection_type,
                    auth_info=auth
                )
                return session_id
        
        return None
    
    def execute_on_target(self, target_ip: str, command: str) -> Dict:
        """在目标主机上执行命令"""
        # 检查授权
        if not self.auth_manager.is_authorized(target_ip):
            return {
                "success": False,
                "error": "目标未授权"
            }
        
        auth = self.auth_manager.get_authorization(target_ip)
        
        # 确定连接类型
        host = self.discovery.get_host_by_ip(target_ip)
        connection_type = "ssh"
        if host:
            if 22 in host.get("open_ports", []):
                connection_type = "ssh"
            elif 5985 in host.get("open_ports", []) or 5986 in host.get("open_ports", []):
                connection_type = "winrm"
        
        # 执行命令
        result = self.remote_controller.execute_command(
            target_ip=target_ip,
            command=command,
            connection_type=connection_type,
            auth=auth,
            port=host.get("open_ports", [22])[0] if host else 22,
            username=auth.get("credentials", {}).get("username"),
            password=auth.get("credentials", {}).get("password")
        )
        
        # 记录到会话
        sessions = self.session_manager.get_session_by_target(target_ip)
        if sessions:
            self.session_manager.add_command(sessions[0]["session_id"], command, result)
        
        return result
    
    def upload_to_target(self, target_ip: str, local_path: str, remote_path: str) -> Dict:
        """上传文件到目标"""
        if not self.auth_manager.is_authorized(target_ip):
            return {
                "success": False,
                "error": "目标未授权"
            }
        
        auth = self.auth_manager.get_authorization(target_ip)
        result = self.remote_controller.upload_file(
            target_ip=target_ip,
            local_path=local_path,
            remote_path=remote_path,
            connection_type="ssh",
            auth=auth
        )
        
        # 记录到会话
        sessions = self.session_manager.get_session_by_target(target_ip)
        if sessions:
            self.session_manager.add_file_transfer(sessions[0]["session_id"], "upload", local_path, remote_path, result)
        
        return result
    
    def download_from_target(self, target_ip: str, remote_path: str, local_path: str) -> Dict:
        """从目标下载文件"""
        if not self.auth_manager.is_authorized(target_ip):
            return {
                "success": False,
                "error": "目标未授权"
            }
        
        auth = self.auth_manager.get_authorization(target_ip)
        result = self.remote_controller.download_file(
            target_ip=target_ip,
            remote_path=remote_path,
            local_path=local_path,
            connection_type="ssh",
            auth=auth
        )
        
        # 记录到会话
        sessions = self.session_manager.get_session_by_target(target_ip)
        if sessions:
            self.session_manager.add_file_transfer(sessions[0]["session_id"], "download", local_path, remote_path, result)
        
        return result
    
    def disconnect_target(self, target_ip: str):
        """断开目标连接"""
        self.remote_controller.disconnect(target_ip)
        
        # 关闭会话
        sessions = self.session_manager.get_session_by_target(target_ip)
        for session in sessions:
            self.session_manager.close_session(session["session_id"])
    
    def get_targets(self, authorized_only: bool = False) -> List[Dict]:
        """获取所有目标"""
        hosts = self.discovery.get_discovered_hosts()
        
        if authorized_only:
            hosts = [h for h in hosts if h.get("authorized", False)]
        
        return hosts
    
    def get_authorized_targets(self) -> List[Dict]:
        """获取已授权的目标"""
        auths = self.auth_manager.list_authorizations(status="active")
        targets = []
        
        for auth in auths:
            target_ip = auth["target_ip"]
            host = self.discovery.get_host_by_ip(target_ip)
            if host:
                host["authorization"] = auth
                targets.append(host)
            else:
                # 即使未发现，也添加到列表
                targets.append({
                    "ip": target_ip,
                    "authorized": True,
                    "authorization": auth,
                    "status": "unknown"
                })
        
        return targets

