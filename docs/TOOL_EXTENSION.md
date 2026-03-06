# Secbot 工具扩展机制

新工具无需修改 `tools/pentest/security/__init__.py` 即可被 secbot 发现和调用。

## 方式一：Entry Point（推荐，用于第三方包）

在扩展包的 `pyproject.toml` 中声明：

```toml
[project.entry-points."secbot.tools.basic"]
my_tools = "mypackage.tools:MY_TOOLS"

[project.entry-points."secbot.tools.advanced"]
my_exploit = "mypackage.exploit:EXPLOIT_TOOLS"
```

- **secbot.tools.basic**：基础工具，hackbot / superhackbot 均可用
- **secbot.tools.advanced**：高级工具，仅 superhackbot 可用，需用户确认

目标格式：
- `module.path:ATTR`：模块的 `ATTR` 属性，需为 `list` 或 `tuple`，元素为 `BaseTool` 实例
- `module.path:get_tools`：callable，返回 `list[BaseTool]`

## 方式二：环境变量（用于临时扩展）

```bash
# 基础工具，逗号分隔模块路径
export SECBOT_TOOL_MODULES="tools.web_search,mypackage.tools"

# 高级工具
export SECBOT_TOOL_MODULES_ADVANCED="mypackage.exploit"
```

模块需满足其一：
- 导出 `TOOLS` 或 `*_TOOLS`（list/tuple）
- 提供 `get_tools()` 返回 list/tuple
- 导出 `*Tool` 类（继承 `BaseTool`），自动实例化

## 示例：添加 web_search 工具

不修改 security 源码，仅设置环境变量：

```bash
export SECBOT_TOOL_MODULES="tools.web_search"
```

`tools.web_search` 模块包含 `WebSearchTool` 类，registry 会自动发现并实例化。

## 工具类要求

继承 `tools.base.BaseTool`，实现：

- `name`：工具唯一标识
- `description`：描述（供 LLM 理解）
- `get_schema()`：返回 `{name, description, parameters}`
- `execute(**kwargs)`：异步执行，返回 `ToolResult`

可选：`sensitivity = "high"` 表示敏感操作，superhackbot 会要求用户确认。
