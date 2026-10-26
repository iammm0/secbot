# Bundled portable tools

CI / 本地可用 `node scripts/fetch-bundled-tools.mjs <platform>` 下载官方 Release 二进制到本目录：

- `tools/win-x64/` — Windows x64（`nuclei.exe`、`ffuf.exe`）
- `tools/linux-x64/` — Linux x64
- `tools/macos-arm64/` — macOS Apple Silicon

这些文件由发布流水线打进桌面安装包与 TUI 自包含包，**不入库**。

不随包：`nmap`（Npcap）、`nikto`（Perl）。Windows 上 nmap 走 winget；nikto 为可选。
