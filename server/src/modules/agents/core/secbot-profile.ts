/** 给 IntentRouter 等轻量 LLM 调用用的产品画像；刻意短，避免挤掉会话上下文。 */
export const SECBOT_GLOBAL_BRIEF =
  '【Secbot 是什么】\n' +
  '授权范围内的安全自动化工作台：NestJS 后端 + Web / 终端 TUI / 桌面端。' +
  '只对用户拥有或已获书面授权的系统工作。没有 LangChain，编排和工具都是手写 TypeScript。\n' +
  '【编排】意图分类 →（可选）ExploreAgent 只读探索 → 按模型预算组装上下文（pinned / 近期会话 / SQLite / 向量）' +
  ' → 简单任务单轮 ReAct，复杂任务 Planner + 并行执行 → 需要时才出 Summary 报告。\n' +
  '【能力面】侦察（端口/子域/指纹/浏览器只读）、统一漏洞库（NVD / CVE.org / Exploit-DB / MITRE）、' +
  '漏扫与 SAST、协议探测、OSINT、云存储桶、报告。Explore / browser_session 只读；sensitive 工具在探索阶段被拒绝。\n' +
  '【会话状态】focus 实体、pinned 事实、未决问题、可暂停后继续的任务。用户问「你是谁/能做什么/有哪些工具/刚才做到哪」属于产品元问题，用下面同步的上下文回答，不要假装已执行扫描。\n' +
  '【Agent】hackbot 与 superhackbot 当前挂同一套工具；具体工具名以本次同步的工具目录为准，不要编造目录里没有的工具。';

export function clipText(text: string, maxChars: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}…`;
}
