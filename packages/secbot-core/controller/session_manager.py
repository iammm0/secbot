"""
会话管理模块：管理控制会话
"""
from typing import Dict, List, Optional
from datetime import datetime
from utils.logger import logger


class SessionManager:
    """会话管理器：管理控制会话"""
    
    def __init__(self):
        self.sessions: Dict[str, Dict] = {}
    
    def create_session(
        self,
        target_ip: str,
        connection_type: str,
        auth_info: Dict
    ) -> str:
        """创建会话"""
        session_id = f"{target_ip}_{connection_type}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        session = {
            "session_id": session_id,
            "target_ip": target_ip,
            "connection_type": connection_type,
            "auth_info": auth_info,
            "created_at": datetime.now().isoformat(),
            "last_activity": datetime.now().isoformat(),
            "status": "active",
            "commands_executed": [],
            "files_transferred": []
        }
        
        self.sessions[session_id] = session
        logger.info(f"创建会话: {session_id}")
        return session_id
    
    def get_session(self, session_id: str) -> Optional[Dict]:
        """获取会话"""
        return self.sessions.get(session_id)
    
    def update_session_activity(self, session_id: str):
        """更新会话活动时间"""
        if session_id in self.sessions:
            self.sessions[session_id]["last_activity"] = datetime.now().isoformat()
    
    def add_command(self, session_id: str, command: str, result: Dict):
        """记录执行的命令"""
        if session_id in self.sessions:
            self.sessions[session_id]["commands_executed"].append({
                "command": command,
                "result": result,
                "timestamp": datetime.now().isoformat()
            })
            self.update_session_activity(session_id)
    
    def add_file_transfer(self, session_id: str, transfer_type: str, local_path: str, remote_path: str, result: Dict):
        """记录文件传输"""
        if session_id in self.sessions:
            self.sessions[session_id]["files_transferred"].append({
                "type": transfer_type,  # upload or download
                "local_path": local_path,
                "remote_path": remote_path,
                "result": result,
                "timestamp": datetime.now().isoformat()
            })
            self.update_session_activity(session_id)
    
    def close_session(self, session_id: str):
        """关闭会话"""
        if session_id in self.sessions:
            self.sessions[session_id]["status"] = "closed"
            self.sessions[session_id]["closed_at"] = datetime.now().isoformat()
            logger.info(f"关闭会话: {session_id}")
    
    def list_sessions(self, status: Optional[str] = None) -> List[Dict]:
        """列出会话"""
        sessions = list(self.sessions.values())
        
        if status:
            sessions = [s for s in sessions if s.get("status") == status]
        
        return sessions
    
    def get_session_by_target(self, target_ip: str) -> List[Dict]:
        """根据目标IP获取会话"""
        return [s for s in self.sessions.values() if s["target_ip"] == target_ip and s["status"] == "active"]

