# Hackbot 部署指南

本文档介绍如何打包和部署 Hackbot 应用。

## 目录

- [Python 包安装](#python-包安装)
- [Docker 部署](#docker-部署)
- [生产环境部署](#生产环境部署)
- [配置说明](#配置说明)

## Python 包安装

Hackbot 使用 [uv](https://github.com/astral-sh/uv) 作为包管理器。

### 方式一：从源码安装

```bash
# 克隆仓库
git clone https://github.com/iammm0/hackbot.git
cd hackbot

# 安装依赖 (使用 uv)
uv sync

# 安装包（开发模式）
uv pip install -e .
```

### 方式二：构建分发包

```bash
# 构建分发包 (使用 uv)
uv run python -m build

# 构建结果在 dist/ 目录
# - dist/hackbot-1.0.0.tar.gz (源码包)
# - dist/hackbot-1.0.0-py3-none-any.whl (wheel 包)

# 安装构建的包
uv pip install dist/hackbot-*.whl
```

### 使用安装后的命令

安装后可直接使用 `hackbot` 或 `secbot`（无参数即进入交互模式，占据整个终端）：

```bash
hackbot
# 或 secbot
```

## Docker 部署

### 构建镜像

```bash
# 构建 Docker 镜像
docker build -t hackbot:latest .

# 查看镜像
docker images | grep hackbot
```

### 运行容器

```bash
# 使用 docker-compose（推荐）
docker-compose up -d

# 或直接运行
docker run -d \
  --name hackbot \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/.env:/app/.env:ro \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  hackbot:latest
```

### 使用生产环境配置

```bash
# 使用生产环境 docker-compose
docker-compose -f docker-compose.prod.yml up -d

# 查看日志
docker-compose -f docker-compose.prod.yml logs -f hackbot

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

3. **数据目录**：确保数据目录有写权限（SQLite 数据库与日志存放于此）
   ```bash
   mkdir -p data logs
   chmod -R 755 data logs
   ```

### 部署步骤

#### 1. 使用 Docker Compose（推荐）

```bash
# 1. 克隆或复制项目文件
git clone https://github.com/iammm0/hackbot.git
cd hackbot

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
# 1. 安装依赖 (使用 uv)
uv sync

# 2. 配置环境变量
cp env.example .env
nano .env

# 3. 运行应用（无参数即进入交互模式，项目仅使用 SQLite，无需额外数据库服务）
uv run python main.py
```

### 系统服务（systemd）

创建 systemd 服务文件 `/etc/systemd/system/hackbot.service`：

```ini
[Unit]
Description=Hackbot Security Agent
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/hackbot
ExecStart=/path/to/hackbot/.venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl enable hackbot
sudo systemctl start hackbot
sudo systemctl status hackbot
```

## 配置说明

### 环境变量

主要环境变量配置（详见 `env.example`）：

- `OLLAMA_BASE_URL`: Ollama 服务地址（默认: http://localhost:11434）
- `OLLAMA_MODEL`: 使用的模型名称（默认: gemma3:1b，本地没有时会自动拉取）
- `DATABASE_URL`: SQLite 数据库连接字符串（默认: sqlite:///./data/agents.db 或项目内约定路径）
- `STT_MODEL`: 语音识别模型（默认: base）
- `TTS_ENGINE`: 语音合成引擎（默认: gtts）

### 数据持久化

本项目仅使用 SQLite。确保以下目录有写权限并定期备份：

- `data/`: SQLite 数据库文件（如 `agents.db`、`m_bot.db` 等，以项目实际为准）
- `logs/`: 日志文件

### 网络配置

如果使用 Docker 部署应用，确保：

1. **Ollama 访问**：若 Ollama 在宿主机运行，使用 `host.docker.internal`（Mac/Windows）或 `172.17.0.1`（Linux）
2. **防火墙**：根据需要开放应用所需端口

## 验证部署

### 检查服务状态

```bash
# 检查 Docker 容器
docker ps | grep hackbot

# 检查日志
docker logs hackbot

# 测试 CLI
uv run python main.py --help
```

### 运行测试

```bash
# 运行单元测试
uv run pytest tests/

# 测试数据库连接
uv run python tests/test_db_connection.py

# 测试智能体
uv run python tests/test_agents.py
```

## 故障排查

### 常见问题

1. **Ollama 连接失败**
   - 检查 Ollama 服务是否运行
   - 验证 `OLLAMA_BASE_URL` 配置
   - 检查网络连接和防火墙

2. **数据库（SQLite）异常**
   - 检查 `data/` 目录是否存在且可写
   - 验证 `DATABASE_URL` 指向的路径与文件权限

3. **依赖安装失败**
   - 使用 Python 3.10+
   - 使用 uv 更新: `uv pip install --upgrade uv`
   - 确保 uv 已正确安装

4. **Docker 构建失败**
   - 检查 Dockerfile 语法
   - 清理构建缓存: `docker builder prune`
   - 检查网络连接（下载依赖）

### 日志查看

```bash
# Docker 日志
docker logs -f hackbot

# 应用日志
tail -f logs/agent.log

# 系统日志（systemd）
journalctl -u hackbot -f
```

## 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建（Docker）
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# 或更新 Python 包
uv sync
uv pip install -e . --upgrade
```

## 安全建议

1. **环境变量**：不要在代码中硬编码敏感信息
2. **文件权限**：限制数据目录和日志文件的访问权限
3. **网络安全**：在生产环境中使用 HTTPS 和认证
4. **定期备份**：备份数据库和配置文件
5. **监控**：设置日志监控和告警

## 支持

如有问题，请查看：
- [README.md](../README.md) - 项目说明
- [docs/](docs/) - 详细文档
- [Issues](https://github.com/iammm0/hackbot/issues) - 问题反馈

