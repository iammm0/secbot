# Secbot Wiki 源文件

本目录是 [GitHub Wiki](https://github.com/iammm0/secbot/wiki) 的源 Markdown。

## 在线阅读（无需 Wiki Git）

https://github.com/iammm0/secbot/tree/release/docs/wiki

## 同步到 GitHub Wiki

Wiki 的 `.wiki.git` 仓库在**首次保存 Wiki 页面**后才会创建。

### 一次性初始化（仅第一次）

1. 打开 https://github.com/iammm0/secbot/wiki/_new  
2. 标题填 `Home`，内容随意（例如 `# Secbot Wiki`），点击 **Save Page**

### 自动发布

初始化完成后，任选其一：

```bash
# 本地
./scripts/publish-wiki-local.sh

# 或 GitHub Actions
gh workflow run publish-wiki.yml --ref release
```

修改 `docs/wiki/**` 并 push 到 `release` 分支时，也会自动触发 **Publish Wiki** workflow。

## 页面列表

| 文件 | 主题 |
| --- | --- |
| `Home.md` | 首页 |
| `Product-Lines.md` | 三条产品线 |
| `Installation.md` | 安装 |
| `Quick-Start.md` | 快速开始 |
| `Architecture.md` | 架构 |
| `Agent-Orchestration.md` | 智能体编排 |
| `Terminal-UI.md` | 终端 UI |
| `Tools.md` | 工具 |
| `Skills-and-MCP.md` | Skills / MCP |
| `Environment-Variables.md` | 环境变量 |
| `Release-and-Versioning.md` | 发布与版本 |
| `Development.md` | 开发 |
| `Security.md` | 安全合规 |
| `_Sidebar.md` | Wiki 侧栏 |
