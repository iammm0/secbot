import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SystemService } from './system.service';
import {
  ProviderSettingsRequestDto,
  SetApiKeyRequestDto,
  SetLlmProviderRequestDto,
} from './dto/system.dto';

@Controller('api/system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('info')
  info() {
    return this.systemService.info();
  }

  @Get('config')
  async config() {
    const cfg = await this.systemService.config();
    return {
      llm_provider: cfg.llmProvider,
      ollama_model: cfg.ollamaModel,
      ollama_base_url: cfg.ollamaBaseUrl,
      deepseek_model: cfg.deepseekModel,
      deepseek_base_url: cfg.deepseekBaseUrl,
      current_provider_model: cfg.currentProviderModel ?? null,
      current_provider_base_url: cfg.currentProviderBaseUrl ?? null,
    };
  }

  @Get('ollama-models')
  listOllamaModels(
    // 为保持接口兼容，允许 base_url 作为 query，但当前占位实现忽略
    @Query('base_url')
    _baseUrl?: string,
  ) {
    return this.systemService.listOllamaModels().then((r) => ({
      models: r.models,
      base_url: r.baseUrl,
      error: r.error,
      pulling_model: r.pullingModel,
    }));
  }

  @Get('config/providers')
  listProviders() {
    return this.systemService.listProviders().then((res) => ({
      providers: res.providers.map((p) => ({
        id: p.id,
        name: p.name,
        needs_api_key: p.needsApiKey,
        configured: p.configured,
        needs_base_url: p.needsBaseUrl,
        has_base_url: p.hasBaseUrl,
      })),
    }));
  }

  @Get('config/provider/:providerId')
  getProviderConfig(@Param('providerId') providerId: string) {
    return this.systemService.getProviderDetail(providerId);
  }

  @Post('config/provider')
  setLlmProvider(@Body() body: SetLlmProviderRequestDto) {
    return this.systemService.setLlmProvider(body);
  }

  @Post('config/provider-settings')
  setProviderSettings(@Body() body: ProviderSettingsRequestDto) {
    return this.systemService.setProviderSettings(body);
  }

  @Post('config/api-key')
  setApiKey(@Body() body: SetApiKeyRequestDto) {
    return this.systemService.setApiKey(body);
  }

  @Get('status')
  status() {
    return this.systemService.status();
  }
}
