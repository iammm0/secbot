/** GET /api/system/config/providers 单项（snake_case 与后端一致） */
export interface ProviderApiKeyStatus {
  id: string;
  name: string;
  needs_api_key: boolean;
  configured: boolean;
  needs_base_url?: boolean;
  has_base_url?: boolean;
}
