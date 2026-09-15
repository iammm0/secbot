# 分支策略

Secbot **只维护一条产品线**：[`release`](https://github.com/iammm0/secbot/tree/release)。新功能、文档、CI 与 GitHub Releases 都落在这条分支。

历史 Python 线与 Go 实验分支已经 **冻结**（只读归档，不再接受新功能或常规修复）。

## 当前产品（`release`）

| 项 | 值 |
| --- | --- |
| 分支 | [`release`](https://github.com/iammm0/secbot/tree/release)（仓库默认分支） |
| 版本 | v2.0.0-b2 及之后 |
| 发布 | [GitHub Releases](https://github.com/iammm0/secbot/releases)（`.tgz`） |
| 技术栈 | NestJS + Ink TUI + Web / 桌面端 + SQLite |

**不包含：** npmjs 公开发布。包内元数据名 `@opensec/secbot` 仅用于 tarball 本地安装。

## 已冻结归档

| 分支 | 曾经定位 | 状态 |
| --- | --- | --- |
| [`pypi-release`](https://github.com/iammm0/secbot/tree/pypi-release) | v1 Python 栈（PyPI `secbot`） | **冻结** · 只读；最后标记见 [v1.10.0](https://github.com/iammm0/secbot/releases/tag/v1.10.0) |
| [`pure-go`](https://github.com/iammm0/secbot/tree/pure-go) | Go 重写实验 / Demo | **冻结** · 只读；无正式 Release |

这两条分支与当前 `release` 无共用运行时，也不再作为安装或二次开发入口。

## 历史快照标签

只读参考（与当前维护策略无关）：

- `release-freeze-2026-06-11` — 当时的 release 基线
- `feat-claude-like-tui-freeze-2026-06-11` — Claude-like TUI 功能候选快照

## 该怎么选？

| 场景 | 选择 |
| --- | --- |
| 新用户 / 日常使用 / 二次开发 | **`release`** · [GitHub Release `.tgz`](https://github.com/iammm0/secbot/releases) |
| 查阅旧 Python / Go 实现 | 对应冻结分支（只读，不承诺更新） |
