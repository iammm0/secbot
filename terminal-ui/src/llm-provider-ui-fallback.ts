/**
 * 与 server/src/modules/system/llm-provider-registry.ts 保持 id/顺序/名称一致。
 * 当后端未重启或仍返回旧版短列表时，用于补全「切换推理后端」等界面展示。
 */
import type { ProviderApiKeyStatus, ProviderGroup } from './model-config-types.js';

type FallbackEntry = Omit<ProviderApiKeyStatus, 'configured' | 'has_base_url'>;

const FALLBACK: FallbackEntry[] = [
  // ── 本地推理 ──
  { id: 'ollama', name: 'Ollama (本地)', needs_api_key: false, needs_base_url: false, group: 'local' },
  // ── 海外原生 API ──
  { id: 'openai', name: 'OpenAI', needs_api_key: true, needs_base_url: false, group: 'overseas' },
  { id: 'anthropic', name: 'Anthropic (Claude)', needs_api_key: true, needs_base_url: false, group: 'overseas' },
  { id: 'google', name: 'Google (Gemini)', needs_api_key: true, needs_base_url: false, group: 'overseas' },
  { id: 'xai', name: 'xAI (Grok)', needs_api_key: true, needs_base_url: true, group: 'overseas' },
  { id: 'mistral', name: 'Mistral AI', needs_api_key: true, needs_base_url: false, group: 'overseas' },
  { id: 'cohere', name: 'Cohere', needs_api_key: true, needs_base_url: false, group: 'overseas' },
  // ── 国内原生 API ──
  { id: 'deepseek', name: 'DeepSeek', needs_api_key: true, needs_base_url: false, group: 'china' },
  { id: 'zhipu', name: '智谱 (GLM)', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'qwen', name: '通义千问 (Qwen)', needs_api_key: true, needs_base_url: false, group: 'china' },
  { id: 'moonshot', name: '月之暗面 (Kimi)', needs_api_key: true, needs_base_url: false, group: 'china' },
  { id: 'baichuan', name: '百川', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'yi', name: '零一万物 (Yi)', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'scnet', name: '中国超算互联网 (SCNET)', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'hunyuan', name: '腾讯混元', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'doubao', name: '字节豆包 (火山方舟)', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'spark', name: '讯飞星火', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'wenxin', name: '百度文心 (千帆)', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'stepfun', name: '阶跃星辰 (StepFun)', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'minimax', name: 'MiniMax', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'langboat', name: '澜舟 (孟子)', needs_api_key: true, needs_base_url: true, group: 'china' },
  { id: 'mianbi', name: '面壁智能', needs_api_key: true, needs_base_url: true, group: 'china' },
  // ── 中转 / 兼容 ──
  { id: 'groq', name: 'Groq', needs_api_key: true, needs_base_url: false, group: 'relay', compat_hint: 'OpenAI 兼容' },
  { id: 'openrouter', name: 'OpenRouter', needs_api_key: true, needs_base_url: false, group: 'relay', compat_hint: 'OpenAI 兼容' },
  { id: 'together', name: 'Together AI', needs_api_key: true, needs_base_url: false, group: 'relay', compat_hint: 'OpenAI 兼容' },
  { id: 'fireworks', name: 'Fireworks AI', needs_api_key: true, needs_base_url: false, group: 'relay', compat_hint: 'OpenAI 兼容' },
  { id: 'azure_openai', name: 'Azure OpenAI', needs_api_key: true, needs_base_url: true, group: 'relay', compat_hint: 'OpenAI 兼容' },
  { id: 'custom', name: 'OpenAI 兼容中转', needs_api_key: true, needs_base_url: true, group: 'relay', compat_hint: 'OpenAI 兼容' },
];

const FALLBACK_IDS = new Set(FALLBACK.map((p) => p.id));

/** 以本地清单为顺序基准合并 API 数据；API 多出的 id 会追加在末尾 */
export function mergeProviderListFromApi(api: ProviderApiKeyStatus[] | undefined): ProviderApiKeyStatus[] {
  const fromApi = api ?? [];
  const apiById = new Map(fromApi.map((p) => [p.id, p]));

  const merged: ProviderApiKeyStatus[] = FALLBACK.map((fb) => {
    const a = apiById.get(fb.id);
    if (a) {
      // 保留 fallback 中的 group / compat_hint，后端返回的优先
      return {
        ...a,
        group: a.group ?? fb.group,
        compat_hint: a.compat_hint ?? fb.compat_hint,
      };
    }
    return {
      id: fb.id,
      name: fb.name,
      needs_api_key: fb.needs_api_key,
      configured: false,
      needs_base_url: fb.needs_base_url,
      has_base_url: false,
      group: fb.group,
      compat_hint: fb.compat_hint,
    };
  });

  const extras = fromApi.filter((p) => !FALLBACK_IDS.has(p.id));
  return extras.length > 0 ? [...merged, ...extras] : merged;
}

/** 分组显示顺序与中文标题 */
const GROUP_ORDER: ProviderGroup[] = ['local', 'overseas', 'china', 'relay'];
const GROUP_LABELS: Record<ProviderGroup, string> = {
  local: '本地推理',
  overseas: '海外原生',
  china: '国内原生',
  relay: '中转 / 兼容',
};

export type GroupedRow =
  | { type: 'header'; label: string }
  | { type: 'item'; provider: ProviderApiKeyStatus; flatIndex: number };

/**
 * 将平坦列表按 group 分组，插入分组标题行，同时记录每个 item 在原数组中的 flatIndex。
 * 键盘导航只在 flatIndex 上操作，渲染时用 GroupedRow 序列。
 */
export function buildGroupedRows(list: ProviderApiKeyStatus[]): GroupedRow[] {
  const rows: GroupedRow[] = [];
  const byGroup = new Map<string, { provider: ProviderApiKeyStatus; flatIndex: number }[]>();

  list.forEach((p, i) => {
    const g = p.group ?? 'relay';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push({ provider: p, flatIndex: i });
  });

  for (const g of GROUP_ORDER) {
    const items = byGroup.get(g);
    if (!items || items.length === 0) continue;
    rows.push({ type: 'header', label: GROUP_LABELS[g] ?? g });
    for (const item of items) {
      rows.push({ type: 'item', ...item });
    }
  }

  // 未知分组的追加在末尾
  for (const [g, items] of byGroup) {
    if (GROUP_ORDER.includes(g as ProviderGroup)) continue;
    rows.push({ type: 'header', label: g });
    for (const item of items) {
      rows.push({ type: 'item', ...item });
    }
  }

  return rows;
}
