"""
OpenCode 风格的模型选择：/model 无参时展示可选后端（Ollama / DeepSeek），
Ollama 会检查本机服务是否运行，DeepSeek 会检查并提示配置 API Key。
选择 DeepSeek 时若未配置密钥，会弹出输入框并保存到 SQLite。
"""
from typing import Optional, Tuple, List

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from config import settings

# 可选模型后端
PROVIDER_OLLAMA = "ollama"
PROVIDER_DEEPSEEK = "deepseek"
SUPPORTED_PROVIDERS = (PROVIDER_OLLAMA, PROVIDER_DEEPSEEK)

# DeepSeek 常用模型
DEEPSEEK_MODELS = ["deepseek-chat", "deepseek-reasoner"]


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


def has_deepseek_api_key() -> bool:
    """是否已配置 DeepSeek API Key（从 SQLite 读取）。"""
    return bool(settings.deepseek_api_key and settings.deepseek_api_key.strip())


def prompt_and_save_deepseek_api_key(console: Optional[Console] = None) -> bool:
    """
    若未配置 DeepSeek API Key，提示用户输入并保存到 SQLite。
    返回 True 表示已配置（原本就有或本次输入并保存成功），False 表示未输入或保存失败。
    """
    if has_deepseek_api_key():
        return True
    try:
        from database.manager import DatabaseManager
        from database.models import UserConfig

        if console:
            console.print(
                "[yellow]尚未配置 DeepSeek API Key，请输入（将保存到 SQLite）。[/yellow]"
            )
        key = input("DEEPSEEK_API_KEY: ").strip()
        if not key:
            if console:
                console.print("[dim]未输入，已取消[/dim]")
            return False
        db = DatabaseManager()
        db.save_config(
            UserConfig(
                key="deepseek_api_key",
                value=key,
                category="api_keys",
                description="DeepSeek API Key",
            )
        )
        if console:
            console.print("[green]✓ 已保存到 SQLite[/green]")
        return True
    except Exception as e:
        if console:
            console.print(f"[red]保存失败: {e}[/red]")
        return False


def get_llm_connection_hint(exception: Exception, provider: Optional[str] = None) -> str:
    """
    根据 LLM 调用异常返回给用户看的提示（如 Connection refused 时提示先启动 Ollama）。
    provider: 当前使用的后端 ollama / deepseek，不传则根据 settings 推断。
    """
    provider = (provider or settings.llm_provider or "ollama").strip().lower()
    s = str(exception).lower()
    errno = getattr(exception, "errno", None)
    if "connection refused" in s or errno == 61 or "errno 61" in s:
        if provider == "ollama":
            return (
                "无法连接 Ollama 服务（Connection refused）。"
                "请确认本机已启动 Ollama（运行 ollama serve 或打开 Ollama 应用），或使用 /model 切换到 DeepSeek。"
            )
        return "无法连接 LLM 服务（Connection refused），请检查网络与配置。"
    if "api_key" in s or "unauthorized" in s or "401" in s:
        return "API 认证失败，请检查 .env 中 DEEPSEEK_API_KEY 是否已正确配置。"
    return str(exception)


def run_model_selector(
    console: Console,
    current_provider: Optional[str] = None,
    current_model: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    OpenCode 风格模型选择：展示 Ollama / DeepSeek，选择后做可用性检查。
    返回 (provider, model)，model 可为 None 表示使用该后端默认模型；
    若用户取消则返回 (None, None)。
    """
    current_provider = (current_provider or settings.llm_provider or "ollama").strip().lower()
    current_model = (current_model or "").strip() or None

    # 状态行
    ollama_ok = check_ollama_running()
    deepseek_ok = has_deepseek_api_key()

    table = Table(show_header=True, header_style="bold cyan", title="选择模型后端")
    table.add_column("序号", style="dim", width=4)
    table.add_column("后端", width=12)
    table.add_column("说明", width=24)
    table.add_column("状态", width=20)

    table.add_row(
        "1",
        "ollama",
        "本地运行，无需 API Key",
        "[green]✓ 服务正常[/green]" if ollama_ok else "[red]✗ 未检测到服务[/red]",
    )
    table.add_row(
        "2",
        "deepseek",
        "云端 API，需配置 API Key",
        "[green]✓ 已配置[/green]" if deepseek_ok else "[yellow]未配置 DEEPSEEK_API_KEY[/yellow]",
    )

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

    choice = input("输入序号选择 (1=ollama, 2=deepseek)，直接回车取消: ").strip()
    if not choice:
        return (None, None)

    if choice == "1":
        if not ollama_ok:
            console.print(
                "[red]本机未检测到 Ollama 服务。请先启动 Ollama（如运行 ollama serve 或启动 Ollama 应用）后重试。[/red]"
            )
            return (None, None)
        provider = PROVIDER_OLLAMA
        models = get_ollama_models()
        if models:
            console.print("[dim]当前已拉取模型: {}[/dim]".format(", ".join(models[:10])))
            model_input = input("输入模型名（直接回车使用配置默认 {}）: ".format(settings.ollama_model)).strip()
            model = model_input if model_input else None
        else:
            model = None
        return (provider, model)

    if choice == "2":
        if not deepseek_ok:
            if not prompt_and_save_deepseek_api_key(console):
                return (None, None)
        provider = PROVIDER_DEEPSEEK
        console.print("[dim]常用模型: {}[/dim]".format(", ".join(DEEPSEEK_MODELS)))
        model_input = input(
            "输入模型名（直接回车使用配置默认 {}）: ".format(settings.deepseek_model)
        ).strip()
        if model_input and model_input.lower() == "reasoner":
            model = settings.deepseek_reasoner_model
        else:
            model = model_input if model_input else None
        return (provider, model)

    console.print("[yellow]无效序号，已取消[/yellow]")
    return (None, None)
