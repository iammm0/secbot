"""
数据库模型定义
"""
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel


class Conversation(BaseModel):
    """对话记录模型"""
    id: Optional[int] = None
    agent_type: str
    user_message: str
    assistant_message: str
    session_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


class PromptChainModel(BaseModel):
    """提示词链模型"""
    id: Optional[int] = None
    name: str
    content: str  # JSON格式的链数据
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


class UserConfig(BaseModel):
    """用户配置模型"""
    id: Optional[int] = None
    key: str
    value: str  # JSON格式的值
    category: Optional[str] = None
    description: Optional[str] = None
    updated_at: Optional[datetime] = None


class CrawlerTask(BaseModel):
    """爬虫任务模型"""
    id: Optional[int] = None
    url: str
    task_type: str  # crawl, monitor
    status: str  # pending, running, completed, failed
    result: Optional[Any] = None  # JSON格式的结果
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


class AttackTask(BaseModel):
    """攻击任务模型"""
    id: Optional[int] = None
    task_id: str
    target: str
    attack_type: str  # brute_force, dos, sql_injection, xss, etc.
    status: str  # pending, running, completed, failed
    result: Optional[Any] = None  # JSON格式的结果
    schedule: Optional[str] = None  # JSON格式的调度配置
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_run: Optional[datetime] = None
    run_count: int = 0
    metadata: Optional[Dict[str, Any]] = None


class ScanResult(BaseModel):
    """扫描结果模型"""
    id: Optional[int] = None
    target: str
    scan_type: str  # port_scan, vulnerability_scan, service_detection
    result: Optional[Any] = None  # JSON格式的结果
    vulnerabilities: Optional[Any] = None  # JSON格式的漏洞列表
    created_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


class AuditRecord(BaseModel):
    """操作审计留痕记录"""
    id: Optional[int] = None
    session_id: str
    agent: str  # hackbot / superhackbot
    step_type: str  # thought / action / observation / confirm / reject / result
    content: str
    metadata: Optional[Dict[str, Any]] = None
    timestamp: Optional[datetime] = None

