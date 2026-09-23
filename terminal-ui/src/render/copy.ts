/** TUI chrome copy — keep in sync with web/src/lib/copy.ts where the strings overlap. */

export const MESSAGE_PLACEHOLDER = "给 SecBot 发消息，输入 / 唤起命令";
export const THINKING_PLACEHOLDER = "思考中…";
export const PAUSED_PLACEHOLDER = "补充说明并继续原任务";
export const PAUSE_HINT = "Esc 暂停当前任务";
export const LOCAL_WORKSPACE = "本地工作区";
export const HOME_HINT = "直接输入问题或任务，智能体会自动判断问答、追问或执行";
export const HOME_CHROME = "智能体 · / 命令";
export const PHASE_IDLE = "空闲";
export const PHASE_PAUSED = "已暂停";
export const PHASE_RUNNING = "执行中";
export const SCROLL = "滚动";
export const TASKS = "任务";
export const TASKS_ON = "开";
export const TASKS_OFF = "关";
export const TASKS_NARROW = "窄屏";
export const COMMANDS = "命令";
export const EXPAND_HINT = "展开";
export const PLAN = "规划";
export const TOOLS = "工具";
export const CONTEXT = "上下文";
export const NO_TASKS = "暂无任务";
export const NO_TOOLS = "暂无工具";
export const NO_SKILLS = "未找到 Skill。";
export const ANSWER_TITLE = "回答";
export const REPORT_TITLE = "安全报告";
export const EMPTY_OUTPUT = "暂无输出，输入消息或斜杠命令开始";
export const MORE_ITEMS = (n: number) => `… 另有 ${n} 项`;

const PHASE_ALIASES: Record<string, string> = {
  idle: PHASE_IDLE,
  paused: PHASE_PAUSED,
  running: PHASE_RUNNING,
  planning: "规划中",
  thinking: "思考中",
  exploring: "探索中",
};

export function localizePhase(raw: string): string {
  const key = raw.trim().toLowerCase();
  return PHASE_ALIASES[key] ?? raw;
}
