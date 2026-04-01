# Mobile / Desktop Terminal Todos

本文档用于承接 `terminal-ui` 已验证的终端交互，把 `mobile app` 与 `desktop` 版本继续推进到可扩展的终端工作台。

## P0 Shared Terminal Kernel

- [ ] 统一三端共享的 `SSEEvent` / `RenderBlock` / phase / root permission 数据模型。
- [ ] 抽离流式事件到块时间线的 reducer，避免 app 与 desktop 各自维护一套。
- [ ] 统一后端能力注册表：chat、tools、agents、system、network、defense、history。
- [ ] 统一错误文案与连接状态文案。
- [ ] 补齐 mock SSE transcript，用于桌面端与移动端一致性验证。

## P0 Desktop Workbench

- [ ] 把桌面端从单页聊天重构为工作台布局。
- [ ] 增加顶部状态条：后端状态、当前模式、智能体、模型、phase。
- [ ] 增加左侧导航/能力面板：会话、工具、智能体、系统配置摘要。
- [ ] 增加右侧 inspector：当前阶段、块统计、最后一次工具执行、报告摘要、错误信息。
- [ ] 增加命令面板（`Cmd/Ctrl + K`）和常用快捷操作。
- [ ] 增加快捷任务入口：内网发现、防御扫描、查看工具、查看智能体、清空记忆。
- [ ] 补齐 root permission 桌面弹窗与回传链路。
- [ ] 补齐工具中心、系统配置中心、日志/诊断面板。

## P0 Mobile Terminal

- [ ] 聊天页增加任务视图切换：Timeline / Plan / Tools / Report。
- [ ] 增加快捷任务 chips，降低重复输入成本。
- [ ] 增加 root permission 弹层与密码回传流程。
- [ ] 增加连接状态条与当前 phase 展示。
- [ ] 优化小屏消息块层级：推理、执行、结果、报告默认折叠策略。
- [ ] 增加空状态与常见任务模板。

## P1 System And Capability Surfaces

- [ ] 增加工具浏览器，对接 `/api/tools`。
- [ ] 增加智能体浏览器，对接 `/api/agents` 与 `/api/agents/clear`。
- [ ] 增加系统配置中心，对接 `/api/system/config`、`/api/system/config/providers`、`/api/system/config/provider/*`。
- [ ] 增加日志级别切换，对接 `/api/system/log-level`。
- [ ] 增加 Ollama 模型列表与拉取状态展示，对接 `/api/system/ollama-models`。

## P1 Security Operations Flows

- [ ] 网络发现 -> 目标详情 -> 授权 -> 撤销授权全链路可视化。
- [ ] 防御状态 -> 扫描 -> 报告查看 -> 封禁/解封全链路可视化。
- [ ] 历史记录 -> 会话回放 -> 二次提问 / 继续执行。
- [ ] 会话报告支持复制、导出、分享。

## P2 Interaction Quality

- [ ] 桌面端支持可调面板宽度与记忆布局。
- [ ] 移动端支持草稿保存与失败重发。
- [ ] 两端都支持命令收藏与最近使用。
- [ ] 补齐弱网、后端重启、SSE 中断、done 丢失等异常恢复策略。
- [ ] 补齐大输出性能优化与长列表滚动体验。

## 验收 Checklist

- [ ] ask / agent 两种模式都能正常工作。
- [ ] `root_required -> root-response -> done` 在 mobile / desktop 都可完成。
- [ ] 工具、智能体、系统配置、网络、防御、历史都能从 UI 进入。
- [ ] 大报告与大工具输出可以稳定滚动、复制与查看详情。
- [ ] 桌面端支持键盘主导操作，移动端支持拇指主导操作。
