# Secbot Wiki

**Secbot** 是一个 AI 驱动的授权安全自动化工作台：NestJS 后端 + Ink 终端 UI + 多智能体编排 + 内置安全工具链。

> ⚠️ **仅用于已获得书面授权的安全测试、研究与教育。** 请勿对未授权目标进行扫描或利用。

## 当前产品状态

| 项目 | 说明 |
| --- | --- |
| **当前版本** | v2.0.0-b2（TypeScript 产品线） |
| **默认分支** | [`release`](https://github.com/iammm0/secbot/tree/release) |
| **安装方式** | [GitHub Releases](https://github.com/iammm0/secbot/releases) 下载 `.tgz`（**不发布到 npmjs**） |
| **官网** | https://secbot.site |

## 三条产品线

详见 [[Product-Lines|产品线说明]]：

- **v2 TypeScript** — `release` 分支，当前主产品
- **v1 Python** — `pypi-release` 分支，Legacy 维护线
- **Go Demo** — `pure-go` 分支，实验性，不作产品承诺

## 快速入口

| 我想… | 去看 |
| --- | --- |
| 安装并运行 | [[Installation|安装指南]] → [[Quick-Start|快速开始]] |
| 了解架构 | [[Architecture|系统架构]] |
| 理解 Agent 怎么工作 | [[Agent-Orchestration|智能体编排]] |
| 使用终端 UI | [[Terminal-UI|终端界面]] |
| 查工具与 Skills | [[Tools|工具清单]] · [[Skills-and-MCP|Skills 与 MCP]] |
| 配置 LLM / 环境变量 | [[Environment-Variables|环境变量]] |
| 发布与版本策略 | [[Release-and-Versioning|发布与版本]] |
| 参与开发 | [[Development|开发指南]] |
| 合规与安全 | [[Security|安全与合规]] |

## 三个 CLI 入口

```bash
secbot          # 终端 UI（默认 spawn 本地后端）
secbot-server   # 仅 NestJS API
secbot-mcp      # stdio MCP 服务器，暴露工具目录
```

## 仓库文档索引

Wiki 是面向用户的结构化入口；更细的实现细节仍在主仓库：

- [README（release 分支）](https://github.com/iammm0/secbot/blob/release/README.md)
- [README_CN](https://github.com/iammm0/secbot/blob/release/README_CN.md)
- [docs/QUICKSTART.md](https://github.com/iammm0/secbot/blob/release/docs/QUICKSTART.md)
- [docs/API.md](https://github.com/iammm0/secbot/blob/release/docs/API.md)
- [CLAUDE.md（贡献者 / AI Agent 指南）](https://github.com/iammm0/secbot/blob/release/CLAUDE.md)
