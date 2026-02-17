# Docker 相关说明

## 当前策略

**本项目仅使用 SQLite 作为数据库**，不再依赖 ChromaDB、Redis 或其他外部数据库服务。运行 secbot / hackbot 时无需启动任何额外数据库容器。

## 使用 Docker 部署应用

若需使用 Docker 构建并运行 Hackbot 应用本身，请参阅 [部署指南 (DEPLOYMENT)](DEPLOYMENT.md)，其中包含镜像构建、数据卷挂载（如 `data/`、`logs/`）及环境变量配置说明。

## 关于仓库中的 docker-compose 文件

仓库中 `deploy/` 目录下可能仍存在曾用于 ChromaDB、Redis 的 docker-compose 配置，仅为历史保留。**日常使用与部署 secbot 时无需执行这些服务**，仅需保证应用可写目录（如 `data/`、`logs/`）及 SQLite 数据库可用即可。
