# 提示词链使用指南

## 概述

提示词链功能允许你灵活配置智能体的系统提示词，支持：
- 单个提示词
- 提示词链（多个提示词组合）
- 预定义模板
- 从文件加载

## 基本使用

### 1. 使用自定义提示词

```bash
python main.py chat "解释Python" --prompt "你是一个Python专家，请用简洁的语言解释"
```

### 2. 使用预定义模板

```bash
# 查看可用模板
python main.py prompt-list

# 使用模板
python main.py chat "写一首诗" --template creative
python main.py chat "分析代码" --template technical
```

### 3. 使用提示词链

提示词链允许组合多个提示词：

```bash
# 组合多个模板或链
python main.py chat "回答问题" --prompt-chain expert,technical
```

### 4. 从文件加载

```bash
# 从文本文件加载
python main.py chat "回答问题" --prompt-file prompts/my_prompt.txt

# 从JSON文件加载（支持提示词链）
python main.py chat "回答问题" --prompt-file prompts/my_chain.json
```

## 创建提示词链

### 使用命令行创建

```bash
python main.py prompt-create expert_assistant \
  --role "你是一个专业的技术顾问" \
  --instruction "请提供详细、准确的技术建议" \
  --constraint "回答要简洁明了，不超过200字" \
  --example "示例：当用户问'什么是Python'时，回答'Python是一种高级编程语言...'"
```

### 使用JSON文件创建

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
python main.py prompt-load prompts/my_chain.json
python main.py chat "解释Python" --prompt-chain expert_assistant
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

```bash
# 使用自定义提示词
python main.py interactive --prompt "你是一个友好的助手"

# 使用模板
python main.py interactive --template expert

# 使用提示词链
python main.py interactive --prompt-chain expert,technical
```

## 提示词链最佳实践

1. **角色定义** (order: 0-9): 定义智能体的角色
2. **指令** (order: 10-19): 说明智能体应该如何工作
3. **上下文** (order: 20-29): 提供背景信息
4. **约束** (order: 30-39): 设置限制条件
5. **示例** (order: 40+): 提供示例

## 示例

### 示例1：技术专家

```bash
python main.py prompt-create tech_expert \
  --role "你是一个资深的软件工程师，有10年以上的开发经验" \
  --instruction "请用专业但易懂的语言解释技术问题，提供代码示例" \
  --constraint "代码示例要完整可运行，注释要清晰"
```

### 示例2：创意写作助手

```bash
python main.py prompt-create creative_writer \
  --role "你是一个富有创造力的写作助手" \
  --instruction "请创作富有想象力和感染力的文字" \
  --example "当用户要求写诗时，创作押韵且有意境的诗歌"
```

### 示例3：数据分析师

```bash
python main.py prompt-create data_analyst \
  --role "你是一个数据分析专家" \
  --instruction "分析数据时要提供统计信息、趋势分析和建议" \
  --constraint "所有数据要准确，结论要有依据"
```

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

