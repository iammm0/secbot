# LangChainGo Agent Design Patterns Scaffold

基于 [LangChainGo](https://github.com/tmc/langchaingo) v0.1.14 的智能体设计模式全景脚手架，严格对齐《智能体设计模式》四大部分，涵盖 **15 种设计模式** + **5 种 LLM Provider** + **CLI 示例** + **HTTP API 服务层**。

## 架构总览

```
langchaingo-starter/
├── config/             # 统一配置管理
├── pkg/
│   ├── llm/            # LLM Provider 工厂 (OpenAI/Anthropic/Ollama/DeepSeek/GoogleAI)
│   ├── tools/          # 工具注册表 + 示例工具
│   ├── memory/         # Memory 封装
│   ├── callback/       # 日志回调 Handler
│   └── patterns/       # ===== 15 种设计模式 =====
│       ├── chaining/       # Ch1: 提示词链 (Simple + Sequential + Gate)
│       ├── routing/        # Ch2: 动态路由
│       ├── parallel/       # Ch3: 并行扇出 (Sectioning + Voting)
│       ├── reflection/     # Ch4: 反思循环
│       ├── tooluse/        # Ch5: 工具使用 (Functions + ReAct)
│       ├── prompting/      # AppA: 高级提示模板库
│       ├── planning/       # Ch6: 目标分解与执行
│       ├── multiagent/     # Ch7: 多智能体协作 (Orchestrator + Handoff)
│       ├── memoryctl/      # Ch8: 三层记忆管理
│       ├── rag/            # Ch14: RAG 知识检索
│       ├── resilience/     # Ch12: 异常处理与恢复
│       ├── guardrails/     # Ch18: 输入输出安全防护
│       └── evaluation/     # Ch19: LLM-as-Judge 评估
├── examples/           # 15 个可独立运行的 CLI 示例
└── server/             # HTTP API 服务层
```

## 快速开始

### 1. 配置环境

```bash
cp .env.example .env
# 编辑 .env，填入你的 API Key
```

### 2. 安装依赖

```bash
go mod tidy
```

### 3. 运行示例

```bash
# 查看所有可用示例
make examples

# 运行指定示例
make run-01   # Simple Chain
make run-05   # Reflection
make run-10   # Multi-Agent

# 或直接用 go run
go run ./examples/01_simple_chain/
```

### 4. 启动 HTTP API 服务

```bash
make run-server
# 或
go run ./server/

# 测试
curl http://localhost:8080/api/patterns
curl -X POST http://localhost:8080/api/run \
  -H "Content-Type: application/json" \
  -d '{"pattern": "chat", "input": "Hello!"}'
```

## 支持的 LLM Provider

| Provider | 环境变量 | 模型示例 |
|----------|---------|---------|
| OpenAI | `LLM_PROVIDER=openai` | gpt-4o, gpt-4o-mini |
| Anthropic | `LLM_PROVIDER=anthropic` | claude-3-5-sonnet-20241022 |
| Ollama | `LLM_PROVIDER=ollama` | llama3, mistral, qwen2 |
| DeepSeek | `LLM_PROVIDER=deepseek` | deepseek-chat, deepseek-reasoner |
| Google AI | `LLM_PROVIDER=googleai` | gemini-1.5-flash, gemini-1.5-pro |

DeepSeek 通过 OpenAI 兼容 API 接入，自动设置 `BASE_URL=https://api.deepseek.com/v1`。

## 设计模式索引

### 第一部分：基础模式

| # | 模式 | 包 | 示例 | 说明 |
|---|------|-----|------|------|
| 1 | 提示词链 | `patterns/chaining` | `01`, `02` | Simple Chain + Sequential Pipeline + Gate Chain |
| 2 | 路由 | `patterns/routing` | `03` | LLM 分类输入 -> 路由到专业 Handler |
| 3 | 并行化 | `patterns/parallel` | `04` | Fan-out 并发 + Voting/Concat/LLM 聚合 |
| 4 | 反思 | `patterns/reflection` | `05` | 生成 -> 评估 -> 改进迭代循环 |
| 5 | 工具使用 | `patterns/tooluse` | `06`, `07` | ReAct Agent + OpenAI Functions Agent |
| A | 高级提示 | `patterns/prompting` | `08` | Zero/Few-Shot, CoT, ReAct, Structured Output |

### 第二部分：复杂任务

| # | 模式 | 包 | 示例 | 说明 |
|---|------|-----|------|------|
| 6 | 规划 | `patterns/planning` | `09` | LLM 任务分解 -> 结构化计划 -> 执行 |
| 7 | 多智能体 | `patterns/multiagent` | `10` | Orchestrator-Worker + Handoff 协议 |
| 8 | 记忆管理 | `patterns/memoryctl` | `11` | 三层记忆: 短期Buffer + 中期Window + 长期摘要 |
| 14 | 知识检索 | `patterns/rag` | `12` | 完整 RAG: 切分 -> Embedding -> 向量检索 -> 生成 |

### 第三部分：工程化与安全

| # | 模式 | 包 | 示例 | 说明 |
|---|------|-----|------|------|
| 12 | 异常处理 | `patterns/resilience` | `13` | 重试 + 指数退避 + 回退模型 + 降级 |
| 18 | Guardrails | `patterns/guardrails` | `14` | 注入检测 + 敏感词过滤 + 格式校验 |

### 第四部分：评估

| # | 模式 | 包 | 示例 | 说明 |
|---|------|-----|------|------|
| 19 | 评估监控 | `patterns/evaluation` | `15` | LLM-as-Judge 多维度评分 |

## HTTP API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/patterns` | GET | 列出所有可用模式 |
| `/api/run` | POST | 执行指定模式 |
| `/api/run/stream` | POST | SSE 流式执行 |
| `/health` | GET | 健康检查 |

### 请求格式

```json
{
  "pattern": "reflection",
  "input": "Write a haiku about coding",
  "options": {
    "max_iterations": 3,
    "stop_score": 0.85
  }
}
```

### 可用 pattern 值

`chat`, `simple_chain`, `sequential_chain`, `routing`, `parallel`, `reflection`, `planning`, `evaluation`, `guardrails`

## 扩展指南

### 添加新工具

实现 `tools.Tool` 接口并注册到 `pkg/tools/registry.go`:

```go
type MyTool struct{}

func (t *MyTool) Name() string        { return "MyTool" }
func (t *MyTool) Description() string { return "Description of my tool" }
func (t *MyTool) Call(ctx context.Context, input string) (string, error) {
    // Your tool logic
    return "result", nil
}
```

### 添加新设计模式

1. 在 `pkg/patterns/` 下创建新包
2. 在 `examples/` 下添加 CLI 示例
3. 在 `server/handler.go` 中注册新的 pattern case

### 替换 RAG 向量存储

RAG 模块默认使用内存向量存储（无外部依赖），可替换为:

- pgvector: `github.com/tmc/langchaingo/vectorstores/pgvector`
- Chroma: `github.com/tmc/langchaingo/vectorstores/chroma`
- Pinecone: `github.com/tmc/langchaingo/vectorstores/pinecone`

## 技术栈

- **核心框架**: [LangChainGo](https://github.com/tmc/langchaingo) v0.1.14
- **语言**: Go 1.24+
- **HTTP**: 标准库 `net/http`（零外部路由依赖）
- **配置**: `godotenv` + 环境变量

## License

MIT
