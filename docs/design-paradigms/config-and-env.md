# 配置与环境变量范式

程序内持久化、环境变量兜底、敏感信息存储与 env.example 约定，与具体业务无关。

## 1. 环境变量分层

- **首选程序内持久化**：发布后的用户侧配置（当前模型厂商、API Key、Base URL、默认模型、日志级别等）优先通过 CLI 或设置页写入本地数据库/密钥环，让用户不必先手写 `.env`。
- **环境变量兜底**：使用 `python-dotenv` 或类似在应用启动时加载 `.env`，用于 CI、无人值守进程、临时覆盖和首次启动前的默认值。
- **键命名**：按模块或功能前缀，如 `LLM_PROVIDER`、`OLLAMA_BASE_URL`、`DEEPSEEK_API_KEY`、`DATABASE_URL`、`LOG_LEVEL`，便于搜索与文档化。
- **布尔与数字**：用字符串（如 `true`/`false`、`0.7`），在代码里按需转为 bool/float；或约定 `1`/`0`、`yes`/`no` 并统一解析，避免多处解析逻辑不一致。
- **优先级要写清**：文档中明确说明常见读取顺序，例如「数据库/密钥环 > 环境变量 > 内置默认」，避免用户不知道改哪里生效。

## 2. env.example 约定

- **提供 env.example**：说明 `.env` 是否必需、适用场景和最小启动方式。不包含真实密钥或敏感信息。
- **说明格式**：注释写清「当 XXX 时使用」「格式：…」「不设置时默认…」，便于新人与部署复制为 `.env` 后修改。
- **完整参考可拆分**：如果变量很多，可以用 `env.example` 放最小说明，用 `.env.backup` / `.env.full.example` 放完整参考，避免新用户误以为所有变量都必须填写。
- **删除未接入配置**：未实现或当前未接入的服务不要出现在主示例中；如确需保留历史说明，应标注「当前代码未读取」。

## 3. 敏感信息与 keyring

- **原则**：API Key、密码等不写入仓库；本地开发可放 `.env` 且必须被 `.gitignore` 忽略，生产建议用系统密钥环、数据库加密字段或平台密钥管理服务。
- **keyring**：使用 `keyring` 库，以「服务名 + 提供方」为键（如 `(KEYRING_SERVICE, provider)`）存取密码；提供 `get_api_key(provider)`、`set_api_key(provider, key)`、`delete_api_key(provider)`，以及可选的交互式 `configure_api_key(provider)`（用 getpass 输入，不回显）。
- **回退**：若 keyring 不可用或用户选择「用环境变量」，可约定如 `DEEPSEEK_API_KEY` 作为兜底来源，并在代码与文档中保持同一优先级描述。

## 4. 配置状态与诊断

- **show_config_status()**：返回各 provider 是否已配置（如 `{ "deepseek": True, "ollama": False }`），便于 CLI 子命令或调试页展示「哪些已配置、哪些未配置」，而不暴露具体密钥。
- **日志**：避免在日志中打印完整 API Key；若需标识，仅打印前缀或掩码（如前 8 位 + `***`）。

## 5. 可复用要点小结

- 发布后配置优先程序内持久化；`.env` 是 CI、无人值守和覆盖默认值的兜底。
- 键名分层、注释完整；提供 env.example 且不含敏感信息。
- 敏感信息：keyring/本地数据库 + 可选 env 回退；提供 get/set/delete/configure 与 status。
- 配置状态接口用于 CLI/调试，不暴露密钥；日志中不输出完整密钥。
