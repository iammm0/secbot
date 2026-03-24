# 协议探测工具 (protocol)

## 模块概述

提供常见协议与服务的探测能力，包括 SMB 枚举、Redis 未授权检测、MySQL 信息探测和 SNMP 查询。适用于内网服务发现与配置审计。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| SmbEnumTool | smb_enum | SMB 共享与用户枚举 | host, port |
| RedisProbeTool | redis_probe | Redis 未授权访问检测 | host, port |
| MysqlProbeTool | mysql_probe | MySQL 信息探测 | host, port |
| SnmpQueryTool | snmp_query | SNMP 查询 | host, community |

## 依赖关系

- 继承 `tools.base.BaseTool`
- 被 `tools.pentest.security` 引入为 `PROTOCOL_TOOLS`
- 依赖对应协议的客户端库

## 使用示例

```
用户: 检测 192.168.1.1 的 Redis 是否未授权
Agent: 调用 redis_probe(host="192.168.1.1", port=6379)
```

## 安全与权限

- 均为 sensitivity=low
- 仅进行信息探测，不执行写入或破坏性操作
