/**
 * 消息块类型判别器 — 多种策略，可组合使用
 */
import type { ContentBlock } from '../types.js';
import type { BlockDiscriminator, BlockRenderType } from './types.js';

/** 已知类型直接透传，最快路径 */
export const byTypeDiscriminator: BlockDiscriminator = (block) => {
  const known: BlockRenderType[] = [
    'api', 'phase', 'error', 'planning', 'thought', 'actions',
    'content', 'report', 'response', 'user_message', 'warning', 'summary', 'code',
    'json', 'table', 'bullet', 'numbered', 'quote', 'heading', 'divider',
    'link', 'key_value', 'diff', 'terminal', 'exploring', 'spacer', 'security', 'tool_result',
    'exception', 'suggestion', 'success', 'info',
  ];
  if (known.includes(block.type)) return block.type;
  return null;
};

/** 按内容特征判别：代码块、错误、警告、JSON、Diff 等 */
export const byContentDiscriminator: BlockDiscriminator = (block) => {
  const body = (block.body ?? '').trim();
  if (!body) return null;

  if (/^```[\s\S]*?```/m.test(body) || /^```\w*\n/.test(body)) return 'code';
  if (/^\*\*错误\*\*|^错误[:：]|^Error:|^error:/im.test(body)) return 'error';
  if (/^⚠|^警告|^Warning:/im.test(body)) return 'warning';
  if (/^##?\s+摘要|^摘要[:：]|^Summary:/im.test(body)) return 'summary';
  if (/^\*\(共 \d+ 行/.test(body)) return block.type; // 折叠占位，保持原 type

  if (/^\s*[{\[][\s\S]*[}\]]\s*$/m.test(body) && /"[^"]+"\s*:/.test(body)) return 'json';
  if (/^[+-].*[+-]|^@@ |^diff /im.test(body)) return 'diff';
  if (/^>\s/m.test(body)) return 'quote';
  if (/^#{1,6}\s+.+$/.test(body) && body.split('\n').length <= 1) return 'heading';
  if (/^[-*]\s/m.test(body)) return 'bullet';
  if (/^\d+\.\s/m.test(body)) return 'numbered';
  if (/^[-=]{3,}$|^─+$/.test(body)) return 'divider';
  if (/^https?:\/\/\S+$/m.test(body) && body.split('\n').length <= 2) return 'link';
  const lines = body.split('\n').filter((l) => l.trim());
  if (lines.length >= 1 && lines.every((l) => /^\s*\w+[\s]*:/.test(l))) return 'key_value';
  if (/\|\s*.+\s*\|/.test(body) && body.includes('---')) return 'table';
  if (/Traceback|Exception|at \S+\.\w+\(|File ".*", line \d+/im.test(body)) return 'exception';
  if (/💡|提示|建议|建议[:：]|Suggestion:/im.test(body)) return 'suggestion';
  if (/✓|成功|Success:|完成/im.test(body) && body.length < 200) return 'success';
  if (/漏洞|CVE|扫描|安全|vulnerability|exploit/im.test(body)) return 'security';
  if (/^\$ |^# |^> /m.test(body) || /command not found|Permission denied/im.test(body)) return 'terminal';

  return null;
};

/** 按结构判别：有 todos → planning，有 actions → actions */
export const byStructureDiscriminator: BlockDiscriminator = (block) => {
  if (block.todos && block.todos.length > 0) return 'planning';
  if (block.actions && block.actions.length > 0) return 'actions';
  return null;
};

/** 默认回退：content 或 result 类通用渲染 */
export const fallbackDiscriminator: BlockDiscriminator = (block) => {
  const placeholder = /^\*\(共 \d+ 行/.test((block.body ?? '').trim());
  return placeholder ? 'content' : (block.type || 'content');
};
