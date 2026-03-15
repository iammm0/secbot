/**
 * 模型/推理配置悬浮窗 — 输入 /model 后弹出，可选查看或按提供商配置，可配置 API Key
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../contexts/ThemeContext.js';
import { api } from '../api.js';

interface Config {
  llm_provider: string;
  ollama_model: string;
  ollama_base_url: string;
  deepseek_model?: string;
  deepseek_base_url?: string;
  current_provider_model?: string;
  current_provider_base_url?: string;
}

interface ProviderApiKeyStatus {
  id: string;
  name: string;
  needs_api_key: boolean;
  configured: boolean;
  // 后端可选字段：对于 OpenAI 兼容中转等，标记是否需要 / 已配置 Base URL
  needs_base_url?: boolean;
  has_base_url?: boolean;
}

type ProviderId = 'current' | 'ollama' | 'deepseek' | 'switch_provider' | 'configured_list' | 'api_key';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'current', label: '当前推理后端' },
  { id: 'configured_list', label: '已配置的推理后端' },
  { id: 'switch_provider', label: '切换推理后端' },
  { id: 'api_key', label: '配置 API Key' },
];

export function ModelConfigDialog() {
  const theme = useTheme();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<'list' | 'detail' | 'api_key_list' | 'api_key_input' | 'provider_switch_list' | 'confirm_switch' | 'configured_list'>('list');
  const [detailProvider, setDetailProvider] = useState<ProviderId | string | null>(null);
  const [apiKeyProviders, setApiKeyProviders] = useState<ProviderApiKeyStatus[]>([]);
  const [apiKeyListIndex, setApiKeyListIndex] = useState(0);
  const [apiKeyEditingProvider, setApiKeyEditingProvider] = useState<ProviderApiKeyStatus | null>(null);
  const [apiKeyInputValue, setApiKeyInputValue] = useState('');
  const [apiKeyMessage, setApiKeyMessage] = useState<string | null>(null);
  const [apiKeyStep, setApiKeyStep] = useState<'key' | 'base_url'>('key');
  const [allProvidersForSwitch, setAllProvidersForSwitch] = useState<ProviderApiKeyStatus[]>([]);
  const [allProvidersForList, setAllProvidersForList] = useState<ProviderApiKeyStatus[]>([]);
  const [providerSwitchListIndex, setProviderSwitchListIndex] = useState(0);
  const [confirmSwitchProvider, setConfirmSwitchProvider] = useState<{ id: string; name: string } | null>(null);
  const [switchSuccessMessage, setSwitchSuccessMessage] = useState<string | null>(null);
  const [detailEditMode, setDetailEditMode] = useState<'model' | 'base_url' | null>(null);
  const [detailEditValue, setDetailEditValue] = useState('');
  const [detailEditMessage, setDetailEditMessage] = useState<string | null>(null);
  const [configuredListIndex, setConfiguredListIndex] = useState(0);
  const [detailProviderConfig, setDetailProviderConfig] = useState<{ model: string | null; base_url: string | null } | null>(null);
  const [ollamaModels, setOllamaModels] = useState<Array<{ name: string; size?: number; parameter_size?: string }>>([]);
  const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);
  const [ollamaPullingModel, setOllamaPullingModel] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Config>('/api/system/config')
      .then(setConfig)
      .catch((e) => setError(String((e as Error).message)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view === 'api_key_list' || view === 'api_key_input') {
      api.get<{ providers: ProviderApiKeyStatus[] }>('/api/system/config/providers').then((r) => setApiKeyProviders(r.providers.filter((p) => p.needs_api_key))).catch(() => setApiKeyProviders([]));
    }
  }, [view]);

  useEffect(() => {
    if (view === 'provider_switch_list' || view === 'confirm_switch') {
      api.get<{ providers: ProviderApiKeyStatus[] }>('/api/system/config/providers').then((r) => setAllProvidersForSwitch(r.providers)).catch(() => setAllProvidersForSwitch([]));
    }
  }, [view]);

  useEffect(() => {
    if (view === 'list' || view === 'configured_list') {
      api.get<{ providers: ProviderApiKeyStatus[] }>('/api/system/config/providers').then((r) => setAllProvidersForList(r.providers)).catch(() => setAllProvidersForList([]));
    }
  }, [view]);

  useEffect(() => {
    if (view === 'detail' && typeof detailProvider === 'string' && detailProvider !== 'current' && detailProvider !== 'ollama' && detailProvider !== 'deepseek') {
      api
        .get<{ provider: string; model?: string | null; base_url?: string | null }>(`/api/system/config/provider/${detailProvider}`)
        .then((r) => setDetailProviderConfig({ model: r.model ?? null, base_url: r.base_url ?? null }))
        .catch(() => setDetailProviderConfig({ model: null, base_url: null }));
    } else {
      setDetailProviderConfig(null);
    }
  }, [view, detailProvider]);

  useEffect(() => {
    if (view === 'detail' && (detailProvider === 'ollama' || (detailProvider === 'current' && config?.llm_provider === 'ollama'))) {
      setOllamaModelsError(null);
      const formatOllamaError = (msg: string) => {
        if (/404|Not Found/i.test(msg)) {
          return '无法获取本地模型列表（请重启后端以使用最新接口，或在本机执行 ollama list 查看）';
        }
        return msg;
      };
      api
        .get<{ models: Array<{ name: string; size?: number; parameter_size?: string }>; error?: string; pulling_model?: string }>('/api/system/ollama-models')
        .then((r) => {
          if (r.error) {
            setOllamaModelsError(formatOllamaError(r.error));
            setOllamaModels([]);
            setOllamaPullingModel(null);
          } else {
            setOllamaModels(r.models ?? []);
            setOllamaModelsError(null);
            setOllamaPullingModel(r.pulling_model ?? null);
          }
        })
        .catch((e) => {
          setOllamaModelsError(formatOllamaError(String((e as Error).message)));
          setOllamaModels([]);
          setOllamaPullingModel(null);
        });
    }
  }, [view, detailProvider, config?.llm_provider]);

  useInput((input, key) => {
    if (key.escape) {
      if (view === 'api_key_input') {
        setView('api_key_list');
        setApiKeyEditingProvider(null);
        setApiKeyInputValue('');
        setApiKeyMessage(null);
        setApiKeyStep('key');
      } else if (view === 'api_key_list') {
        setView('list');
      } else if (view === 'configured_list') {
        setView('list');
      } else if (view === 'provider_switch_list') {
        setView('list');
        setSwitchSuccessMessage(null);
      } else if (view === 'confirm_switch') {
        setConfirmSwitchProvider(null);
        setView('provider_switch_list');
      } else if (view === 'detail') {
        if (detailEditMode) {
          setDetailEditMode(null);
          setDetailEditValue('');
          setDetailEditMessage(null);
        } else {
          setView('list');
          setDetailProvider(null);
        }
      }
      // 顶层 list 的 Esc 不在此 pop()，由 App 统一 clear()，避免竞态
      return;
    }
    if (view === 'confirm_switch') {
      const c = input.toLowerCase();
      if (key.return || c === 'y' || c === '是') {
        if (confirmSwitchProvider) {
          api
            .post<{ success: boolean; message: string }>('/api/system/config/provider', { llm_provider: confirmSwitchProvider.id })
            .then((r) => {
              setSwitchSuccessMessage(r.success ? r.message : r.message);
              setConfirmSwitchProvider(null);
              setView('provider_switch_list');
              if (r.success) api.get<Config>('/api/system/config').then(setConfig).catch(() => {});
            })
            .catch((e) => {
              setSwitchSuccessMessage(String((e as Error).message));
              setConfirmSwitchProvider(null);
              setView('provider_switch_list');
            });
        }
      } else if (c === 'n' || c === '否') {
        setConfirmSwitchProvider(null);
        setView('provider_switch_list');
      }
      return;
    }
    if (view === 'api_key_input') return;
    if (view === 'configured_list') {
      const list = configuredProviders;
      if (key.upArrow) setConfiguredListIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) setConfiguredListIndex((i) => Math.min(list.length - 1, i + 1));
      else if (key.return && list[configuredListIndex]) {
        setDetailProvider(list[configuredListIndex].id);
        setView('detail');
        setDetailEditMode(null);
        setDetailEditMessage(null);
      }
      return;
    }
    if (view === 'provider_switch_list') {
      const list = allProvidersForSwitch;
      if (key.upArrow) setProviderSwitchListIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) setProviderSwitchListIndex((i) => Math.min(list.length - 1, i + 1));
      else if (key.return && list[providerSwitchListIndex]) {
        const p = list[providerSwitchListIndex];
        if (p.id === config?.llm_provider) {
          setSwitchSuccessMessage('已是当前推理后端，无需切换。');
        } else {
          setConfirmSwitchProvider({ id: p.id, name: p.name });
          setView('confirm_switch');
        }
      }
      return;
    }
    if (view === 'api_key_list') {
      const list = apiKeyProviders;
      if (key.upArrow) setApiKeyListIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) setApiKeyListIndex((i) => Math.min(list.length - 1, i + 1));
      else if (key.return && list[apiKeyListIndex]) {
        setApiKeyEditingProvider(list[apiKeyListIndex]);
        setApiKeyInputValue('');
        setApiKeyMessage(null);
        setApiKeyStep('key');
        setView('api_key_input');
      }
      return;
    }
    if (view === 'list') {
      if (key.upArrow) setSelectedIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) setSelectedIndex((i) => Math.min(PROVIDERS.length - 1, i + 1));
      else if (key.return) {
        const id = PROVIDERS[selectedIndex].id;
        if (id === 'api_key') {
          setView('api_key_list');
          setApiKeyListIndex(0);
        } else if (id === 'configured_list') {
          setView('configured_list');
        } else if (id === 'switch_provider') {
          setView('provider_switch_list');
          setProviderSwitchListIndex(0);
          setSwitchSuccessMessage(null);
        } else {
          setDetailProvider(id);
          setView('detail');
        }
      }
      return;
    }
    if (view === 'detail' && !detailEditMode) {
      const pidForInput =
        detailProvider === 'current'
          ? config?.llm_provider
          : detailProvider === 'ollama' || detailProvider === 'deepseek'
            ? detailProvider
            : typeof detailProvider === 'string'
              ? detailProvider
              : null;
      const currentModel =
        detailProvider === 'ollama'
          ? config?.ollama_model
          : detailProvider === 'deepseek'
            ? config?.deepseek_model
            : detailProvider === 'current'
              ? config?.current_provider_model
              : detailProviderConfig?.model ?? undefined;
      const currentBaseUrl =
        detailProvider === 'ollama'
          ? config?.ollama_base_url
          : detailProvider === 'deepseek'
            ? config?.deepseek_base_url
            : detailProvider === 'current'
              ? config?.current_provider_base_url
              : detailProviderConfig?.base_url ?? undefined;
      const c = input.toLowerCase();
      if (pidForInput && (c === 'm' || c === 'b')) {
        if (c === 'm') {
          setDetailEditMode('model');
          setDetailEditValue(currentModel ?? '');
          setDetailEditMessage(null);
        } else {
          setDetailEditMode('base_url');
          setDetailEditValue(currentBaseUrl ?? '');
          setDetailEditMessage(null);
        }
      }
      return;
    }
    if (view === 'detail' && detailEditMode) return;
  });

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0}>
        <Text color={theme.primary}>模型配置</Text>
        <Text color={theme.textMuted}>加载中…</Text>
      </Box>
    );
  }
  if (error) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0}>
        <Text color={theme.primary}>模型配置</Text>
        <Text color={theme.error}>{error}</Text>
        <Text color={theme.textMuted}>Esc 关闭</Text>
      </Box>
    );
  }
  if (!config) return null;

  if (view === 'api_key_input' && apiKeyEditingProvider) {
    const needsBaseUrl = Boolean(apiKeyEditingProvider.needs_base_url);
    const isBaseUrlStep = apiKeyStep === 'base_url';

    const handleSubmit = (value: string) => {
      const trimmed = value.trim();
      if (!isBaseUrlStep) {
        // 第一步：保存 API Key
        api
          .post<{ success: boolean; message: string }>('/api/system/config/api-key', {
            provider: apiKeyEditingProvider.id,
            api_key: trimmed,
          })
          .then((r) => {
            setApiKeyMessage(r.message);
            if (r.success) {
              setApiKeyInputValue('');
              if (needsBaseUrl) {
                // 该厂商需配置 Base URL（custom / 澜舟 / 面壁 / xAI / Azure OpenAI 等）：第二步输入 Base URL
                setApiKeyStep('base_url');
                setApiKeyMessage('API Key 已保存，请继续输入 Base URL（如 https://xxx.openai.azure.com/openai/v1）。');
              } else {
                setApiKeyEditingProvider(null);
                setView('api_key_list');
              }
            }
          })
          .catch((e) => setApiKeyMessage(String((e as Error).message)));
      } else {
        // 第二步：保存 Base URL（needs_base_url 的厂商）
        api
          .post<{ success: boolean; message: string }>('/api/system/config/api-key', {
            provider: apiKeyEditingProvider.id,
            api_key: '',
            base_url: trimmed,
          })
          .then((r) => {
            setApiKeyMessage(r.message);
            if (r.success) {
              setApiKeyInputValue('');
              setApiKeyEditingProvider(null);
              setView('api_key_list');
              setApiKeyStep('key');
            }
          })
          .catch((e) => setApiKeyMessage(String((e as Error).message)));
      }
    };
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={64}>
        <Text bold color={theme.primary}>
          {apiKeyEditingProvider.name}{' '}
          {isBaseUrlStep ? '— 输入 Base URL（必填，留空则清除已保存的 Base URL）' : '— 输入 API Key（留空删除）'}
        </Text>
        {!isBaseUrlStep && needsBaseUrl && (
          <Text color={theme.textMuted} marginTop={0}>
            该厂商需配置 Base URL，保存 Key 后下一步会要求输入 Base URL（如 https://xxx.openai.azure.com/openai/v1）。
          </Text>
        )}
        <Box flexDirection="row" marginTop={1}>
          <Text color={theme.text}>{isBaseUrlStep ? 'Base URL: ' : 'API Key: '}</Text>
          <TextInput
            value={apiKeyInputValue}
            onChange={setApiKeyInputValue}
            onSubmit={handleSubmit}
            placeholder={
              isBaseUrlStep
                ? '例如 https://xxx.openai.azure.com/openai/v1 或厂商文档中的 API 地址'
                : '粘贴 API Key 或留空删除'
            }
            showCursor
          />
        </Box>
        {apiKeyMessage && <Text color={theme.textMuted} marginTop={1}>{apiKeyMessage}</Text>}
        <Text color={theme.textMuted} marginTop={1}>Esc 返回</Text>
      </Box>
    );
  }

  if (view === 'api_key_list') {
    const list = apiKeyProviders;
    const safeIdx = Math.min(apiKeyListIndex, Math.max(0, list.length - 1));
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={64}>
        <Text bold color={theme.primary}>配置 API Key — 选择厂商</Text>
        <Text color={theme.textMuted}>↑↓ 选择 · Enter 配置 · Esc 返回</Text>
        <Text color={theme.textMuted} marginTop={0}>
          提示：部分厂商（如 Azure OpenAI、xAI、澜舟、面壁、自定义中转）需先填 API Key，保存后会再提示输入 Base URL。
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {list.length === 0 ? (
            <Text color={theme.textMuted}>加载中…</Text>
          ) : (
            list.map((p, i) => (
              <Box key={p.id}>
                <Text color={i === safeIdx ? theme.primary : theme.text}>
                  {i === safeIdx ? '> ' : '  '}
                  {p.name} {p.configured ? '已配置' : '未配置'}
                </Text>
              </Box>
            ))
          )}
        </Box>
      </Box>
    );
  }

  const configuredProviders = allProvidersForList.filter((p) => p.configured);
  const getProviderModelLabel = (providerId: string): string => {
    if (!config) return '';
    if (providerId === 'ollama') return config.ollama_model ?? '';
    if (providerId === 'deepseek') return config.deepseek_model ?? '';
    if (config.llm_provider === providerId) return config.current_provider_model ?? '';
    return '';
  };

  if (view === 'configured_list') {
    const list = configuredProviders;
    const safeIdx = Math.min(configuredListIndex, Math.max(0, list.length - 1));
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={64}>
        <Text bold color={theme.primary}>
          已配置的推理后端 — 选择一项可查看并编辑模型与地址
        </Text>
        <Text color={theme.textMuted}>↑↓ 选择 · Enter 进入并编辑 · Esc 返回</Text>
        <Box flexDirection="column" marginTop={1}>
          {list.length === 0 ? (
            <Text color={theme.textMuted}>加载中…或暂无已配置的后端</Text>
          ) : (
            list.map((p, i) => {
              const modelLabel = getProviderModelLabel(p.id);
              return (
                <Box key={p.id}>
                  <Text color={i === safeIdx ? theme.primary : theme.text}>
                    {i === safeIdx ? '> ' : '  '}
                    {p.name}
                    {modelLabel ? `: ${modelLabel}` : ''}
                    {p.id === config?.llm_provider ? '  ✓ 当前' : ''}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>
      </Box>
    );
  }

  if (view === 'confirm_switch' && confirmSwitchProvider) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={64}>
        <Text bold color={theme.primary}>
          是否将默认推理后端切换为「{confirmSwitchProvider.name}」？
        </Text>
        <Text color={theme.textMuted} marginTop={1}>
          Enter / Y 确认 · N / Esc 取消
        </Text>
      </Box>
    );
  }

  if (view === 'provider_switch_list') {
    const list = allProvidersForSwitch;
    const safeIdx = Math.min(providerSwitchListIndex, Math.max(0, list.length - 1));
    const currentId = config?.llm_provider ?? '';
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={64}>
        <Text bold color={theme.primary}>切换推理后端</Text>
        <Text color={theme.textMuted}>↑↓ 选择 · Enter 确认切换 · Esc 返回</Text>
        {switchSuccessMessage && (
          <Text color={theme.primary} marginTop={0}>{switchSuccessMessage}</Text>
        )}
        <Box flexDirection="column" marginTop={1}>
          {list.length === 0 ? (
            <Text color={theme.textMuted}>加载中…</Text>
          ) : (
            list.map((p, i) => (
              <Box key={p.id}>
                <Text color={i === safeIdx ? theme.primary : theme.text}>
                  {i === safeIdx ? '> ' : '  '}
                  {p.name}
                  {p.id === currentId ? '  ✓ 当前' : ''}
                </Text>
              </Box>
            ))
          )}
        </Box>
      </Box>
    );
  }

  if (view === 'detail' && detailProvider && detailProvider !== 'api_key') {
    const pid: string | null =
      detailProvider === 'current'
        ? config?.llm_provider ?? null
        : detailProvider === 'ollama' || detailProvider === 'deepseek'
          ? detailProvider
          : typeof detailProvider === 'string'
            ? detailProvider
            : null;
    const isEditing = Boolean(detailEditMode);
    const currentModelFromConfig =
      detailProvider === 'ollama'
        ? config?.ollama_model
        : detailProvider === 'deepseek'
          ? config?.deepseek_model
          : detailProvider === 'current'
            ? config?.current_provider_model
            : detailProviderConfig?.model ?? undefined;
    const currentBaseUrlFromConfig =
      detailProvider === 'ollama'
        ? config?.ollama_base_url
        : detailProvider === 'deepseek'
          ? config?.deepseek_base_url
          : detailProvider === 'current'
            ? config?.current_provider_base_url
            : detailProviderConfig?.base_url ?? undefined;

    if (isEditing && pid) {
      const isModel = detailEditMode === 'model';
      const handleSubmit = (value: string) => {
        const trimmed = value.trim();
        const body: { provider: string; model?: string; base_url?: string } = { provider: pid };
        if (isModel) body.model = trimmed;
        else body.base_url = trimmed;
        api
          .post<{ success: boolean; message: string }>('/api/system/config/provider-settings', body)
          .then((r) => {
            setDetailEditMessage(r.message);
            if (r.success) {
              setDetailEditMode(null);
              setDetailEditValue('');
              api.get<Config>('/api/system/config').then(setConfig).catch(() => {});
              api
                .get<{ model?: string | null; base_url?: string | null }>(`/api/system/config/provider/${pid}`)
                .then((res) => setDetailProviderConfig({ model: res.model ?? null, base_url: res.base_url ?? null }))
                .catch(() => {});
            }
          })
          .catch((e) => setDetailEditMessage(String((e as Error).message)));
      };
      return (
        <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={64}>
          <Text bold color={theme.primary}>
            {isModel ? '修改默认模型' : '修改 API 地址'}
          </Text>
          <Box flexDirection="row" marginTop={1}>
            <Text color={theme.text}>{isModel ? '模型: ' : 'Base URL: '}</Text>
            <TextInput
              value={detailEditValue}
              onChange={setDetailEditValue}
              onSubmit={handleSubmit}
              placeholder={isModel ? '例如 deepseek-chat' : '例如 https://api.deepseek.com'}
              showCursor
            />
          </Box>
          {detailEditMessage && <Text color={theme.textMuted} marginTop={1}>{detailEditMessage}</Text>}
          <Text color={theme.textMuted} marginTop={1}>Enter 保存 · Esc 取消</Text>
        </Box>
      );
    }

    const lines: string[] = [];
    if (detailProvider === 'current') {
      lines.push(`当前推理后端: ${config.llm_provider}`);
      if (config.llm_provider === 'ollama') {
        lines.push(`  模型: ${config.ollama_model}`);
        lines.push(`  地址: ${config.ollama_base_url}`);
        if (ollamaModelsError) {
          lines.push('');
          lines.push(`  本地模型列表: ${ollamaModelsError}`);
        } else if (ollamaModels.length > 0) {
          lines.push('');
          lines.push('  本地可用模型（ollama list）:');
          ollamaModels.forEach((m) => {
            const sizeStr = m.size != null ? ` ${(m.size / 1e9).toFixed(2)} GB` : '';
            const paramStr = m.parameter_size ? ` ${m.parameter_size}` : '';
            lines.push(`    - ${m.name}${paramStr}${sizeStr}`);
          });
        } else if (ollamaPullingModel) {
          lines.push('');
          lines.push(`  正在拉取默认模型 ${ollamaPullingModel}…（可稍后刷新查看）`);
        } else {
          lines.push('');
          lines.push('  本地可用模型: 加载中…');
        }
      } else if (config.llm_provider === 'deepseek') {
        lines.push(`  模型: ${config.deepseek_model ?? '-'}`);
        lines.push(`  地址: ${config.deepseek_base_url ?? '-'}`);
      } else {
        lines.push(`  模型: ${config.current_provider_model ?? '-'}`);
        lines.push(`  地址: ${config.current_provider_base_url ?? '-'}`);
      }
    } else if (detailProvider === 'ollama') {
      lines.push('Ollama 配置');
      lines.push(`  默认模型 (OLLAMA_MODEL): ${config.ollama_model}`);
      lines.push(`  服务地址 (OLLAMA_BASE_URL): ${config.ollama_base_url}`);
      if (ollamaModelsError) {
        lines.push('');
        lines.push(`  本地模型列表: ${ollamaModelsError}`);
      } else if (ollamaModels.length > 0) {
        lines.push('');
        lines.push('  本地可用模型（ollama list）:');
        ollamaModels.forEach((m) => {
          const sizeStr = m.size != null ? ` ${(m.size / 1e9).toFixed(2)} GB` : '';
          const paramStr = m.parameter_size ? ` ${m.parameter_size}` : '';
          lines.push(`    - ${m.name}${paramStr}${sizeStr}`);
        });
      } else if (ollamaPullingModel) {
        lines.push('');
        lines.push(`  正在拉取默认模型 ${ollamaPullingModel}…（可稍后刷新查看）`);
      } else {
        lines.push('');
        lines.push('  本地可用模型: 加载中…');
      }
    } else if (detailProvider === 'deepseek') {
      lines.push('DeepSeek 配置');
      lines.push(`  默认模型 (DEEPSEEK_MODEL): ${config.deepseek_model ?? '-'}`);
      lines.push(`  API 地址 (DEEPSEEK_BASE_URL): ${config.deepseek_base_url ?? '-'}`);
      lines.push('  API Key: 在弹窗首页选「配置 API Key」可设置或删除');
    } else if (typeof detailProvider === 'string') {
      const name = allProvidersForList.find((pr) => pr.id === detailProvider)?.name ?? detailProvider;
      const model = detailProviderConfig?.model ?? config?.llm_provider === detailProvider ? config?.current_provider_model : null;
      const baseUrl = detailProviderConfig?.base_url ?? config?.llm_provider === detailProvider ? config?.current_provider_base_url : null;
      lines.push(`${name} 配置`);
      lines.push(`  默认模型: ${model ?? '-'}`);
      lines.push(`  API 地址: ${baseUrl ?? '-'}`);
      lines.push('  API Key: 在弹窗首页选「配置 API Key」可设置或删除');
    }
    const label =
      typeof detailProvider === 'string'
        ? (allProvidersForList.find((p) => p.id === detailProvider)?.name ?? detailProvider)
        : (PROVIDERS.find((p) => p.id === detailProvider)?.label ?? '');

    return (
      <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={64}>
        <Text bold color={theme.primary}>
          {label}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {lines.map((line, i) => (
            <Text key={i} color={theme.text}>
              {line}
            </Text>
          ))}
        </Box>
        {pid && (
          <Text color={theme.textMuted} marginTop={1}>
            M 修改默认模型 · B 修改 API 地址 · Esc 返回
          </Text>
        )}
        {!pid && (
          <Text color={theme.textMuted} marginTop={1}>
            Esc 返回
          </Text>
        )}
      </Box>
    );
  }

  const currentLabel =
    config.llm_provider === 'ollama'
      ? `Ollama (${config.ollama_model})`
      : config.llm_provider === 'deepseek'
        ? `DeepSeek (${config.deepseek_model ?? '-'})`
        : config.llm_provider;
  const configuredCount = allProvidersForList.filter((p) => p.configured).length;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={64}>
      <Text bold color={theme.primary}>
        模型 / 推理配置 — 选择提供商查看或配置
      </Text>
      <Text color={theme.textMuted}>↑↓ 选择 · Enter 进入 · Esc 关闭</Text>
      <Box flexDirection="column" marginTop={1}>
        {PROVIDERS.map((p, i) => {
          const isSelected = i === selectedIndex;
          const value =
            p.id === 'api_key' || p.id === 'switch_provider'
              ? null
              : p.id === 'current'
                ? currentLabel
                : p.id === 'configured_list'
                  ? (configuredCount > 0 ? `${configuredCount} 个` : null)
                  : null;
          return (
            <Box key={p.id}>
              <Text color={isSelected ? theme.primary : theme.text}>
                {isSelected ? '> ' : '  '}
                {p.label}
                {value != null ? (p.id === 'current' ? ` (${value})` : ` (${value})`) : ''}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
