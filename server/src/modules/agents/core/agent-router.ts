import { RouteType, ChatMessage } from '../../../common/types';
import { LLMProvider, createLLM } from '../../../common/llm';

const GREETING_KEYWORDS = [
  '你好', '嗨', '早上好', '下午好', '晚上好', '您好',
  'hello', 'hi', 'hey', 'good morning', 'good afternoon',
];

const ACTION_KEYWORDS = [
  '扫描', '渗透', '攻击', '检测', '测试', '探测', '枚举',
  '利用', '破解', '注入', '爆破', '提权', '嗅探',
  'scan', 'exploit', 'attack', 'detect', 'pentest', 'enumerate',
  'brute', 'inject', 'sniff', 'crack',
];

export function route(userInput: string): RouteType {
  const input = userInput.toLowerCase().trim();

  for (const keyword of GREETING_KEYWORDS) {
    if (input.includes(keyword)) {
      return 'qa';
    }
  }

  for (const keyword of ACTION_KEYWORDS) {
    if (input.includes(keyword)) {
      return 'technical';
    }
  }

  return 'other';
}

export async function routeWithLLM(
  userInput: string,
): Promise<[RouteType, string | null]> {
  const llm: LLMProvider = createLLM({
    provider: process.env.LLM_PROVIDER ?? 'ollama',
    model: process.env.LLM_MODEL,
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
  });

  const systemPrompt =
    '你是一个意图分类器。根据用户输入判断其意图类别，并严格按照以下 JSON 格式回复（不要包含其他内容）：\n\n' +
    '{"type": "分类结果", "response": "可选的直接回复"}\n\n' +
    '分类规则：\n' +
    '- "qa"：问候、闲聊、一般性问题、安全知识咨询\n' +
    '- "technical"：需要执行安全工具的技术任务（扫描、渗透、漏洞检测等）\n' +
    '- "other"：无法归类的请求\n\n' +
    '如果是 "qa" 类型，response 字段可以包含一个简短的直接回复；' +
    '如果是 "technical" 类型，response 设为 null。';

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput },
  ];

  const raw = await llm.chat(messages);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        type: string;
        response: string | null;
      };
      const validTypes: RouteType[] = ['qa', 'technical', 'other'];
      const routeType = validTypes.includes(parsed.type as RouteType)
        ? (parsed.type as RouteType)
        : 'other';
      return [routeType, parsed.response ?? null];
    }
  } catch {
    /* JSON 解析失败，回退到关键词匹配 */
  }

  return [route(userInput), null];
}
