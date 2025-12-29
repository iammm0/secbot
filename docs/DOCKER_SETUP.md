# Docker 开发环境设置指南

## 概述

本项目提供了 Docker Compose 配置文件，用于在本地开发环境中快速启动数据库服务（ChromaDB 和 Redis）。

## 快速开始

### 1. 启动所有服务

```bash
# 使用默认配置
docker-compose up -d

# 或使用开发配置（数据存储在本地 data/ 目录）
docker-compose -f docker-compose.dev.yml up -d
```

### 2. 查看服务状态

```bash
docker-compose ps
```

### 3. 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f chromadb
docker-compose logs -f redis
```

### 4. 停止服务

```bash
docker-compose down

# 停止并删除数据卷（注意：会删除所有数据）
docker-compose down -v
```

## 服务说明

### ChromaDB（向量数据库）

- **端口**: 8000
- **访问地址**: http://localhost:8000
- **API文档**: http://localhost:8000/docs
- **数据持久化**: 
  - 默认配置：存储在 Docker 卷中
  - 开发配置：存储在 `./data/chromadb/` 目录

**使用示例**:
```python
import chromadb
client = chromadb.HttpClient(host="localhost", port=8000)
```

### Redis（内存数据库和缓存）

- **端口**: 6379
- **密码**: `m-bot-redis-password`（可在环境变量中配置）
- **数据持久化**: 
  - 默认配置：存储在 Docker 卷中
  - 开发配置：存储在 `./data/redis/` 目录

**连接字符串格式**:
```
redis://:m-bot-redis-password@localhost:6379/0
```

**使用示例**:
```python
import redis
r = redis.Redis(
    host='localhost',
    port=6379,
    password='m-bot-redis-password',
    decode_responses=True
)
```

## 环境变量配置

在 `.env` 文件中配置（参考 `env.example`）：

```env
# Redis配置
REDIS_URL=redis://:m-bot-redis-password@localhost:6379/0

# ChromaDB配置
CHROMA_HOST=localhost
CHROMA_PORT=8000
```

## 自定义配置

### 修改 Redis 密码

1. 在 `.env` 文件中设置：
   ```env
   REDIS_PASSWORD=your-custom-password
   ```

2. 更新 `REDIS_URL`：
   ```env
   REDIS_URL=redis://:your-custom-password@localhost:6379/0
   ```

### 修改端口

编辑 `docker-compose.yml` 或 `docker-compose.dev.yml`：

```yaml
services:
  chromadb:
    ports:
      - "8001:8000"  # 将本地端口改为8001
  
  redis:
    ports:
      - "6380:6379"  # 将本地端口改为6380
```

## 数据管理

### 备份数据

```bash
# 备份 ChromaDB 数据
docker cp m-bot-chromadb:/chroma/chroma ./backup/chromadb

# 备份 Redis 数据
docker exec m-bot-redis redis-cli --rdb /data/dump.rdb
docker cp m-bot-redis:/data/dump.rdb ./backup/redis/
```

### 恢复数据

```bash
# 恢复 ChromaDB 数据
docker cp ./backup/chromadb m-bot-chromadb:/chroma/

# 恢复 Redis 数据
docker cp ./backup/redis/dump.rdb m-bot-redis:/data/
docker exec m-bot-redis redis-cli --rdb /data/dump.rdb
```

## 健康检查

所有服务都配置了健康检查，可以通过以下命令查看：

```bash
docker-compose ps
```

状态显示为 `healthy` 表示服务正常运行。

## 故障排除

### 端口被占用

如果端口已被占用，可以：

1. 修改 `docker-compose.yml` 中的端口映射
2. 或停止占用端口的服务

### 数据丢失

- 默认配置：数据存储在 Docker 卷中，删除容器不会丢失数据
- 开发配置：数据存储在本地 `data/` 目录，删除容器不会丢失数据
- 使用 `docker-compose down -v` 会删除所有数据卷

### 连接失败

1. 检查服务是否运行：`docker-compose ps`
2. 检查日志：`docker-compose logs`
3. 检查防火墙设置
4. 验证连接字符串和密码是否正确

## 开发建议

1. **使用开发配置**：在开发时使用 `docker-compose.dev.yml`，数据存储在本地，便于备份和调试
2. **定期备份**：重要数据定期备份到 `backup/` 目录
3. **环境隔离**：不同环境使用不同的 Docker Compose 文件
4. **资源限制**：生产环境建议添加资源限制（CPU、内存）

## 清理

```bash
# 停止并删除容器
docker-compose down

# 停止并删除容器和数据卷
docker-compose down -v

# 删除所有相关镜像（谨慎使用）
docker-compose down --rmi all
```

