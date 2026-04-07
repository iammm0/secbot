# Docker 相关说明

## 当前状态

截至当前仓库版本，**Secbot 没有维护中的官方 Dockerfile / docker-compose 部署方案**。

这意味着：

- 仓库里没有可直接拿来构建应用镜像的正式 Dockerfile
- 也没有与当前代码同步维护的 `docker-compose.yml` / `docker-compose.prod.yml`
- 文档中若提到历史上的容器化方案，均不应再视作现成可用

## 当前推荐做法

如果你的目标是稳定运行后端，请优先使用：

- `uv run secbot --backend`
- `python -m router.main`
- systemd / supervisor / pm2 等宿主机进程管理方案

具体见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## SQLite 说明

当前项目只依赖 **SQLite**，不需要额外启动：

- Redis
- ChromaDB
- PostgreSQL

因此多数部署场景下，宿主机能提供：

- 一个可写的数据目录
- 一个可写的日志目录

就已经足够。

## 如果你必须自行容器化

建议把容器化范围限制在**后端 API**，并显式配置：

- Python 运行时
- `uv sync` 安装依赖
- `.env` 注入
- `DATABASE_URL` 绝对路径
- 挂载 SQLite 数据目录与日志目录

同时请注意：

- 交互 CLI 更适合作为宿主机本地工具，而不是容器内常驻前端

## 文档边界

为了避免误导，本文档不再提供未经验证的 `docker build`、`docker-compose up` 示例命令。若后续仓库重新引入并维护容器化产物，再补充正式说明。
