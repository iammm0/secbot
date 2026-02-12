"""
配置管理模块（包名 hackbot_config 避免与用户目录下的 config 冲突）
"""

import os
import sys
import sqlite3
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# 加载环境变量：优先当前目录 .env；打包为单文件/可执行目录时，从可执行文件所在目录加载
load_dotenv()
if getattr(sys, "frozen", False):
    _exe_dir = Path(sys.executable).resolve().parent
    load_dotenv(_exe_dir / ".env")

# 与 DatabaseManager 一致：相对路径以本包所在目录为基准（settings.project_root）
_config_dir = Path(__file__).resolve().parent


def _get_api_key_from_keyring(provider: str) -> Optional[str]:
    """从 keyring 获取 API Key（shodan/virustotal 等）"""
    try:
        import keyring
        return keyring.get_password("secbot", provider)
    except Exception:
        return None


def _get_db_path() -> Path:
    """解析 DATABASE_URL 得到 SQLite 文件路径，与 DatabaseManager 使用同一路径（避免写入了读不到）"""
    db_url = os.getenv("DATABASE_URL", "sqlite:///./data/hackbot.db")
    if db_url and db_url.startswith("sqlite:///"):
        path_str = db_url.replace("sqlite:///", "")
        if path_str.startswith("./"):
            return _config_dir / path_str[2:]
        return Path(path_str)
    return _config_dir / "data" / "hackbot.db"


def _get_api_key_from_sqlite(key: str) -> Optional[str]:
    """从 SQLite user_configs 表读取 API Key（不依赖 DatabaseManager，避免循环导入）"""
    try:
        db_path = _get_db_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        if not db_path.exists():
            return None
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.execute("SELECT value FROM user_configs WHERE key = ?", (key,))
            row = cur.fetchone()
            return row["value"] if row else None
        finally:
            conn.close()
    except Exception:
        return None


class Settings(BaseSettings):
    """应用配置"""

    # 推理模型后端：ollama（本地 Ollama）| deepseek（DeepSeek 云端 API）
    llm_provider: str = os.getenv("LLM_PROVIDER", "deepseek")

    # Ollama 配置（当 LLM_PROVIDER=ollama 时使用）
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "gpt-oss:20b")
    ollama_embedding_model: str = os.getenv(
        "OLLAMA_EMBEDDING_MODEL", "nomic-embed-text"
    )
    ollama_temperature: float = float(os.getenv("OLLAMA_TEMPERATURE", "0.7"))
    # 当前模型是否支持工具调用（如 gemma3:1b 不支持，设为 false 可避免 400）
    llm_tools_supported: bool = os.getenv("LLM_TOOLS_SUPPORTED", "true").lower() in (
        "1",
        "true",
        "yes",
    )

    # DeepSeek 配置（当 LLM_PROVIDER=deepseek 时使用，OpenAI 兼容 API）
    # 仅从 SQLite user_configs 读取，需通过 secbot-config config 配置
    @property
    def deepseek_api_key(self) -> Optional[str]:
        return _get_api_key_from_sqlite("deepseek_api_key")

    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-reasoner")
    deepseek_reasoner_model: str = os.getenv(
        "DEEPSEEK_REASONER_MODEL", "deepseek-reasoner"
    )
    deepseek_temperature: float = float(os.getenv("DEEPSEEK_TEMPERATURE", "0.7"))

    # 语音输入（STT）配置
    # 引擎：whisper（openai-whisper）| fast_whisper（faster-whisper，推荐，更快更省显存）
    stt_engine: str = os.getenv("STT_ENGINE", "fast_whisper")
    # 模型名称。whisper: tiny/base/small/medium/large；fast_whisper: tiny/base/small/medium/large-v2/large-v3/turbo/distil-large-v3
    stt_model: str = os.getenv("STT_MODEL", "base")
    # 仅 fast_whisper：设备 cpu/cuda
    stt_device: str = os.getenv("STT_DEVICE", "cpu")
    # 仅 fast_whisper：计算类型。CPU 常用 int8/float32；GPU 常用 float16/int8_float16
    stt_compute_type: str = os.getenv("STT_COMPUTE_TYPE", "int8")
    # 仅 fast_whisper：是否启用 VAD 过滤静音（减少误识别）
    stt_vad_filter: bool = os.getenv("STT_VAD_FILTER", "true").lower() in (
        "1",
        "true",
        "yes",
    )

    # 语音输出（TTS）配置
    tts_engine: str = os.getenv("TTS_ENGINE", "gtts")  # 文字转语音引擎（gtts/pyttsx3）

    # OSINT / 外部 API 配置
    @property
    def shodan_api_key(self) -> Optional[str]:
        keyring_key = _get_api_key_from_keyring("shodan")
        if keyring_key:
            return keyring_key
        return os.getenv("SHODAN_API_KEY")

    @property
    def virustotal_api_key(self) -> Optional[str]:
        keyring_key = _get_api_key_from_keyring("virustotal")
        if keyring_key:
            return keyring_key
        return os.getenv("VIRUSTOTAL_API_KEY")

    # 数据库配置
    redis_url: Optional[str] = os.getenv("REDIS_URL")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/hackbot.db")

    # 日志配置
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    log_file: str = os.getenv("LOG_FILE", "logs/agent.log")
    # 初始化时是否在控制台显示详细日志（默认 false 折叠初始化日志，文件日志不受影响）
    verbose_init: bool = os.getenv("VERBOSE_INIT", "false").lower() in (
        "1",
        "true",
        "yes",
    )

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
