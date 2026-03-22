# CHANGELOG

<!-- version list -->

## v1.3.0 (2026-03-22)

### Chores

- 移除旧版 RELEASE 文档，更新 desktop Cargo 与 uv.lock
  ([`9665019`](https://github.com/iammm0/secbot/commit/9665019627f4cc7775dbf30d84bfd1e57e3ced11))

### Documentation

- 更新 LICENSE 与 README
  ([`3216c15`](https://github.com/iammm0/secbot/commit/3216c155916d56d387979d703c9ddc10843f0b0a))

- 更新 repowiki（.qoder/repowiki/zh）
  ([`e741adc`](https://github.com/iammm0/secbot/commit/e741adce980314d7adc5a520d5d9b4d59b9c8ffd))

### Features

- **desktop**: 新增 Tauri 2 桌面端（核心 SSE 聊天）并更新 README
  ([`4b2d40f`](https://github.com/iammm0/secbot/commit/4b2d40fef468174101d79153c527ae08bf29701e))

- **router**: 支持 SECBOT_DESKTOP 等环境变量控制监听与热重载
  ([`60c0d0f`](https://github.com/iammm0/secbot/commit/60c0d0f44f4ad2e48e92da35a4531c4684aee9a9))


## v1.2.0 (2026-03-22)

### Features

- **tui**: 底部 SECBOT 改为固定绿色，移除彩虹动画
  ([`3df24e3`](https://github.com/iammm0/secbot/commit/3df24e3ee7c5ffe01abbadf2d43063620dfde697))


## v1.1.1 (2026-03-20)

### Bug Fixes

- **core**: 恢复 execute_todo 中的推理事件发送（thought_start/chunk/end）
  ([`74c228b`](https://github.com/iammm0/secbot/commit/74c228b2a47b8709ff7bc798b73e134752f7bad4))

### Code Style

- **core**: 代码格式化与推理事件发送优化
  ([`a09dddf`](https://github.com/iammm0/secbot/commit/a09dddf31f3be3ebbbd81078f7ed810cd55266ca))

### Documentation

- 更新 README.md 添加 pip 安装方式、主界面展示及技术栈徽章
  ([`de3c1c6`](https://github.com/iammm0/secbot/commit/de3c1c61cb459795c1bd334f7cf61c7cf95fccc5))

- 更新项目知识库与发布文档（repowiki、RELEASE_v1.0.1、CLI系统、LLM回退机制）
  ([`7d49eab`](https://github.com/iammm0/secbot/commit/7d49eabd357421dcc6d04a9bb45621b845210412))


## v1.1.0 (2026-03-15)

### Documentation

- Add repowiki knowledge base to version control
  ([`78239d2`](https://github.com/iammm0/secbot/commit/78239d28f722bd015488300030bde6e42a13e838))

- Rewrite README with open-source standards and organize docs directory
  ([`9922572`](https://github.com/iammm0/secbot/commit/9922572c6da4748d361dd64b1ea98dd68af6edd8))

### Features

- 智能体与 TUI 增强、LLM
  回退与文档（planner/qa/specialist、UserMessageBlock、LLM_PROVIDERS、llm_http_fallback、terminal_tool）
  ([`86fceb5`](https://github.com/iammm0/secbot/commit/86fceb520412103ebfc3ec734d7a5c305362e216))


## v1.0.0 (2026-03-11)

- Initial Release
