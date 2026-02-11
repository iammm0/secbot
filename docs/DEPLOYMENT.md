# M-Bot 部署指南

本文档介绍如何打包和部署 M-Bot 应用。

## 目录

- [Python 包安装](#python-包安装)
- [Docker 部署](#docker-部署)
- [生产环境部署](#生产环境部署)
- [配置说明](#配置说明)

## Python 包安装

### 方式一：从源码安装

```bash
# 克隆仓库
git clone https://github.com/zhaomingjun/m-bot.git
cd m-bot

# 安装依赖
pip install -r requirements.txt

# 安装包（开发模式）
pip install -e .

# 或安装为系统包
pip install .
```

### 方式二：构建分发包

```bash
# 安装构建工具
pip install build wheel

# 构建分发包
python -m build

# 构建结果在 dist/ 目录
# - dist/m-bot-1.0.0.tar.gz (源码包)
# - dist/m_bot-1.0.0-py3-none-any.whl (wheel 包)

# 安装构建的包
pip install dist/m_bot-1.0.0-py3-none-any.whl
```

### 使用安装后的命令

安装后可以直接使用 `m-bot` 命令：

```bash
m-bot --help
m-bot chat "你好"
```

## Docker 部署

### 构建镜像

```bash
# 构建 Docker 镜像
docker build -t m-bot:latest .

# 查看镜像
docker images | grep m-bot
```

### 运行容器

```bash
# 使用 docker-compose（推荐）
docker-compose up -d

# 或直接运行
docker run -d \
  --name m-bot \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/.env:/app/.env:ro \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  m-bot:latest
```

### 使用生产环境配置

```bash
# 使用生产环境 docker-compose
docker-compose -f docker-compose.prod.yml up -d

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f m-bot

# 停止服务
docker-compose -f docker-compose.prod.yml down
```

## 生产环境部署

### 前置要求

1. **Ollama 服务**：确保 Ollama 服务正在运行
   ```bash
   # 检查 Ollama 是否运行
   curl http://localhost:11434/api/tags
   ```

2. **环境变量**：创建 `.env` 文件
   ```bash
   cp env.example .env
   # 编辑 .env 文件，配置必要的参数
   ```

3. **数据目录**：确保数据目录有写权限
   ```bash
   mkdir -p data/chromadb data/redis logs
   chmod -R 755 data logs
   ```

### 部署步骤

#### 1. 使用 Docker Compose（推荐）

```bash
# 1. 克隆或复制项目文件
git clone https://github.com/zhaomingjun/m-bot.git
cd m-bot

# 2. 配置环境变量
cp env.example .env
nano .env  # 编辑配置

# 3. 启动服务
docker-compose -f docker-compose.prod.yml up -d

# 4. 查看服务状态
docker-compose -f docker-compose.prod.yml ps

# 5. 查看日志
docker-compose -f docker-compose.prod.yml logs -f
```

#### 2. 直接使用 Python

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置环境变量
cp env.example .env
nano .env

# 3. 启动 ChromaDB 和 Redis（如果使用）
docker-compose up -d chromadb redis

# 4. 运行应用
python main.py chat "你好"
```

### 系统服务（systemd）

创建 systemd 服务文件 `/etc/systemd/system/m-bot.service`：

```ini
[Unit]
Description=M-Bot Security Agent
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/m-bot
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/python main.py interactive
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl enable m-bot
sudo systemctl start m-bot
sudo systemctl status m-bot
```

## 配置说明

### 环境变量

主要环境变量配置（详见 `env.example`）：

- `OLLAMA_BASE_URL`: Ollama 服务地址（默认: http://localhost:11434）
- `OLLAMA_MODEL`: 使用的模型名称（默认: gpt-oss:20b）
- `DATABASE_URL`: 数据库连接字符串（默认: sqlite:///./agents.db）
- `REDIS_URL`: Redis 连接字符串（默认: redis://localhost:6379/0）
- `CHROMA_HOST`: ChromaDB 主机地址（默认: localhost）
- `CHROMA_PORT`: ChromaDB 端口（默认: 8000）
- `STT_MODEL`: 语音识别模型（默认: base）
- `TTS_ENGINE`: 语音合成引擎（默认: gtts）

### 数据持久化

确保以下目录有写权限并定期备份：

- `data/chromadb/`: ChromaDB 向量数据库数据
- `data/redis/`: Redis 持久化数据
- `agents.db`: SQLite 数据库文件
- `logs/`: 日志文件

### 网络配置

如果使用 Docker，确保：

1. **Ollama 访问**：如果 Ollama 在宿主机运行，使用 `host.docker.internal`（Mac/Windows）或 `172.17.0.1`（Linux）
2. **端口映射**：确保 ChromaDB (8000) 和 Redis (6379) 端口可访问
3. **防火墙**：根据需要开放端口

## 验证部署

### 检查服务状态

```bash
# 检查 Docker 容器
docker ps | grep m-bot

# 检查日志
docker logs m-bot

# 测试 CLI
python main.py --help
```

### 运行测试

```bash
# 运行单元测试
pytest tests/

# 测试数据库连接
python tests/test_db_connection.py

# 测试智能体
python tests/test_agents.py
```

## 故障排查

### 常见问题

1. **Ollama 连接失败**
   - 检查 Ollama 服务是否运行
   - 验证 `OLLAMA_BASE_URL` 配置
   - 检查网络连接和防火墙

2. **数据库连接失败**
   - 检查数据库服务是否运行
   - 验证连接字符串格式
   - 检查文件权限

3. **依赖安装失败**
   - 使用 Python 3.10+
   - 更新 pip: `pip install --upgrade pip`
   - 使用虚拟环境隔离依赖

4. **Docker 构建失败**
   - 检查 Dockerfile 语法
   - 清理构建缓存: `docker builder prune`
   - 检查网络连接（下载依赖）

### 日志查看

```bash
# Docker 日志
docker logs -f m-bot

# 应用日志
tail -f logs/agent.log

# 系统日志（systemd）
journalctl -u m-bot -f
```

## 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建（Docker）
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# 或更新 Python 包
pip install --upgrade -r requirements.txt
pip install -e . --upgrade
```

## 安全建议

1. **环境变量**：不要在代码中硬编码敏感信息
2. **文件权限**：限制数据目录和日志文件的访问权限
3. **网络安全**：在生产环境中使用 HTTPS 和认证
4. **定期备份**：备份数据库和配置文件
5. **监控**：设置日志监控和告警

## 支持

如有问题，请查看：
- [README.md](README.md) - 项目说明
- [docs/](docs/) - 详细文档
- [Issues](https://github.com/zhaomingjun/m-bot/issues) - 问题反馈

