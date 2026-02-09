# 发布版使用说明

Hackbot 提供**单文件可执行程序**，可在 Windows、macOS、Linux 终端直接运行，无需安装 Python。  
**启动前唯一必须条件：配置 DeepSeek API Key。**

## 下载

- **GitHub Release**：在 [Releases](https://github.com/iammm0/hackbot/releases) 中下载对应平台文件：
  - `hackbot-windows-amd64.exe` — Windows
  - `hackbot-linux-amd64` — Linux
  - `hackbot-darwin-arm64` — macOS (Apple Silicon)

## 配置 DeepSeek API Key

任选一种方式即可。

### 方式一：环境变量

- **Linux / macOS**（当前终端）：
  ```bash
  export DEEPSEEK_API_KEY=sk-xxx
  ```
- **Windows**：在「系统属性 → 环境变量」中新建 `DEEPSEEK_API_KEY`，或在该终端中：
  ```cmd
  set DEEPSEEK_API_KEY=sk-xxx
  ```

### 方式二：.env 文件

在**可执行文件所在目录**（或你启动程序时的当前工作目录）创建 `.env` 文件，内容：

```env
DEEPSEEK_API_KEY=sk-xxx
```

获取 API Key：<https://platform.deepseek.com>

## 运行

- **Windows**：双击 `hackbot-windows-amd64.exe`，或在终端中执行：
  ```cmd
  .\hackbot-windows-amd64.exe
  ```
- **Linux / macOS**：在终端中执行（首次可先赋予执行权限）：
  ```bash
  chmod +x hackbot-linux-amd64   # 或 hackbot-darwin-arm64
  ./hackbot-linux-amd64
  ```

未带子命令时，程序会直接进入**交互式安全测试界面**。若未配置 `DEEPSEEK_API_KEY`，启动时会提示并退出。

## 可选配置

如需修改模型或其它选项，可在同目录的 `.env` 中增加（参考项目根目录的 `env.example`），例如：

```env
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_MODEL=deepseek-reasoner
LLM_PROVIDER=deepseek
```

## 自行从源码打包

- 安装依赖与 PyInstaller：`pip install -r requirements.txt pyinstaller`
- **Linux / macOS**：`bash scripts/build_release.sh`
- **Windows**：`scripts\build_release.bat`

产物在 `dist/` 目录：`hackbot` 或 `hackbot.exe`。
