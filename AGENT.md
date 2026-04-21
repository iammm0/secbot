# AGENT.md

这份文档面向以后进入本仓库工作的编码 agent。目标不是重复 `README.md`，而是让你在几分钟内建立一个**足够可靠的代码心智模型**，知道：

- 这个项目当前 `main-ts-version` 分支的真实主链路是什么
- 哪些模块是核心，哪些模块是扩展或历史遗留
- 改一个能力时应该从哪里下手
- 哪些命名、事件、接口是不能随便改的

当 `README`、`docs/` 和实现出现差异时，**以当前代码为准**。这份文档就是根据当前代码整理的。

---

## 1. 项目一句话概括

Secbot 是一个以 **NestJS (TypeScript) 后端** 为核心的 AI 自动化安全测试系统，后端负责：

- 请求路由与会话编排
- 规划任务（PlannerAgent）
- 通过 ReAct + 工具执行安全测试
- 将执行过程通过 SSE 推给终端 TUI 或自建客户端
- 用 SQLite 保存配置、对话、提示词链和审计数据

仓库里当前只维护一个前端：

- `terminal-ui/`: TypeScript + Ink 的终端 TUI

历史文档中提到的 `app/` 移动端和 `desktop/` 桌面端目录当前不在仓库中；不要按这些旧入口规划改动。

---

## 2. 技术栈

| 层 | 技术 |
|---|------|
| 语言 | TypeScript 5.x (strict) |
| 后端框架 | NestJS 11 + Express |
| 数据库 | SQLite via better-sqlite3 |
| 构建 | tsc (server/tsconfig.json) |
| 开发 | tsx watch (热重载) |
| CLI 入口 | `secbot` → `scripts/run-product.js` → `terminal-ui/dist/cli.js` |
| 后端入口 | `secbot-server` → `server/dist/main.js` |
| 终端前端 | Ink 4 + React 18 |
| 包管理 | npm (commonjs root, ESM sub-packages) |

---

## 3. 目录与模块速查

```
secbot/
├── server/src/                    # 后端源码（所有核心逻辑）
│   ├── main.ts                    # NestFactory.create(AppModule), port 8000
│   ├── app.module.ts              # 根模块，imports 12 个业务模块
│   ├── config/configuration.ts    # ConfigModule 加载
│   ├── common/
│   │   ├── llm/                   # LLM 抽象层（ollama.provider / openai-compat.provider）
│   │   ├── types.ts               # 公共类型
│   │   ├── event-bus.ts           # 内部事件总线
│   │   ├── filters/               # HttpExceptionFilter
│   │   └── interceptors/          # TransformInterceptor
│   └── modules/
│       ├── chat/                  # /api/chat SSE 端点
│       ├── agents/                # 多智能体框架
│       │   ├── agents.service.ts  # 路由决策 + 执行编排
│       │   └── core/              # Agent 实现
│       │       ├── base-agent.ts
│       │       ├── planner-agent.ts
│       │       ├── hackbot-agent.ts
│       │       ├── superhackbot-agent.ts
│       │       ├── security-react-agent.ts
│       │       ├── agent-router.ts
│       │       ├── qa-agent.ts
│       │       ├── summary-agent.ts
│       │       └── task-executor.ts
│       ├── tools/                 # 54 个安全工具
│       │   ├── tools.service.ts   # 工具注册 & 执行
│       │   ├── core/base-tool.ts  # 工具基类
│       │   ├── security/          # 19 个安全扫描/攻击工具
│       │   ├── defense/           # 5 个防御工具
│       │   ├── utility/           # 10 个实用工具
│       │   ├── protocol/          # 4 个协议探测工具
│       │   ├── osint/             # 4 个情报工具
│       │   ├── cloud/             # 3 个云安全工具
│       │   ├── reporting/         # 1 个报告工具
│       │   ├── control/           # 2 个控制工具
│       │   ├── crawler/           # 1 个爬虫工具
│       │   └── web-research/      # 5 个 Web 研究工具
│       ├── database/              # SQLite 持久化
│       ├── memory/                # 记忆子系统（短/长/情景 + 向量存储）
│       ├── vuln-db/               # 漏洞数据库（CVE/NVD/Exploit-DB/MITRE 适配器）
│       ├── network/               # 网络发现 + 远程控制
│       ├── defense/               # 防御扫描 API
│       ├── sessions/              # 会话管理
│       ├── system/                # 系统信息 + LLM 配置
│       ├── crawler/               # 爬虫调度
│       └── health/                # 健康检查
├── npm-bin/                       # CLI 入口包装脚本
├── terminal-ui/                   # Ink TUI（独立 package.json, ESM）
├── scripts/                       # 启动/构建/验证脚本
├── tools/                         # 工具能力说明文档（README.md）
├── skills/                        # Agent 技能定义（SKILL.md）
└── docs/                          # 项目文档
```

---

## 4. 最重要的事实

### 4.1 当前默认主 Agent 是协调器

后端实际注册的 agent key 是 `hackbot` 和 `superhackbot`。TUI 里仍保留 `secbot-cli` 这个历史默认值；发送到后端后，如果没有同名 agent，会回退到 `hackbot`。

主执行链路内部协调：

- `PlannerAgent` — 结构化规划
- `HackbotAgent` / `SuperHackbotAgent` — ReAct 执行
- `SecurityReActAgent` 的子类（NetworkRecon / WebPentest / OSINT / TerminalOps / DefenseMonitor）
- `SummaryAgent` — 汇总报告
- `QAAgent` — 简单问答回复

### 4.2 工具注册机制

`ToolsService` 从 `server/src/modules/tools/` 下各分类 `index.ts` 导入静态工具数组，再合并去重。每个工具通过继承 `BaseTool` 并实现 `run()` 方法来注册。

API 端点：
- `GET /api/tools` — 列出所有工具（按分类）
- `POST /api/tools/execute` — 执行指定工具

### 4.3 SSE 事件契约

`ChatController` 的 `/api/chat` 端点返回 SSE 流，事件类型包括：

| SSE event | 含义 |
|-----------|------|
| `connected` | 连接建立 |
| `planning` | 规划内容 |
| `thought_start` / `thought_chunk` / `thought_end` | 推理流 |
| `thought` | 完整推理结果 |
| `action_start` / `action_result` | 工具执行 |
| `observation` / `content` | 观察/内容 |
| `report` | 报告块 |
| `response` | 最终回复 |
| `phase` | 阶段切换 |
| `root_required` | 需要管理员权限 |
| `error` | 错误 |
| `done` | 完成 |

多数最终响应事件会带 `agent` 字段；中间事件以 `step_key`、`iteration`、`tool` 等字段关联时间线。

### 4.4 LLM 抽象层

`common/llm/` 提供统一的 LLM 调用接口：

- `LLMFactory` — 根据配置创建 provider
- `OllamaProvider` — 本地 Ollama
- `OpenAICompatProvider` — OpenAI 兼容接口（DeepSeek / OpenAI 等）

配置优先级：数据库存储 > 环境变量 > 默认值。

---

## 5. 常用操作速查

### 添加新工具

1. 在 `server/src/modules/tools/<category>/` 下创建 `xxx.tool.ts`
2. 继承 `BaseTool`，在构造函数中传入 `name`、`description`，并实现 `run()` 方法
3. 在同目录 `index.ts` 中导出
4. 把 `new XxxTool()` 加入该分类导出的工具数组

### 添加新 NestJS 模块

1. 在 `server/src/modules/` 下创建模块目录
2. 创建 `xxx.module.ts`、`xxx.controller.ts`、`xxx.service.ts`
3. 在 `app.module.ts` 的 `imports` 中添加

### 修改 Agent 行为

Agent 实现在 `server/src/modules/agents/core/` 下：
- 修改规划逻辑 → `planner-agent.ts`
- 修改 ReAct 循环 → `security-react-agent.ts`
- 修改工具路由 → `agent-router.ts`
- 修改报告生成 → `summary-agent.ts`

### 构建与发布

```bash
npm run build          # tsc 编译到 server/dist/
npm run release:pack   # clean + build + npm pack
npm start              # 运行编译后的产物
```

---

## 6. 不能随便改的接口

| 接口/命名 | 原因 |
|-----------|------|
| `/api/chat` SSE 事件名与 data 结构 | TUI 与自建客户端依赖 |
| `/api/tools`、`/api/tools/execute` | Agent 和前端都依赖 |
| `/api/system/info`、`/api/system/config` | 前端仪表盘依赖 |
| `/api/agents` | 前端 Agent 列表依赖 |
| `BaseTool` 的 `name` / `run` 签名 | 所有 54 个工具依赖 |
| `package.json` 的 `bin` / `main` / `files` | npm 发布依赖 |

---

## 7. 已知待完善

- 测试基础设施刚刚搭建（vitest），测试覆盖率待提升
- 部分工具为占位实现，外部工具调用路径需要鲁棒性验证
- 记忆和漏洞数据库的在线适配器需要更多 edge case 处理
- 爬虫模块的浏览器渲染路径尚未完全对齐
