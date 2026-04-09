"""
授权管理模块：管理对目标主机的授权
"""
import json
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from pathlib import Path
from utils.logger import logger


class AuthorizationManager:
    """授权管理器：管理授权信息"""
    
    def __init__(self, auth_file: Optional[Path] = None):
        self.auth_file = auth_file or Path("data/authorizations.json")
        self.auth_file.parent.mkdir(parents=True, exist_ok=True)
        self.authorizations: Dict[str, Dict] = {}
        self._load_authorizations()
    
    def _load_authorizations(self):
        """加载授权信息"""
        if self.auth_file.exists():
            try:
                with open(self.auth_file, "r", encoding="utf-8") as f:
                    self.authorizations = json.load(f)
                logger.info(f"加载了 {len(self.authorizations)} 个授权")
            except Exception as e:
                logger.error(f"加载授权失败: {e}")
                self.authorizations = {}
        else:
            self.authorizations = {}
    
    def _save_authorizations(self):
        """保存授权信息"""
        try:
            with open(self.auth_file, "w", encoding="utf-8") as f:
                json.dump(self.authorizations, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"保存授权失败: {e}")
    
    def add_authorization(
        self,
        target_ip: str,
        auth_type: str = "full",
        credentials: Optional[Dict] = None,
        expires_at: Optional[datetime] = None,
        description: Optional[str] = None
    ) -> bool:
        """添加授权"""
        auth = {
            "target_ip": target_ip,
            "auth_type": auth_type,  # full, limited, read_only
            "credentials": credentials or {},
            "created_at": datetime.now().isoformat(),
            "expires_at": expires_at.isoformat() if expires_at else None,
            "description": description,
            "status": "active"
        }
        
        self.authorizations[target_ip] = auth
        self._save_authorizations()
        
        logger.info(f"添加授权: {target_ip}, 类型: {auth_type}")
        return True
    
    def revoke_authorization(self, target_ip: str) -> bool:
        """撤销授权"""
        if target_ip in self.authorizations:
            self.authorizations[target_ip]["status"] = "revoked"
            self.authorizations[target_ip]["revoked_at"] = datetime.now().isoformat()
            self._save_authorizations()
            logger.info(f"撤销授权: {target_ip}")
            return True
        return False
    
    def is_authorized(self, target_ip: str) -> bool:
        """检查是否已授权"""
        if target_ip not in self.authorizations:
            return False
        
        auth = self.authorizations[target_ip]
        
        # 检查状态
        if auth.get("status") != "active":
            return False
        
        # 检查过期时间
        if auth.get("expires_at"):
            expires = datetime.fromisoformat(auth["expires_at"])
            if datetime.now() > expires:
                auth["status"] = "expired"
                self._save_authorizations()
                return False
        
        return True
    
    def get_authorization(self, target_ip: str) -> Optional[Dict]:
        """获取授权信息"""
        if self.is_authorized(target_ip):
            return self.authorizations[target_ip]
        return None
    
    def list_authorizations(self, status: Optional[str] = None) -> List[Dict]:
        """列出授权"""
        auths = list(self.authorizations.values())
        
        if status:
            auths = [a for a in auths if a.get("status") == status]
        
        return auths
    
    def update_credentials(self, target_ip: str, credentials: Dict):
        """更新凭据"""
        if target_ip in self.authorizations:
            self.authorizations[target_ip]["credentials"].update(credentials)
            self.authorizations[target_ip]["updated_at"] = datetime.now().isoformat()
            self._save_authorizations()
            logger.info(f"更新凭据: {target_ip}")

