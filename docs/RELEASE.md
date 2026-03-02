# 发布版使用说明

Hackbot 通过 **GitHub Release** 发布各平台打包好的安装包（zip），用户下载解压后即可在终端中运行，无需安装 Python。

**启动前唯一必须条件：配置 DeepSeek API Key。**

## 发布新版本（维护者）

1. 在 `pyproject.toml` 和 `hackbot/__init__.py` 中将版本号改为目标版本（如 `1.2.0`）。
2. 更新 `CHANGELOG.md` 中对应版本的变更说明。
3. 提交并推送后，打 tag 触发 GitHub Actions 构建并创建 Release（`.github/workflows/release.yml`）：
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```
4. 在 [Releases](https://github.com/iammm0/hackbot/releases) 中可编辑该 Release 的说明或附件。

## 下载

- **GitHub Release**：在 [Releases](https://github.com/iammm0/hackbot/releases) 中下载对应平台 **zip**，解压后得到 `hackbot` 目录：
  - `hackbot-linux-amd64.zip` — Linux x86_64
  - `hackbot-windows-amd64.zip` — Windows
  - `hackbot-darwin-arm64.zip` — macOS（Apple 芯片）
  - `hackbot-darwin-amd64.zip` — macOS（Intel 处理器）

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

在解压得到的 **`hackbot` 目录内**（或你启动程序时的当前工作目录）创建 `.env` 文件，内容：

```env
DEEPSEEK_API_KEY=sk-xxx
```

获取 API Key：<https://platform.deepseek.com>

## 运行

解压 zip 后进入 **`hackbot`** 目录：

- **Windows**：双击 `hackbot.exe`，或在终端中执行：
  ```cmd
  cd hackbot
  hackbot.exe
  ```
- **Linux / macOS**：在终端中执行：
  ```bash
  cd hackbot
  chmod +x hackbot   # 首次可选
  ./hackbot
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

- 安装依赖与 PyInstaller：`pip install -r requirements.txt pyinstaller` 或使用 `uv sync` 后 `uv pip install pyinstaller`。
- **Linux / macOS**：`bash scripts/build_release.sh`
- **Windows**：`scripts\build_release.bat`

产物在 `dist/hackbot/` 目录，内含 `hackbot`（或 `hackbot.exe`）及依赖库；进入该目录后运行即可。
