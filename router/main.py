"""
Hackbot FastAPI 服务入口 — 组装所有路由、CORS、uvicorn 入口
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from router.chat import router as chat_router
from router.agents import router as agents_router
from router.sessions import router as sessions_router
from router.system import router as system_router
from router.defense import router as defense_router
from router.network import router as network_router
from router.database import router as database_router
from router.tools import router as tools_router
from router.dependencies import get_db_manager


def create_app() -> FastAPI:
    """FastAPI 应用工厂"""

    application = FastAPI(
        title="Hackbot API",
        description="Hackbot AI 安全测试机器人 — REST + SSE 接口",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ------------------------------------------------------------------
    # CORS — 允许 React Native (Expo) 开发环境访问
    # ------------------------------------------------------------------
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 开发阶段允许全部来源; 生产环境应限制
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------
    # 注册路由
    # ------------------------------------------------------------------
    application.include_router(chat_router)
    application.include_router(agents_router)
    application.include_router(sessions_router)
    application.include_router(system_router)
    application.include_router(defense_router)
    application.include_router(network_router)
    application.include_router(database_router)
    application.include_router(tools_router)

    # ------------------------------------------------------------------
    # 启动时初始化数据库（确保 secbot.db 与表在首次请求前就存在）
    # ------------------------------------------------------------------
    @application.on_event("startup")
    def _init_db_on_startup():
        get_db_manager()

    # ------------------------------------------------------------------
    # 健康检查
    # ------------------------------------------------------------------
    @application.get("/health", tags=["Health"])
    async def health():
        return {"status": "ok"}

    return application


# 全局 app 实例（供 uvicorn 直接引用: router.main:app）
app = create_app()


def run_server():
    """
    脚本入口 — hackbot-server 命令
    可通过 `hackbot-server` 或 `python -m router.main` 启动。

    环境变量（可选）:
    - SECBOT_DESKTOP=1: 桌面嵌入模式，默认 host=127.0.0.1、reload=False
    - SECBOT_SERVER_HOST / SECBOT_SERVER_PORT: 覆盖监听地址与端口
    - SECBOT_SERVER_RELOAD=true|false: 是否启用热重载（未设置则桌面模式关、否则开）
    """
    import os
    import socket
    import sys
    import uvicorn

    desktop = os.environ.get("SECBOT_DESKTOP", "").lower() in ("1", "true", "yes")
    default_host = "127.0.0.1" if desktop else "0.0.0.0"
    host = os.environ.get("SECBOT_SERVER_HOST", default_host)
    port = int(os.environ.get("SECBOT_SERVER_PORT", "8000"))
    reload_raw = os.environ.get("SECBOT_SERVER_RELOAD", "").lower()
    if reload_raw in ("1", "true", "yes"):
        reload = True
    elif reload_raw in ("0", "false", "no"):
        reload = False
    else:
        reload = not desktop

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", port)) == 0:
            print(
                f"端口 {port} 已被占用。请先停止占用 {port} 的进程后再启动。",
                file=sys.stderr,
            )
            print(f"  Windows: netstat -ano | findstr :{port} 查看 PID，再用 taskkill /PID <pid> /F 结束。", file=sys.stderr)
            sys.exit(1)
    uvicorn.run(
        "router.main:app",
        host=host,
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    run_server()