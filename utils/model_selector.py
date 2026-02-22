"""
多厂商模型选择器：支持 Ollama、DeepSeek、OpenAI、Anthropic、Google、
智谱、通义千问、月之暗面、百川、零一万物，以及任意 OpenAI API 兼容中转服务。

/model 无参时展示所有后端并显示配置状态，选择后检查可用性。

对话框语义：Esc/Ctrl+C 或直接回车视为取消，返回 (None, None)，回到主输入。
"""
from __future__ import annotations

from typing import Optional, Tuple, List, Dict, Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from hackbot_config import settings, get_provider_api_key, get_provider_base_url, get_provider_model, save_config_to_sqlite

# ---------------------------------------------------------------------------
# 厂商注册表
# ---------------------------------------------------------------------------
PROVIDER_REGISTRY: List[Dict[str, Any]] = [
    {
        "id": "ollama",
        "name": "Ollama (本地)",
        "description": "本地运行，无需 API Key",
        "type": "ollama",
        "default_base_url": "http://localhost:11434",
        "default_models": [],  # 动态获取
        "needs_api_key": False,
    },
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "description": "深度求索，推理模型首选",
        "type": "openai_compatible",
        "default_base_url": "https://api.deepseek.com",
        "default_models": ["deepseek-chat", "deepseek-reasoner"],
        "needs_api_key": True,
    },
    {
        "id": "openai",
        "name": "OpenAI",
        "description": "GPT-4o / o1 / o3-mini",
        "type": "openai_compatible",
        "default_base_url": "https://api.openai.com/v1",
        "default_models": ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
        "needs_api_key": True,
    },
    {
        "id": "anthropic",
        "name": "Anthropic (Claude)",
        "description": "Claude 4 / 3.5 Sonnet",
        "type": "anthropic",
        "default_base_url": "https://api.anthropic.com",
        "default_models": ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
        "needs_api_key": True,
    },
    {
        "id": "google",
        "name": "Google (Gemini)",
        "description": "Gemini 2.0 Flash / Pro",
        "type": "google",
        "default_base_url": "",
        "default_models": ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
        "needs_api_key": True,
    },
    {
        "id": "zhipu",
        "name": "智谱 (GLM)",
        "description": "GLM-4 系列",
        "type": "openai_compatible",
        "default_base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_models": ["glm-4-flash", "glm-4", "glm-4-plus"],
        "needs_api_key": True,
    },
    {
        "id": "qwen",
        "name": "通义千问 (Qwen)",
        "description": "Qwen 系列，阿里云百炼",
        "type": "openai_compatible",
        "default_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_models": ["qwen-turbo", "qwen-plus", "qwen-max"],
        "needs_api_key": True,
    },
    {
        "id": "moonshot",
        "name": "月之暗面 (Kimi)",
        "description": "Moonshot AI",
        "type": "openai_compatible",
        "default_base_url": "https://api.moonshot.cn/v1",
        "default_models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        "needs_api_key": True,
    },
    {
        "id": "baichuan",
        "name": "百川",
        "description": "Baichuan 系列",
        "type": "openai_compatible",
        "default_base_url": "https://api.baichuan-ai.com/v1",
        "default_models": ["Baichuan4", "Baichuan3-Turbo", "Baichuan3-Turbo-128k"],
        "needs_api_key": True,
    },
    {
        "id": "yi",
        "name": "零一万物 (Yi)",
        "description": "Yi 系列",
        "type": "openai_compatible",
        "default_base_url": "https://api.lingyiwanwu.com/v1",
        "default_models": ["yi-large", "yi-medium", "yi-spark"],
        "needs_api_key": True,
    },
    {
        "id": "custom",
        "name": "OpenAI 兼容中转",
        "description": "自定义 API 兼容服务",
        "type": "openai_compatible",
        "default_base_url": "",
        "default_models": [],
        "needs_api_key": True,
        "needs_base_url": True,
    },
]

# 向下兼容常量
PROVIDER_OLLAMA = "ollama"
PROVIDER_DEEPSEEK = "deepseek"
SUPPORTED_PROVIDERS = tuple(p["id"] for p in PROVIDER_REGISTRY)

# DeepSeek 常用模型（向下兼容）
DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"]


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def get_provider_config(provider_id: str) -> Optional[Dict[str, Any]]:
    """根据 ID 查找厂商配置"""
    for p in PROVIDER_REGISTRY:
        if p["id"] == provider_id:
            return p
    return None


def check_ollama_running(base_url: Optional[str] = None) -> bool:
    """检查当前主机上 Ollama 服务是否在运行。"""
    base_url = (base_url or settings.ollama_base_url).rstrip("/")
    try:
        import httpx
        r = httpx.get(f"{base_url}/api/tags", timeout=3.0)
        return r.status_code == 200
    except Exception:
        return False


def get_ollama_models(base_url: Optional[str] = None) -> List[str]:
    """获取当前 Ollama 已拉取的模型列表（/api/tags）。"""
    base_url = (base_url or settings.ollama_base_url).rstrip("/")
    try:
        import httpx
        r = httpx.get(f"{base_url}/api/tags", timeout=5.0)
        if r.status_code != 200:
            return []
        data = r.json()
        models = data.get("models") or []
        return [m.get("name", "") for m in models if m.get("name")]
    except Exception:
        return []


def has_provider_api_key(provider: str) -> bool:
    """检查指定厂商是否已配置 API Key"""
    return bool(get_provider_api_key(provider))


# 向下兼容
def has_deepseek_api_key() -> bool:
    """是否已配置 DeepSeek API Key"""
    return has_provider_api_key("deepseek")


def prompt_and_save_api_key(provider: str, console: Optional[Console] = None) -> bool:
    """
    若未配置指定厂商的 API Key，提示用户输入并保存到 SQLite。
    返回 True 表示已配置（原本就有或本次输入成功），False 表示未输入。
    """
    if has_provider_api_key(provider):
        return True
    try:
        config = get_provider_config(provider)
        display_name = config["name"] if config else provider
        if console:
            console.print(f"[yellow]尚未配置 {display_name} API Key，请输入（将保存到 SQLite）。[/yellow]")
        key = input(f"{provider.upper()}_API_KEY: ").strip()
        if not key:
            if console:
                console.print("[dim]未输入，已取消[/dim]")
            return False
        save_config_to_sqlite(
            f"{provider}_api_key", key,
            category="api_keys",
            description=f"{display_name} API Key",
        )
        if console:
            console.print(f"[green]✓ {display_name} API Key 已保存[/green]")

        # 自定义中转需要 base_url
        if config and config.get("needs_base_url"):
            if console:
                console.print("[yellow]请输入 API Base URL（如 https://your-proxy.com/v1）：[/yellow]")
            base_url = input("BASE_URL: ").strip()
            if base_url:
                save_config_to_sqlite(
                    f"{provider}_base_url", base_url,
                    category="api_keys",
                    description=f"{display_name} Base URL",
                )
                if console:
                    console.print(f"[green]✓ Base URL 已保存[/green]")
        return True
    except Exception as e:
        if console:
            console.print(f"[red]保存失败: {e}[/red]")
        return False


# 向下兼容
def prompt_and_save_deepseek_api_key(console: Optional[Console] = None) -> bool:
    """向下兼容：配置 DeepSeek API Key"""
    return prompt_and_save_api_key("deepseek", console)


def get_default_model_for_provider(provider: str) -> str:
    """获取厂商的默认模型名"""
    config = get_provider_config(provider)
    if not config:
        return "gpt-4o-mini"
    # 优先使用用户上次选择的模型
    saved = get_provider_model(provider)
    if saved:
        return saved
    # 向下兼容旧配置字段
    if provider == "ollama":
        return settings.ollama_model
    if provider == "deepseek":
        return settings.deepseek_model
    # 使用注册表中的默认模型
    if config["default_models"]:
        return config["default_models"][0]
    return "gpt-4o-mini"


def get_base_url_for_provider(provider: str) -> str:
    """获取厂商的 base_url"""
    # 优先用户自定义
    custom = get_provider_base_url(provider)
    if custom:
        return custom.rstrip("/")
    # 向下兼容旧配置字段
    if provider == "deepseek":
        return settings.deepseek_base_url.rstrip("/")
    if provider == "ollama":
        return settings.ollama_base_url.rstrip("/")
    # 注册表默认值
    config = get_provider_config(provider)
    if config:
        return (config.get("default_base_url") or "").rstrip("/")
    return ""


def get_llm_connection_hint(exception: Exception, provider: Optional[str] = None) -> str:
    """
    根据 LLM 调用异常返回给用户看的提示。
    """
    provider = (provider or settings.llm_provider or "ollama").strip().lower()
    s = str(exception).lower()
    errno = getattr(exception, "errno", None)
    if "connection refused" in s or errno == 61 or "errno 61" in s:
        if provider == "ollama":
            return (
                "无法连接 Ollama 服务（Connection refused）。"
                "请确认本机已启动 Ollama（运行 ollama serve 或打开 Ollama 应用），或使用 /model 切换到其他后端。"
            )
        return "无法连接 LLM 服务（Connection refused），请检查网络与配置。"
    if "api_key" in s or "unauthorized" in s or "401" in s:
        return f"API 认证失败，请使用 /model 重新配置 {provider} 的 API Key。"
    return str(exception)


# ---------------------------------------------------------------------------
# 交互式模型选择器（/model 命令）
# ---------------------------------------------------------------------------

def run_model_selector(
    console: Console,
    current_provider: Optional[str] = None,
    current_model: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    多厂商模型选择：展示所有支持的后端和配置状态。
    返回 (provider, model)，model 可为 None 表示使用该后端默认模型；
    若用户取消则返回 (None, None)。
    """
    current_provider = (current_provider or settings.llm_provider or "deepseek").strip().lower()
    current_model = (current_model or "").strip() or None

    # 构建状态表
    table = Table(show_header=True, header_style="bold cyan", title="选择模型后端")
    table.add_column("序号", style="dim", width=4)
    table.add_column("后端", width=22)
    table.add_column("说明", width=24)
    table.add_column("状态", width=20)

    for i, p in enumerate(PROVIDER_REGISTRY, 1):
        pid = p["id"]
        if pid == "ollama":
            ok = check_ollama_running()
            status = "[green]✓ 服务正常[/green]" if ok else "[red]✗ 未检测到[/red]"
        elif p["needs_api_key"]:
            ok = has_provider_api_key(pid)
            status = "[green]✓ 已配置[/green]" if ok else "[dim]未配置[/dim]"
        else:
            status = "[green]✓[/green]"
        table.add_row(str(i), p["name"], p["description"], status)

    console.print(
        Panel(
            table,
            title="[bold bright_blue] 模型 [/bold bright_blue]",
            border_style="bright_blue",
        )
    )
    console.print("[dim]当前: {}[/dim]\n".format(
        f"{current_provider} / {current_model or '(默认)'}"
    ))

    choice = input(f"输入序号选择 (1-{len(PROVIDER_REGISTRY)})，直接回车取消: ").strip()
    if not choice:
        return (None, None)

    try:
        idx = int(choice) - 1
        if idx < 0 or idx >= len(PROVIDER_REGISTRY):
            console.print("[yellow]无效序号，已取消[/yellow]")
            return (None, None)
    except ValueError:
        # 也支持直接输入 provider id
        found = None
        for p in PROVIDER_REGISTRY:
            if p["id"] == choice.lower():
                found = p
                break
        if not found:
            console.print("[yellow]无效输入，已取消[/yellow]")
            return (None, None)
        idx = PROVIDER_REGISTRY.index(found)

    selected = PROVIDER_REGISTRY[idx]
    provider_id = selected["id"]

    # Ollama 特殊处理
    if provider_id == "ollama":
        if not check_ollama_running():
            console.print(
                "[red]本机未检测到 Ollama 服务。请先启动 Ollama 后重试。[/red]"
            )
            return (None, None)
        models = get_ollama_models()
        if models:
            console.print("[dim]已拉取模型: {}[/dim]".format(", ".join(models[:10])))
            model_input = input(
                "输入模型名（直接回车使用默认 {}）: ".format(settings.ollama_model)
            ).strip()
            model = model_input if model_input else None
        else:
            model = None
        return (provider_id, model)

    # 需要 API Key 的厂商
    if selected["needs_api_key"] and not has_provider_api_key(provider_id):
        if not prompt_and_save_api_key(provider_id, console):
            return (None, None)

    # 自定义中转需要 base_url
    if selected.get("needs_base_url") and not get_provider_base_url(provider_id):
        console.print("[yellow]请输入 API Base URL（如 https://your-proxy.com/v1）：[/yellow]")
        base_url = input("BASE_URL: ").strip()
        if not base_url:
            console.print("[dim]未输入 Base URL，已取消[/dim]")
            return (None, None)
        save_config_to_sqlite(
            f"{provider_id}_base_url", base_url,
            category="api_keys",
            description=f"{selected['name']} Base URL",
        )

    # 选择模型
    default_models = selected["default_models"]
    default_model = get_default_model_for_provider(provider_id)
    if default_models:
        console.print("[dim]常用模型: {}[/dim]".format(", ".join(default_models)))
    model_input = input(
        "输入模型名（直接回车使用 {}）: ".format(default_model)
    ).strip()

    model = model_input if model_input else None

    # 保存用户选择的模型供下次默认
    if model:
        save_config_to_sqlite(
            f"{provider_id}_model", model,
            category="user_preference",
            description=f"{selected['name']} 用户选择的模型",
        )

    return (provider_id, model)
