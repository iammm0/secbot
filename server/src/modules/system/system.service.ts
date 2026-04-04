import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OllamaModelsResponseDto,
  ProviderListResponseDto,
  SetApiKeyRequestDto,
  SetApiKeyResponseDto,
  SystemConfigResponseDto,
  SystemInfoResponseDto,
  SystemStatusResponseDto,
} from './dto/system.dto';
import { DatabaseService } from '../database/database.service';
import { LLM_PROVIDER_REGISTRY } from './llm-provider-registry';

@Injectable()
export class SystemService {
  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  async info(): Promise<SystemInfoResponseDto> {
    // 占位：简单依赖 Node.js/os 信息，领域迁移时再增强
    const os = await import('os');
    const hostname = os.hostname();
    const userInfo = os.userInfo();
    return {
      osType: os.type(),
      osName: os.platform(),
      osVersion: os.version?.() ?? '',
      osRelease: os.release(),
      architecture: os.arch(),
      processor: os.cpus()?.[0]?.model ?? '',
      nodeVersion: process.version,
      hostname,
      username: userInfo.username,
    };
  }

  async config(): Promise<SystemConfigResponseDto> {
    const getConfigValue = (
      key: string,
      envKey: string,
      defaultValue: string | null,
    ): string | null => {
      const dbItem = this.db.getConfig(key);
      if (dbItem && dbItem.value.trim() !== '') {
        return dbItem.value;
      }
      const envVal = this.configService.get<string>(envKey) ?? process.env[envKey] ?? '';
      if (envVal.trim() !== '') {
        return envVal;
      }
      return defaultValue;
    };

    const llmProvider = getConfigValue('llm_provider', 'LLM_PROVIDER', null) ?? 'ollama';
    const ollamaModel = getConfigValue('ollama_model', 'OLLAMA_MODEL', null) ?? 'llama3.2';
    const ollamaBaseUrl =
      getConfigValue('ollama_base_url', 'OLLAMA_BASE_URL', null) ?? 'http://localhost:11434';
    const deepseekModel = getConfigValue('deepseek_model', 'DEEPSEEK_MODEL', null);
    const deepseekBaseUrl = getConfigValue('deepseek_base_url', 'DEEPSEEK_BASE_URL', null);

    return {
      llmProvider,
      ollamaModel,
      ollamaBaseUrl,
      deepseekModel,
      deepseekBaseUrl,
    };
  }

  async listOllamaModels(): Promise<OllamaModelsResponseDto> {
    // 占位：仅回显配置，不真正访问 Ollama
    const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    return {
      models: [],
      baseUrl,
      error: 'TS 占位实现尚未连接 Ollama，领域逻辑迁移时会接入真实查询。',
      pullingModel: null,
    };
  }

  async listProviders(): Promise<ProviderListResponseDto> {
    const hasDbKey = (providerId: string): boolean => !!this.db.getConfig(`${providerId}_api_key`);
    const hasDbBaseUrl = (providerId: string): boolean =>
      !!this.db.getConfig(`${providerId}_base_url`);

    const hasEnvKey = (envKey: string): boolean =>
      !!(this.configService.get<string>(envKey) ?? process.env[envKey] ?? '').trim();
    const hasEnvBase = (envKey: string): boolean =>
      !!(this.configService.get<string>(envKey) ?? process.env[envKey] ?? '').trim();

    const providers = LLM_PROVIDER_REGISTRY.map((meta) => {
      const configured = meta.needsApiKey
        ? hasDbKey(meta.id) || !!(meta.apiKeyEnv && hasEnvKey(meta.apiKeyEnv))
        : true;
      const hasBaseUrl = hasDbBaseUrl(meta.id) || hasEnvBase(meta.baseUrlEnv);
      return {
        id: meta.id,
        name: meta.name,
        needsApiKey: meta.needsApiKey,
        configured,
        needsBaseUrl: meta.needsBaseUrl,
        hasBaseUrl,
      };
    });

    return { providers };
  }

  async setApiKey(body: SetApiKeyRequestDto): Promise<SetApiKeyResponseDto> {
    const provider = body.provider.trim().toLowerCase();
    if (!provider) {
      return {
        success: false,
        message: 'provider 不能为空',
      };
    }
    const hasBaseUrlField = body.baseUrl !== undefined;
    const keyName = `${provider}_api_key`;
    const baseName = `${provider}_base_url`;

    let msg = '';

    if (!hasBaseUrlField) {
      const key = body.apiKey.trim();
      if (!key) {
        const deleted = this.db.deleteConfig(keyName);
        msg = deleted ? `已删除 ${provider} 的 API Key` : `${provider} 的 API Key 已为空`;
      } else {
        this.db.saveConfig(keyName, key, 'api_keys', `${provider} API Key`);
        msg = `已保存 ${provider} API Key`;
      }
    } else {
      const base = (body.baseUrl ?? '').trim();
      if (base) {
        this.db.saveConfig(baseName, base, 'api_keys', `${provider} Base URL`);
        msg = `已更新 ${provider} Base URL`;
      } else {
        this.db.deleteConfig(baseName);
        msg = `已清除 ${provider} Base URL`;
      }
    }

    return {
      success: true,
      message: msg,
    };
  }

  async status(): Promise<SystemStatusResponseDto> {
    const os = await import('os');
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const cpus = os.cpus();
    const load = os.loadavg?.()[0] ?? 0;

    return {
      cpu: {
        count: cpus.length,
        percent: load,
        freqCurrent: cpus[0]?.speed ?? 0,
      },
      memory: {
        totalGb: +(total / 1024 ** 3).toFixed(2),
        usedGb: +(used / 1024 ** 3).toFixed(2),
        availableGb: +(free / 1024 ** 3).toFixed(2),
        percent: +((used / total) * 100).toFixed(2),
      },
      disks: [],
    };
  }
}
