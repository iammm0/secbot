/** 厂商分组类别 */
export type ProviderGroup = 'overseas' | 'china' | 'relay' | 'local';

/** GET /api/system/config/providers 单项（snake_case 与后端一致） */
export interface ProviderApiKeyStatus {
  id: string;
  name: string;
  needs_api_key: boolean;
  configured: boolean;
  needs_base_url?: boolean;
  has_base_url?: boolean;
  /** 分组: overseas=海外原生, china=国内原生, relay=中转/兼容, local=本地推理 */
  group?: ProviderGroup;
  /** 中转类标注兼容协议，如 'OpenAI 兼容' */
  compat_hint?: string;
}
