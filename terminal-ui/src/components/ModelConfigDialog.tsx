/**
 * 模型/推理配置悬浮窗 — 输入 /model 后弹出，可选查看或按提供商配置，可配置 API Key
 */
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useDialog } from '../contexts/DialogContext.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { api } from '../api.js';

interface Config {
  llm_provider: string;
  ollama_model: string;
  ollama_base_url: string;
  deepseek_model?: string;
  deepseek_base_url?: string;
}

interface ProviderApiKeyStatus {
  id: string;
  name: string;
  needs_api_key: boolean;
  configured: boolean;
}

type ProviderId = 'current' | 'ollama' | 'deepseek' | 'api_key';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'current', label: '当前推理后端' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'api_key', label: '配置 API Key' },
];

export function ModelConfigDialog() {
  const { pop } = useDialog();
  const theme = useTheme();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [view, setView] = useState<'list' | 'detail' | 'api_key_list' | 'api_key_input'>('list');
  const [detailProvider, setDetailProvider] = useState<ProviderId | null>(null);
  const [apiKeyProviders, setApiKeyProviders] = useState<ProviderApiKeyStatus[]>([]);
  const [apiKeyListIndex, setApiKeyListIndex] = useState(0);
  const [apiKeyEditingProvider, setApiKeyEditingProvider] = useState<ProviderApiKeyStatus | null>(null);
  const [apiKeyInputValue, setApiKeyInputValue] = useState('');
  const [apiKeyMessage, setApiKeyMessage] = useState<string | null>(null);

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

  useInput((input, key) => {
    if (key.escape) {
      if (view === 'api_key_input') {
        setView('api_key_list');
        setApiKeyEditingProvider(null);
        setApiKeyInputValue('');
        setApiKeyMessage(null);
      } else if (view === 'api_key_list') {
        setView('list');
      } else if (view === 'detail') {
        setView('list');
        setDetailProvider(null);
      } else {
        pop();
      }
      return;
    }
    if (view === 'api_key_input') return;
    if (view === 'api_key_list') {
      const list = apiKeyProviders;
      if (key.upArrow) setApiKeyListIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) setApiKeyListIndex((i) => Math.min(list.length - 1, i + 1));
      else if (key.return && list[apiKeyListIndex]) {
        setApiKeyEditingProvider(list[apiKeyListIndex]);
        setApiKeyInputValue('');
        setApiKeyMessage(null);
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
        } else {
          setDetailProvider(id);
          setView('detail');
        }
      }
      return;
    }
    if (view === 'detail') {
      if (key.upArrow || key.downArrow || key.return) return;
    }
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
    const handleSubmit = (value: string) => {
      const trimmed = value.trim();
      api
        .post<{ success: boolean; message: string }>('/api/system/config/api-key', { provider: apiKeyEditingProvider.id, api_key: trimmed })
        .then((r) => {
          setApiKeyMessage(r.success ? r.message : r.message);
          if (r.success) {
            setApiKeyInputValue('');
            setApiKeyEditingProvider(null);
            setView('api_key_list');
          }
        })
        .catch((e) => setApiKeyMessage(String((e as Error).message)));
    };
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={48}>
        <Text bold color={theme.primary}>
          {apiKeyEditingProvider.name} — 输入新 Key（留空删除）
        </Text>
        <Box flexDirection="row" marginTop={1}>
          <Text color={theme.text}>Key: </Text>
          <TextInput
            value={apiKeyInputValue}
            onChange={setApiKeyInputValue}
            onSubmit={handleSubmit}
            placeholder="粘贴 API Key 或留空删除"
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
      <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={48}>
        <Text bold color={theme.primary}>配置 API Key — 选择厂商</Text>
        <Text color={theme.textMuted}>↑↓ 选择 · Enter 配置 · Esc 返回</Text>
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

  if (view === 'detail' && detailProvider && detailProvider !== 'api_key') {
    const lines: string[] = [];
    if (detailProvider === 'current') {
      lines.push(`当前推理后端: ${config.llm_provider}`);
      if (config.llm_provider === 'ollama') {
        lines.push(`  模型: ${config.ollama_model}`);
        lines.push(`  地址: ${config.ollama_base_url}`);
      } else if (config.llm_provider === 'deepseek') {
        lines.push(`  模型: ${config.deepseek_model ?? '-'}`);
        lines.push(`  地址: ${config.deepseek_base_url ?? '-'}`);
      }
    } else if (detailProvider === 'ollama') {
      lines.push('Ollama 配置');
      lines.push(`  默认模型 (OLLAMA_MODEL): ${config.ollama_model}`);
      lines.push(`  服务地址 (OLLAMA_BASE_URL): ${config.ollama_base_url}`);
    } else if (detailProvider === 'deepseek') {
      lines.push('DeepSeek 配置');
      lines.push(`  默认模型 (DEEPSEEK_MODEL): ${config.deepseek_model ?? '-'}`);
      lines.push(`  API 地址 (DEEPSEEK_BASE_URL): ${config.deepseek_base_url ?? '-'}`);
      lines.push('  API Key: 在弹窗首页选「配置 API Key」可设置或删除');
    }
    const label = PROVIDERS.find((p) => p.id === detailProvider)?.label ?? '';

    return (
      <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={48}>
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
        <Text color={theme.textMuted} marginTop={1}>
          修改项目根目录 .env 后重启后端生效 · Esc 返回
        </Text>
      </Box>
    );
  }

  const currentLabel =
    config.llm_provider === 'ollama'
      ? `Ollama (${config.ollama_model})`
      : config.llm_provider === 'deepseek'
        ? `DeepSeek (${config.deepseek_model ?? '-'})`
        : config.llm_provider;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={48}>
      <Text bold color={theme.primary}>
        模型 / 推理配置 — 选择提供商查看或配置
      </Text>
      <Text color={theme.textMuted}>↑↓ 选择 · Enter 进入 · Esc 关闭</Text>
      <Box flexDirection="column" marginTop={1}>
        {PROVIDERS.map((p, i) => {
          const isSelected = i === selectedIndex;
          const value =
            p.id === 'api_key'
              ? null
              : p.id === 'current'
                ? currentLabel
                : p.id === 'ollama'
                  ? config.ollama_model
                  : config.deepseek_model ?? '-';
          return (
            <Box key={p.id}>
              <Text color={isSelected ? theme.primary : theme.text}>
                {isSelected ? '> ' : '  '}
                {p.label}
                {value != null ? (p.id === 'current' ? ` (${value})` : `: ${value}`) : ''}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
