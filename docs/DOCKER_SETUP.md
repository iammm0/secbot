# Docker 相关说明

## 当前状态

截至当前仓库版本，**Secbot 没有维护中的官方 Dockerfile / docker-compose 部署方案**。

这意味着：

- 仓库里没有可直接拿来构建应用镜像的正式 Dockerfile
- 也没有与当前代码同步维护的 `docker-compose.yml` / `docker-compose.prod.yml`
- 文档中若提到历史上的容器化方案，均不应再视作现成可用

## 当前推荐做法

如果你的目标是稳定运行后端，请优先使用：

- `npm start`（一键启动）
- `node server/dist/main.js`（生产模式）
- systemd / supervisor / pm2 等宿主机进程管理方案

具体见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## SQLite 说明

当前项目只依赖 **SQLite**（通过 better-sqlite3），不需要额外启动：

- Redis
- ChromaDB
- PostgreSQL

因此多数部署场景下，宿主机能提供：

- 一个可写的数据目录
- 一个可写的日志目录

就已经足够。

## 如果你必须自行容器化

建议把容器化范围限制在**后端 API**，并显式配置：

- Node.js 24+ 运行时（推荐使用 `node:24-alpine` 基础镜像）
- `npm install` 安装依赖
- `npm run build` 构建 TypeScript
- `.env` 注入
- `DATABASE_PATH` 绝对路径
- 挂载 SQLite 数据目录与日志目录

参考 Dockerfile 示例：

```dockerfile
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 8000
ENV PORT=8000

CMD ["node", "server/dist/main.js"]
```

同时请注意：

- `terminal-ui` 依赖 Node 与真实 TTY，更适合作为本地交互界面，而不是容器内常驻前端
- 移动端与桌面端本质上都是调用后端 API，不要求它们和后端打进同一个镜像

## 文档边界

若后续仓库重新引入并维护容器化产物，再补充正式说明。
