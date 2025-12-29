"""
配置管理模块
"""
import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

class Settings(BaseSettings):
    """应用配置"""
    
    # Ollama配置
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "gpt-oss:20b")
    ollama_embedding_model: str = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")
    
    # 语音处理配置（使用本地Whisper和gTTS/pyttsx3，不通过Ollama）
    stt_model: str = os.getenv("STT_MODEL", "base")  # 语音转文字模型（Whisper模型名称：tiny/base/small/medium/large）
    tts_engine: str = os.getenv("TTS_ENGINE", "gtts")  # 文字转语音引擎（gtts/pyttsx3）
    
    
    # 数据库配置
    redis_url: Optional[str] = os.getenv("REDIS_URL")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/m_bot.db")
    
    # 日志配置
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    log_file: str = os.getenv("LOG_FILE", "logs/agent.log")
    
    # 项目路径
    project_root: Path = Path(__file__).parent
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"  # 忽略未定义的额外字段

# 全局配置实例
settings = Settings()

# 确保日志目录存在
Path(settings.log_file).parent.mkdir(parents=True, exist_ok=True)

