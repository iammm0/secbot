# Secbot Server

NestJS TypeScript 后端，提供 REST + SSE API，驱动 Agent 核心、安全工具、SQLite 存储和模型配置。

## 开发

从仓库根目录运行：

```bash
npm install
npm run dev
```

默认监听 `http://localhost:8000`，可通过 `PORT` 环境变量修改。

## 构建与启动

```bash
npm run build
npm start
```

也可以直接运行构建产物：

```bash
node server/dist/main.js
```

## 模块结构

- `modules/agents/`：Agent 核心（Hackbot、SuperHackbot、QA、Summary、Planner、TaskExecutor）。
- `modules/chat/`：`POST /api/chat` SSE 流式聊天与同步聊天。
- `modules/tools/`：54 个安全工具的静态注册与执行。
- `modules/defense/`：防御扫描与状态接口。
- `modules/database/`：SQLite 数据持久化。
- `modules/memory/`：短期、情景、长期与向量记忆。
- `modules/vuln-db/`：漏洞数据库与适配器。
- `modules/system/`：系统信息与 LLM provider 配置。
- `modules/network/`：网络发现、授权与远程控制。
- `modules/sessions/`：终端/远控会话记录。
- `modules/crawler/`：爬虫任务与监控。
- `modules/health/`：健康检查。
- `common/`：EventBus、类型、LLM 抽象、过滤器、拦截器。
