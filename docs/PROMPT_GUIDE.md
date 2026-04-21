# 提示词与提示词链指南

本文档对齐当前 Python 代码里的 `secbot_agent.prompts` 实现。当前 CLI 没有 `prompt-load`、`prompt-list`、`chat --prompt-chain` 这类子命令；提示词能力主要通过 API 请求参数和编程接口使用。

## 一、当前可用入口

### API 单次覆盖系统提示词

`POST /api/chat` 与 `POST /api/chat/sync` 请求体支持 `prompt` 字段。传入后，后端会临时更新目标智能体的系统提示词。

```bash
curl -N -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "解释这段日志的安全风险",
    "mode": "ask",
    "agent": "secbot-cli",
    "prompt": "你是一个严谨的安全日志分析助手，回答时先列风险再给建议。"
  }'
```

### 编程接口管理模板与链

核心类：

- `secbot_agent.prompts.manager.PromptManager`
- `secbot_agent.prompts.chain.PromptChain`
- `secbot_agent.prompts.chain.PromptChainBuilder`

`PromptManager` 可加载内置模板、注册提示词链、从 JSON/YAML/文本文件加载链，并在传入 `DatabaseManager` 时保存到 SQLite。

## 二、内置模板

`PromptManager` 默认内置：

- `assistant`：通用助手。
- `expert`：专家模式。
- `creative`：创意模式。
- `analytical`：分析模式。
- `friendly`：友好模式。
- `technical`：技术专家模式。
- `hackbot_security`：Secbot 安全测试系统提示词。

示例：

```python
from secbot_agent.prompts.manager import PromptManager

manager = PromptManager()
print(manager.list_templates())
print(manager.get_template("technical"))
```

## 三、创建提示词链

### 使用构建器

```python
from secbot_agent.prompts.manager import PromptManager

manager = PromptManager()

chain = (
    manager.create_chain("expert_assistant")
    .add_role("你是一个专业的技术顾问", order=0)
    .add_instruction("请提供详细、准确的技术建议", order=10)
    .add_constraint("回答要简洁明了，不超过 200 字", order=20)
    .build()
)

manager.register_chain(chain)
print(chain.get_combined())
```

### 使用 JSON 文件

`prompts/my_chain.json`：

```json
{
  "name": "expert_assistant",
  "nodes": [
    {
      "name": "role",
      "content": "你是一个专业的技术顾问",
      "order": 0,
      "metadata": {}
    },
    {
      "name": "instruction",
      "content": "请提供详细、准确的技术建议",
      "order": 10,
      "metadata": {}
    },
    {
      "name": "constraint",
      "content": "回答要简洁明了，不超过 200 字",
      "order": 20,
      "metadata": {}
    }
  ]
}
```

加载：

```python
from pathlib import Path

from secbot_agent.prompts.manager import PromptManager

manager = PromptManager()
chain = manager.load_chain_from_file(Path("prompts/my_chain.json"))
print(chain.get_combined() if chain else "加载失败")
```

### 使用 YAML 文件

`prompts/my_chain.yaml`：

```yaml
name: expert_assistant
nodes:
  - name: role
    content: "你是一个专业的技术顾问"
    order: 0
  - name: instruction
    content: "请提供详细、准确的技术建议"
    order: 10
  - name: constraint
    content: "回答要简洁明了，不超过 200 字"
    order: 20
```

### 使用纯文本文件

纯文本文件会被加载为只有一个节点的提示词链，链名为文件名 stem。

```text
你是一个专业的 Python 编程助手。
请用简洁明了的语言回答问题。
提供代码示例时要确保可运行。
```

## 四、持久化到 SQLite

向 `PromptManager` 传入 `DatabaseManager` 后，`register_chain()` 会保存到 `prompt_chains` 表。

```python
from secbot_agent.database.manager import DatabaseManager
from secbot_agent.prompts.manager import PromptManager

db = DatabaseManager()
manager = PromptManager(db_manager=db)

chain = manager.build_from_string("你是安全测试助手。\n---\n只在授权范围内回答。")
manager.register_chain(chain)

print(manager.list_chains())
```

## 五、提示词链结构

提示词链由多个节点组成，每个节点包含：

- `name`：节点名称。
- `content`：提示词内容。
- `order`：排序顺序，数字越小越靠前。
- `metadata`：可选元数据。

组合时会按 `order` 排序，再用空行拼接为最终提示词。

## 六、最佳实践

1. 角色定义放在最前，例如 `order=0`。
2. 指令放在角色之后，例如 `order=10`。
3. 上下文、边界、授权范围放在中段，例如 `order=20`。
4. 约束和输出格式靠后，例如 `order=30`。
5. 示例可以放在最后，例如 `order=40` 以后。

## 七、注意事项

1. 当前 CLI 交互命令主要是 `/help` 与 `/model`；不要把提示词链当作已暴露的 CLI 子命令使用。
2. API 的 `prompt` 是单次请求级别的覆盖；如果需要跨请求复用，请在外部客户端或自定义集成中加载提示词链后再传入。
3. 提示词过长会增加上下文成本，也可能影响模型稳定性。
4. 保存到 SQLite 前请确认内容不包含不应落盘的敏感信息。

