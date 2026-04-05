/**
 * 流式 UI 与工具分类常量（contentBlocks / useChat 共用）
 */

/** 主流程块之间的逻辑空白行数（虚拟滚动行号与占位一致） */
export const INTER_BLOCK_GAP_LINES = 1;

/** 完成后收起、不强调展示的工具（也不生成观察块） */
export const TRANSIENT_TOOLS = new Set<string>([
  "system_info",
  "network_analyze",
  "report_generator",
]);

/** 联网检索 / MCP / Web Research 能力 → 「探索」样式 */
export const EXPLORING_TOOLS = new Set<string>([
  "web_research",
  "web_crawler",
]);

/** 系统命令 / 持久终端会话 → 「终端」样式 */
export const TERMINAL_TOOLS = new Set<string>([
  "execute_command",
  "terminal_session",
]);
