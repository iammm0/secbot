# ExecGo 文档（中文）

本目录面向想把通用 Agent 接入可靠执行层的团队。ExecGo 不替代 Claude Code、Codex、Hermes Agent、OpenClaw
这类成熟 agent 的规划与交互体验，而是负责把它们生成的真实动作落成可验证、可取消、可审计、可恢复的任务。

本目录面向三类读者：

- 上层编排层/Agent 开发者：通过 adapter action 或 `TaskGraph` 接入 ExecGo，并正确处理失败、重试与取消语义
- 运维/平台工程师：在你自己的 Docker Compose 或 Kubernetes 集群中部署 ExecGo（含持久化与健康检查）
- 客户端开发者：用 Go/Java/Python 通过 HTTP 接入 ExecGo（提交任务图、轮询状态、读取结果）

如果你已经读过根目录 `README.md` 的“快速开始”，建议从下方对应章节继续。

## 文档导航

### 0) 项目定位与路线
- [Agent-First 执行内核路线图](./agent-kernel-roadmap.md)
- [ExecGo 与 execgo-runtime 的关系](./overview/execgo-and-runtime.md)

### 1) 通用 Agent 如何采用 ExecGo
- [Integration：成熟 Agent Adapter 接入](./integration/agent-adapter.md)
- [Integration：模式 A — `execgocli` 快速开始](./integration/mode-a-cli.md)
- [Integration：模式 B — translate + TaskGraph 升级](./integration/mode-b-upgrade.md)
- [Orchestrator：上层如何映射 DAG -> TaskGraph](./orchestrator/README.md)

### 2) 部署到 Docker Compose / Kubernetes
- [Deploy：Docker Compose](./deploy/compose.md)
- [Deploy：Kubernetes](./deploy/kubernetes.md)

### 3) 多语言 HTTP 接入示例（Go/Java/Python）
- [Integration：HTTP API 入门使用文档](./integration/http-api-getting-started.md)
- [Integration：Go 示例](./integration/client-go.md)
- [Integration：Java 示例](./integration/client-java.md)
- [Integration：Python 示例](./integration/client-python.md)
- [Integration：Node.js + TypeScript 示例](./integration/client-nodejs-ts.md)

### 4) 参考手册（API / Task DSL / 执行器参数等）
- [Reference：execgocli JSON 契约](./reference/execgo-cli-contract.md)
- [Reference：推广期安全默认](./reference/promotion-security.md)
- [Reference：API 端点与错误语义](./reference/api.md)
- [Reference：Task DSL（任务模型与校验）](./reference/task-dsl.md)
- [Reference：执行器参数与内置执行器](./reference/executors.md)

### 5) 常见疑惑（FAQ）
- [FAQ：使用者疑惑导览](./faqs.md)

### 6) 发布说明（Release Notes）
- [v1.1.0 发布说明](./releases/v1.1.0.md)
- [v1.0.0 发布说明](./releases/v1.0.0.md)

## 版本与兼容性

文档内容以当前仓库版本的 ExecGo 行为为准。若你升级 ExecGo 版本，建议优先阅读对应的 `TaskGraph` 提交/校验规则与执行器参数变更说明。
