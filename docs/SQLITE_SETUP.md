# SQLite 数据库配置指南

## 概述

本项目使用 SQLite 作为本地数据库，用于存储：
- 对话历史记录
- 提示词链
- 用户配置
- 爬虫任务
- 攻击任务
- 扫描结果

## 快速开始

### 1. 配置数据库路径

在 `.env` 文件中配置 `DATABASE_URL`：

```env
# 相对路径（推荐，存储在项目根目录的 data 文件夹）
DATABASE_URL=sqlite:///./data/m_bot.db

# 绝对路径（Windows）
DATABASE_URL=sqlite:///C:/path/to/m_bot.db

# 绝对路径（Linux/Mac）
DATABASE_URL=sqlite:////path/to/m_bot.db
```

**如果不配置，默认使用**: `data/m_bot.db`

### 2. 数据库自动初始化

首次运行时，数据库会自动创建并初始化所有表结构。无需手动操作。

### 3. 测试数据库连接

运行测试脚本验证数据库功能：

```bash
python test_sqlite_connection.py
```

## 数据库结构

### 表说明

1. **conversations** - 对话历史记录
   - 存储智能体与用户的对话
   - 支持按智能体类型、会话ID查询

2. **prompt_chains** - 提示词链
   - 存储自定义提示词链配置
   - 支持名称唯一性

3. **user_configs** - 用户配置
   - 存储用户自定义配置项
   - 支持分类管理

4. **crawler_tasks** - 爬虫任务
   - 记录爬虫任务执行历史
   - 支持状态跟踪

5. **attack_tasks** - 攻击任务
   - 记录网络攻击测试任务
   - 支持定时调度

6. **scan_results** - 扫描结果
   - 存储网络扫描结果
   - 包含漏洞信息

## 使用示例

### 在代码中使用 DatabaseManager

```python
from database.manager import DatabaseManager
from database.models import Conversation
from datetime import datetime

# 初始化数据库管理器
db = DatabaseManager()

# 保存对话
conversation = Conversation(
    agent_type="simple",
    user_message="你好",
    assistant_message="你好！有什么可以帮助你的吗？",
    session_id="session-123",
    timestamp=datetime.now()
)
db.save_conversation(conversation)

# 获取对话历史
conversations = db.get_conversations(agent_type="simple", limit=10)

# 获取统计信息
stats = db.get_stats()
print(f"对话记录数: {stats['conversations']}")
```

### CLI 命令

```bash
# 查看数据库统计
python main.py db-stats

# 查看对话历史
python main.py db-history --limit 10

# 清空对话历史
python main.py db-clear --yes
```

## 数据库文件位置

- **默认位置**: `项目根目录/data/m_bot.db`
- **自定义位置**: 通过 `DATABASE_URL` 环境变量配置

## 备份和恢复

### 备份数据库

```bash
# Windows
copy data\m_bot.db backup\m_bot_backup.db

# Linux/Mac
cp data/m_bot.db backup/m_bot_backup.db
```

### 恢复数据库

```bash
# Windows
copy backup\m_bot_backup.db data\m_bot.db

# Linux/Mac
cp backup/m_bot_backup.db data/m_bot.db
```

## 注意事项

1. **数据库文件已添加到 `.gitignore`**，不会被提交到版本控制
2. **数据目录**: `data/` 目录包含所有数据库文件，已添加到 `.gitignore`
3. **并发访问**: SQLite 支持多读单写，适合单机应用
4. **性能**: 对于大量数据，建议定期清理历史记录

## 故障排除

### 数据库文件锁定

如果遇到 "database is locked" 错误：
- 检查是否有其他进程正在使用数据库
- 确保所有数据库连接已正确关闭

### 权限问题

如果遇到权限错误：
- 确保数据库文件所在目录有写权限
- 检查文件系统权限设置

### 数据库损坏

如果数据库文件损坏：
- 使用备份文件恢复
- 或删除数据库文件，系统会在下次运行时自动重建

**说明**：本项目仅使用 SQLite 作为数据库，不支持迁移到其他数据库类型。
