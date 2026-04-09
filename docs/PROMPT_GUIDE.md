# 提示词链使用指南

## 概述

提示词链功能允许你灵活配置智能体的系统提示词，支持：
- 单个提示词
- 提示词链（多个提示词组合）
- 预定义模板
- 从文件加载

## 基本使用

本程序无参数启动即进入交互模式（`python scripts/main.py` 或 `secbot`），交互模式会占据整个终端。在交互界面内可：

1. **使用自定义提示词 / 模板 / 链**：通过界面内的模型或提示配置、或斜杠命令（如 `/model`、`/prompt-list`）进行设置。
2. **查看可用模板与链**：在交互模式中输入 `/prompt-list` 查看已注册的模板和提示词链。
3. **使用提示词链**：在配置或对话上下文中指定组合（如 expert,technical）。
4. **从文件加载**：若项目支持从文件加载提示词，可在配置或相应命令中指定路径（如 prompts/my_prompt.txt 或 prompts/my_chain.json）。具体以当前版本界面为准。

## 创建提示词链

可通过数据库、配置文件或交互模式内提供的功能创建提示词链（具体以当前版本为准）。以下为 JSON 文件格式说明，便于手工或脚本创建。

### 使用 JSON 文件创建

创建 `prompts/my_chain.json`:

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
      "content": "回答要简洁明了，不超过200字",
      "order": 20,
      "metadata": {}
    }
  ]
}
```

然后加载：

```bash
python scripts/main.py prompt-load prompts/my_chain.json
python scripts/main.py chat "解释Python" --prompt-chain expert_assistant
```

### 使用YAML文件创建

创建 `prompts/my_chain.yaml`:

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
    content: "回答要简洁明了，不超过200字"
    order: 20
```

## 提示词链结构

提示词链由多个节点组成，每个节点有：

- **name**: 节点名称
- **content**: 提示词内容
- **order**: 排序顺序（数字越小越靠前）
- **metadata**: 元数据（可选）

节点会按照 `order` 排序后组合。

## 预定义模板

系统内置以下模板：

- `assistant`: 通用助手
- `expert`: 专家模式
- `creative`: 创意模式
- `analytical`: 分析模式
- `friendly`: 友好模式
- `technical`: 技术专家模式

## 在交互模式中使用

无参数启动即进入交互模式（`python scripts/main.py` 或 `secbot`）。在交互界面内可通过斜杠命令或模型/提示配置使用提示词、模板或提示词链，例如使用 `/model` 选择后端后，在对话中或相应设置里指定自定义提示词、模板（如 expert）或链（如 expert,technical）。具体以当前界面提供的命令为准；输入 `/` 后回车可查看全部命令。

## 提示词链最佳实践

1. **角色定义** (order: 0-9): 定义智能体的角色
2. **指令** (order: 10-19): 说明智能体应该如何工作
3. **上下文** (order: 20-29): 提供背景信息
4. **约束** (order: 30-39): 设置限制条件
5. **示例** (order: 40+): 提供示例

## 示例

以下为提示词链内容示例，可写入 JSON 文件或通过交互模式/数据库配置使用：

- **技术专家**：角色「资深的软件工程师，10年以上开发经验」；指令「用专业但易懂的语言解释技术问题，提供代码示例」；约束「代码示例要完整可运行，注释要清晰」。
- **创意写作助手**：角色「富有创造力的写作助手」；指令「创作富有想象力和感染力的文字」；示例「当用户要求写诗时，创作押韵且有意境的诗歌」。
- **数据分析师**：角色「数据分析专家」；指令「分析数据时提供统计信息、趋势分析和建议」；约束「所有数据要准确，结论要有依据」。

## 提示词文件格式

### 纯文本格式

直接包含提示词内容：

```
你是一个专业的Python编程助手。
请用简洁明了的语言回答问题。
提供代码示例时要确保可运行。
```

### JSON格式（提示词链）

```json
{
  "name": "my_chain",
  "nodes": [
    {
      "name": "role",
      "content": "角色定义",
      "order": 0
    },
    {
      "name": "instruction",
      "content": "指令",
      "order": 10
    }
  ]
}
```

## 注意事项

1. 提示词链中的节点会按照 `order` 排序
2. 如果多个选项同时指定，优先级：`prompt_file` > `prompt_chain` > `prompt_template` > `prompt`
3. 提示词过长可能影响性能，建议控制在合理长度
4. 可以保存提示词链到文件以便重复使用

