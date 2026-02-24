"""
配置管理模块（包名 hackbot_config 避免与用户目录下的 config 冲突）

支持多厂商 LLM 后端：Ollama、DeepSeek、OpenAI、Anthropic、Google、
智谱、通义千问、月之暗面、百川、零一万物，以及任意 OpenAI API 兼容中转服务。
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


def _get_config_from_sqlite(key: str) -> Optional[str]:
    """从 SQLite user_configs 表读取配置值（不依赖 DatabaseManager，避免循环导入）"""
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


def save_config_to_sqlite(key: str, value: str, category: str = "api_keys", description: str = "") -> bool:
    """将配置值写入 SQLite user_configs 表（upsert）"""
    try:
        db_path = _get_db_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS user_configs (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    category TEXT DEFAULT '',
                    description TEXT DEFAULT '',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )"""
            )
            conn.execute(
                """INSERT INTO user_configs (key, value, category, description)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP""",
                (key, value, category, description),
            )
            conn.commit()
            return True
        finally:
            conn.close()
    except Exception:
        return False


def delete_config_from_sqlite(key: str) -> bool:
    """从 SQLite user_configs 表删除指定 key 的配置"""
    try:
        db_path = _get_db_path()
        if not db_path.exists():
            return True
        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute("DELETE FROM user_configs WHERE key = ?", (key,))
            conn.commit()
            return True
        finally:
            conn.close()
    except Exception:
        return False


def delete_provider_api_key(provider: str) -> bool:
    """删除指定厂商的 API Key：SQLite + keyring（认证失败时立即清除无效 key）"""
    ok = delete_config_from_sqlite(f"{provider}_api_key")
    try:
        import keyring
        keyring.delete_password("secbot", provider)
    except Exception:
        pass
    return ok


# 向下兼容别名
_get_api_key_from_sqlite = _get_config_from_sqlite


def get_provider_api_key(provider: str) -> Optional[str]:
    """获取任意厂商的 API Key（优先 SQLite，其次环境变量）"""
    # SQLite
    key = _get_config_from_sqlite(f"{provider}_api_key")
    if key and key.strip():
        return key.strip()
    # 环境变量 (如 OPENAI_API_KEY / DEEPSEEK_API_KEY / ...)
    env_val = os.getenv(f"{provider.upper()}_API_KEY")
    if env_val and env_val.strip():
        return env_val.strip()
    return None


def get_provider_base_url(provider: str) -> Optional[str]:
    """获取厂商自定义 base_url（优先 SQLite，其次环境变量）"""
    val = _get_config_from_sqlite(f"{provider}_base_url")
    if val and val.strip():
        return val.strip()
    env_val = os.getenv(f"{provider.upper()}_BASE_URL")
    if env_val and env_val.strip():
        return env_val.strip()
    return None


def get_provider_model(provider: str) -> Optional[str]:
    """获取厂商上次选择的模型（优先 SQLite，其次环境变量）"""
    val = _get_config_from_sqlite(f"{provider}_model")
    if val and val.strip():
        return val.strip()
    env_val = os.getenv(f"{provider.upper()}_MODEL")
    if env_val and env_val.strip():
        return env_val.strip()
    return None


class Settings(BaseSettings):
    """应用配置"""

    # 推理模型后端：ollama / deepseek / openai / anthropic / google / zhipu / qwen / moonshot / baichuan / yi / custom
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

    # DeepSeek 配置（向下兼容）
    @property
    def deepseek_api_key(self) -> Optional[str]:
        return get_provider_api_key("deepseek")

    deepseek_base_url: str = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    deepseek_model: str = os.getenv("DEEPSEEK_MODEL", "deepseek-reasoner")
    deepseek_reasoner_model: str = os.getenv(
        "DEEPSEEK_REASONER_MODEL", "deepseek-reasoner"
    )
    deepseek_temperature: float = float(os.getenv("DEEPSEEK_TEMPERATURE", "0.7"))

    # 语音输入（STT）配置
    stt_engine: str = os.getenv("STT_ENGINE", "fast_whisper")
    stt_model: str = os.getenv("STT_MODEL", "base")
    stt_device: str = os.getenv("STT_DEVICE", "cpu")
    stt_compute_type: str = os.getenv("STT_COMPUTE_TYPE", "int8")
    stt_vad_filter: bool = os.getenv("STT_VAD_FILTER", "true").lower() in (
        "1",
        "true",
        "yes",
    )

    # 语音输出（TTS）配置
    tts_engine: str = os.getenv("TTS_ENGINE", "gtts")

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
        extra = "ignore"


# 全局配置实例
settings = Settings()

# 确保日志目录存在
Path(settings.log_file).parent.mkdir(parents=True, exist_ok=True)
