/**
 * 简单判断用户输入是否为「问候」或「非任务型」— 此类不触发执行，用 ask 模式回复即可
 */

const GREETING_PATTERNS = [
  /^你好?[！!]?$/i,
  /^hi+[!.]?$/i,
  /^hey[!.]?$/i,
  /^hello[!.]?$/i,
  /^嗨[！!]?$/i,
  /^在(吗|不)?[？?]?$/i,
  /^早上好[！!]?$/i,
  /^下午好[！!]?$/i,
  /^晚上好[！!]?$/i,
  /^good\s*(morning|afternoon|evening)[!.]?$/i,
  /^谢谢[你您]?[！!]?$/i,
  /^thanks?[!.]?$/i,
  /^再见[！!]?$/i,
  /^bye[!.]?$/i,
  /^拜拜[！!]?$/i,
];

/** 极短且无明确指令的视为非任务（如「在」「嗯」「？」） */
const SHORT_NON_TASK = /^[\s\u4e00-\u9fa5a-zA-Z]{1,3}[？?！!。.]?$/;

/**
 * 若为简单问候或明显非任务型输入，返回 true，应用 ask 模式，不触发 agent 执行
 */
export function isSimpleGreetingOrNonTask(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  if (GREETING_PATTERNS.some((p) => p.test(trimmed))) return true;

  if (trimmed.length <= 4 && SHORT_NON_TASK.test(trimmed)) return true;

  return false;
}
