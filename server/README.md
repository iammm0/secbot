# OpenComsAgent Server

NestJS TypeScript 后端，提供 REST + SSE API，驱动 Agent 核心与安全工具。

## 开发

```bash
cd server
npm install
npm run start:dev
```

默认监听 `http://localhost:8000`，可通过 `PORT` 环境变量修改。

## 构建

```bash
npm run build
npm start
```

## 模块结构

- `modules/agents/` — Agent 核心（BaseAgent、ReAct 循环、Hackbot、SuperHackbot、QA、Summary、Planner）
- `modules/chat/` — 聊天路由（SSE 流式 + 同步）
- `modules/tools/` — 安全工具注册（12+ 工具）
- `modules/defense/` — 防御扫描与管理
- `modules/database/` — SQLite 数据持久化
- `modules/system/` — 系统信息与配置
- `modules/network/` — 网络发现与授权
- `common/` — EventBus、类型、LLM 抽象、配置
