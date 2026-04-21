# SQLite 数据库配置指南

Secbot 当前仅使用 SQLite 作为本地数据库。本文聚焦数据库路径、初始化、验证与备份；表结构和编程接口详见 [DATABASE_GUIDE.md](DATABASE_GUIDE.md)。

## 一、默认行为

不配置任何环境变量时，默认连接串为：

```text
sqlite:///./data/secbot.db
```

当前实现会把这个相对路径解析到 `hackbot_config/` 包目录下，因此源码运行时通常生成：

```text
hackbot_config/data/secbot.db
```

首次运行 `secbot`、`secbot model` 或 `secbot server` 时，数据库会自动创建并初始化表结构，无需手动建表。

## 二、自定义数据库路径

长期运行建议显式指定绝对路径，避免安装路径或工作目录变化导致多个数据库文件并存。

Linux / macOS：

```env
DATABASE_URL=sqlite:////srv/secbot/data/secbot.db
```

Windows：

```env
DATABASE_URL=sqlite:///C:/Users/you/secbot/secbot.db
```

源码开发时也可以使用相对路径：

```env
DATABASE_URL=sqlite:///./data/secbot.db
```

但需要注意：相对路径仍会按 `hackbot_config/` 包目录解析，不是按当前 shell 所在目录解析。

## 三、验证数据库

启动交互 CLI：

```bash
secbot
```

或只启动 API：

```bash
secbot server
```

查看数据库统计：

```bash
curl http://127.0.0.1:8000/api/db/stats
```

如果你只是想在 Python 中确认实际路径：

```python
from secbot_agent.database.manager import DatabaseManager

db = DatabaseManager()
print(db.db_path)
print(db.get_stats())
```

## 四、数据表概览

当前 `DatabaseManager` 会创建：

- `conversations`：对话历史。
- `prompt_chains`：提示词链。
- `user_configs`：用户配置，包括 `/model` 或 `secbot model` 保存的模型配置。
- `crawler_tasks`：爬虫任务。
- `attack_tasks`：攻击测试任务。
- `scan_results`：扫描结果。
- `audit_trail`：操作审计留痕。

## 五、备份和恢复

先确认实际数据库路径：

```python
from secbot_agent.database.manager import DatabaseManager

print(DatabaseManager().db_path)
```

Linux / macOS 备份示例：

```bash
mkdir -p /srv/secbot/backup
cp /srv/secbot/data/secbot.db /srv/secbot/backup/secbot.db.backup
```

Linux / macOS 恢复示例：

```bash
cp /srv/secbot/backup/secbot.db.backup /srv/secbot/data/secbot.db
```

Windows 备份示例：

```bat
copy C:\Users\you\secbot\secbot.db C:\Users\you\secbot\backup\secbot.db.backup
```

Windows 恢复示例：

```bat
copy C:\Users\you\secbot\backup\secbot.db.backup C:\Users\you\secbot\secbot.db
```

请把示例路径替换成 `DatabaseManager().db_path` 打印出的真实路径。

## 六、故障排除

### 数据库文件锁定

如果遇到 `database is locked`：

- 检查是否有多个长时间写入进程同时操作同一个数据库。
- 确认没有调试脚本持有连接不释放。
- 重启长期运行的 API 服务后再重试。

### 权限问题

如果遇到权限错误：

- 确认数据库目录存在且运行用户有读写权限。
- systemd 场景下确认 `User=` 对 `DATABASE_URL` 指向目录有权限。

### 数据库损坏

如果数据库文件损坏：

- 优先从备份恢复。
- 无关键数据时可删除数据库文件，系统会在下次运行时重新创建空库。

## 七、注意事项

1. 数据库文件、`data/` 和 `logs/` 不应提交到版本控制。
2. SQLite 支持多读单写，适合本地 CLI 与单机 API 服务。
3. 删除对话历史前建议先备份，API 删除操作不可恢复。
4. 当前项目没有数据库迁移到其他数据库类型的正式支持。
