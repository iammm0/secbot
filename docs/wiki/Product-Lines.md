# 产品线说明

Secbot 仓库同时承载多条技术线。**对外宣发以 v2 TypeScript 为主**；v1 Python 在 PyPI 线维护；Go 仅为 Demo。

## v2 TypeScript 产品（当前主产品）

| 项 | 值 |
| --- | --- |
| 分支 | [`release`](https://github.com/iammm0/secbot/tree/release) |
| 版本 | v2.0.0-b2 及之后 |
| 发布 | [GitHub Releases](https://github.com/iammm0/secbot/releases)（`.tgz`） |
| 技术栈 | NestJS + Ink TUI + SQLite |
| 功能候选 | [`feat/claude-like-tui`](https://github.com/iammm0/secbot/tree/feat/claude-like-tui)（Claude-like 终端体验，合入 release 后打 GA） |

**不包含：** npmjs 公开发布。包内元数据名 `@opensec/secbot` 仅用于 tarball 本地安装。

## v1 Python 栈（Legacy）

| 项 | 值 |
| --- | --- |
| 分支 | [`pypi-release`](https://github.com/iammm0/secbot/tree/pypi-release) |
| 最后 GitHub Release 标记 | [v1.10.0 [Legacy · Python]](https://github.com/iammm0/secbot/releases/tag/v1.10.0) |
| 后续维护 | 在 `pypi-release` 分支继续演进 |
| PyPI | `secbot` 包（Python 线，与 TS v2 独立） |

v1 时代代码结构以 Python `app/` 为主；与 v2 无共用运行时。

## Go 实验（Demo）

| 项 | 值 |
| --- | --- |
| 分支 | [`pure-go`](https://github.com/iammm0/secbot/tree/pure-go) |
| 定位 | 技术验证 / Demo |
| 发布 | 无正式 Release，不对外承诺 |

## 分支冻结标签

历史快照（只读参考）：

- `release-freeze-2026-06-11` — release 基线
- `feat-claude-like-tui-freeze-2026-06-11` — Claude-like TUI 功能候选快照

## 该怎么选？

| 场景 | 选择 |
| --- | --- |
| 新用户 / 终端产品体验 | **v2 · release · GitHub Release .tgz** |
| 继续 Python 版维护 | **pypi-release** |
| 看 Go 重写实验 | **pure-go**（仅供研究） |
