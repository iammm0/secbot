"""
工具扩展注册中心
支持 entry point 与配置自动发现，新工具无需修改 security/__init__.py 即可被 secbot 发现和调用。

使用方式：
1. Entry Point（推荐）：在 pyproject.toml 中声明
   [project.entry-points."secbot.tools.basic"]
   my_tools = "mypackage.tools:MY_TOOLS"

2. 环境变量：SECBOT_TOOL_MODULES、SECBOT_TOOL_MODULES_ADVANCED
   逗号分隔的模块路径，模块需导出 TOOLS 或 *_TOOLS 属性
"""
import os
from typing import List, Tuple

from tools.base import BaseTool
from utils.logger import logger

# Entry point 组名
ENTRY_POINT_BASIC = "secbot.tools.basic"
ENTRY_POINT_ADVANCED = "secbot.tools.advanced"

# 环境变量
ENV_TOOL_MODULES = "SECBOT_TOOL_MODULES"
ENV_TOOL_MODULES_ADVANCED = "SECBOT_TOOL_MODULES_ADVANCED"


def _load_tools_from_module(module_path: str) -> List[BaseTool]:
    """
    从模块加载工具列表。支持：
    - TOOLS / *_TOOLS：list 或 tuple
    - get_tools()：callable 返回 list/tuple
    - *Tool 类：继承 BaseTool 的类，自动实例化
    """
    try:
        import importlib

        mod = importlib.import_module(module_path)
        # 1. 优先查找 TOOLS、*_TOOLS
        for attr in dir(mod):
            if attr == "TOOLS" or (attr.endswith("_TOOLS") and not attr.startswith("_")):
                val = getattr(mod, attr)
                if isinstance(val, (list, tuple)):
                    return list(val)
        # 2. 其次查找 get_tools
        if hasattr(mod, "get_tools"):
            fn = getattr(mod, "get_tools")
            if callable(fn):
                out = fn()
                return list(out) if isinstance(out, (list, tuple)) else []
        # 3. 查找 BaseTool 子类（排除 BaseTool 自身）
        tools = []
        for attr in dir(mod):
            if attr.endswith("Tool") and attr != "BaseTool":
                try:
                    cls = getattr(mod, attr)
                    if isinstance(cls, type) and issubclass(cls, BaseTool):
                        tools.append(cls())
                except Exception:
                    pass
        return tools
    except Exception as e:
        logger.warning(f"加载工具模块 {module_path} 失败: {e}")
        return []


def _load_from_entry_points(group: str) -> List[BaseTool]:
    """从 setuptools entry point 加载工具"""
    tools: List[BaseTool] = []
    try:
        import importlib.metadata

        eps = importlib.metadata.entry_points()
        # 兼容 importlib.metadata 不同版本
        if hasattr(eps, "select"):
            entries = eps.select(group=group)
        else:
            entries = eps.get(group, [])
        for ep in entries:
            try:
                val = ep.load()
                if isinstance(val, (list, tuple)):
                    tools.extend(val)
                else:
                    logger.warning(f"Entry point {ep.name} 应返回 list/tuple，得到 {type(val)}")
            except Exception as e:
                logger.warning(f"加载 entry point {ep.name} ({group}) 失败: {e}")
    except ImportError:
        pass
    return tools


def _load_from_env(env_key: str) -> List[BaseTool]:
    """从环境变量指定的模块路径加载工具"""
    raw = os.environ.get(env_key, "").strip()
    if not raw:
        return []
    tools: List[BaseTool] = []
    for path in raw.split(","):
        path = path.strip()
        if path:
            tools.extend(_load_tools_from_module(path))
    return tools


def get_basic_tools() -> List[BaseTool]:
    """
    获取基础工具列表（secbot-cli / superhackbot 均可用）。
    来源：entry point secbot.tools.basic + 环境变量 SECBOT_TOOL_MODULES
    """
    tools: List[BaseTool] = []
    tools.extend(_load_from_entry_points(ENTRY_POINT_BASIC))
    tools.extend(_load_from_env(ENV_TOOL_MODULES))
    return tools


def get_advanced_tools() -> List[BaseTool]:
    """
    获取高级工具列表（仅 superhackbot，需用户确认）。
    来源：entry point secbot.tools.advanced + 环境变量 SECBOT_TOOL_MODULES_ADVANCED
    """
    tools: List[BaseTool] = []
    tools.extend(_load_from_entry_points(ENTRY_POINT_ADVANCED))
    tools.extend(_load_from_env(ENV_TOOL_MODULES_ADVANCED))
    return tools


def get_all_registered_tools() -> Tuple[List[BaseTool], List[BaseTool]]:
    """
    获取所有已注册工具。
    Returns:
        (basic_tools, advanced_tools)
    """
    return get_basic_tools(), get_advanced_tools()


def list_registered_tool_names() -> List[str]:
    """列出所有已注册工具名称（用于调试）"""
    basic, advanced = get_all_registered_tools()
    names = [t.name for t in basic] + [t.name for t in advanced]
    return names
