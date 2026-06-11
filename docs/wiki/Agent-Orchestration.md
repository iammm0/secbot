# 智能体编排

每条用户消息经 `ChatService.handleMessage` 处理，核心流程如下。

## 1. 意图分类（IntentRouter）

单次 LLM 调用，输出 6 类意图之一：

| 意图 | 行为 |
| --- | --- |
| `small_talk` | 闲聊，直接回复 |
| `meta` | 关于产品本身的问题 |
| `qa` | 知识问答（QA Agent） |
| `clarify_needed` | 需要用户澄清 |
| `task_simple` | 简单任务 → 单轮 ReAct |
| `task_complex` | 复杂任务 → 规划 + 并行执行 |

同时输出：`needs_explore`、`needs_report`、`focus` 等标志。

SSE：`intent_decision`

## 2. 探索阶段（ExploreAgent，可选）

当 `needs_explore=true`：

- ReAct 微循环（默认最多 12 步，`SECBOT_EXPLORE_MAX_ITERS`）
- 允许：`vuln_db_query`、`browser_session` 等只读工具
- **禁止**：标记为 `sensitive` 的工具
- 结果写入上下文 patch

SSE：`explore_start` · `explore_step` · `explore_end` · `context_patch`

## 3. 上下文组装（ContextAssemblerService）

合并以下来源，受模型上下文预算约束：

- 固定事实（pinned facts）
- 近期会话
- SQLite 历史
- 向量检索命中

SSE：`context_usage`（TUI 右下角 ctx 组件）  
调试：`SECBOT_CONTEXT_DEBUG=1` → `context_debug`

## 4. 任务执行

### task_simple

跳过 Planner，直接 `SecurityReActAgent.process`（单 Agent ReAct 循环）。

### task_complex

1. **PlannerAgent** — 生成分层 todo 计划  
2. **TaskExecutor** — 按层并行执行  
3. 可选 **adaptive replan**（`SECBOT_ADAPTIVE_REPLAN=false` 可关闭）  
4. **SummaryAgent** — 仅当 `needs_report=true` 时生成报告

## 5. ReAct 解析

使用 `parseToolAction`（`parse-tool-action.ts`）：

- 支持 markdown 包裹的 `Action:`
- 支持 ` ```json ` 代码块
- 支持嵌套 `{}`

解析失败且无 `Final Answer` 时，Agent 会要求模型修正格式。

## 6. 主要 SSE 事件（TUI）

| 事件 | 含义 |
| --- | --- |
| `thought_*` | 推理过程 |
| `action_*` | 工具调用与结果 |
| `planning` | 计划与 todo 状态 |
| `report` | 最终报告 |
| `response` | 流式文本回复 |
| `phase` | 阶段切换 |
| `done` / `error` | 结束 / 错误 |

## Agent 类型

| Agent | 用途 |
| --- | --- |
| SecurityReActAgent | 主 ReAct 安全执行 |
| ExploreAgent | 只读探索 |
| PlannerAgent | 复杂任务规划 |
| TaskExecutor | 计划并行执行 |
| QAAgent | 知识问答 |
| SummaryAgent | 报告汇总 |

## 延伸阅读

- 仓库 [CLAUDE.md](https://github.com/iammm0/secbot/blob/release/CLAUDE.md)
- [[Tools|工具与 sensitive 标记]]
