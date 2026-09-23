import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { api } from '../api/api.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { useDialog } from '../contexts/DialogContext.js';
import { isInkEscape } from '../contexts/KeybindContext.js';

interface JevPublicConfig {
  enabled: boolean;
  intent: boolean;
  qaLive: boolean;
  adaptive: boolean;
  reactStop: boolean;
  context: boolean;
  baseUrl: string;
  model: string;
  confidenceMin: number;
  reactStopMin: number;
  hasApiKey: boolean;
}

type FieldId =
  | 'enabled'
  | 'intent'
  | 'qaLive'
  | 'adaptive'
  | 'reactStop'
  | 'context'
  | 'model'
  | 'baseUrl'
  | 'apiKey'
  | 'save'
  | 'probe';

const FIELDS: Array<{ id: FieldId; label: string }> = [
  { id: 'enabled', label: '主开关' },
  { id: 'intent', label: '意图分类' },
  { id: 'qaLive', label: 'QA 实时检索' },
  { id: 'adaptive', label: '自适应重规划' },
  { id: 'reactStop', label: 'ReAct 停机' },
  { id: 'context', label: '上下文裁剪' },
  { id: 'model', label: 'Model' },
  { id: 'baseUrl', label: 'Base URL' },
  { id: 'apiKey', label: 'API Key' },
  { id: 'save', label: '保存' },
  { id: 'probe', label: '探测' },
];

const TOGGLES: Array<
  keyof Pick<JevPublicConfig, 'enabled' | 'intent' | 'qaLive' | 'adaptive' | 'reactStop' | 'context'>
> = ['enabled', 'intent', 'qaLive', 'adaptive', 'reactStop', 'context'];

export function JevConfigDialog() {
  const theme = useTheme();
  const { pop } = useDialog();
  const [config, setConfig] = useState<JevPublicConfig | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get<{ config: JevPublicConfig }>('/api/settings/jev')
      .then((res) => setConfig(res.config))
      .catch((e) => setMessage(String((e as Error).message)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const field = FIELDS[index];

  useInput((input, key) => {
    if (isInkEscape(input, key)) {
      if (editing) {
        setEditing(false);
        return;
      }
      pop();
      return;
    }
    if (loading || !config) return;
    if (editing) return;
    if (key.upArrow) {
      setIndex((prev) => (prev === 0 ? FIELDS.length - 1 : prev - 1));
      return;
    }
    if (key.downArrow) {
      setIndex((prev) => (prev + 1) % FIELDS.length);
      return;
    }
    if (key.return || input === ' ') {
      if (TOGGLES.includes(field.id as (typeof TOGGLES)[number])) {
        const id = field.id as (typeof TOGGLES)[number];
        setConfig({ ...config, [id]: !config[id] });
        return;
      }
      if (field.id === 'model' || field.id === 'baseUrl' || field.id === 'apiKey') {
        setEditing(true);
        return;
      }
      if (field.id === 'save') {
        void api
          .put<{ config: JevPublicConfig }>('/api/settings/jev', {
            ...config,
            apiKey: apiKey.trim() || undefined,
          })
          .then((res) => {
            setConfig(res.config);
            setApiKey('');
            setMessage(res.config.enabled ? '已保存。主开关已开。' : '已保存。Jev 仍关闭，走原逻辑。');
          })
          .catch((e) => setMessage(String((e as Error).message)));
        return;
      }
      if (field.id === 'probe') {
        void api
          .post<{ config: JevPublicConfig; healthy: boolean; noul?: number; error?: string }>(
            '/api/settings/jev/probe',
          )
          .then((res) => {
            setConfig(res.config);
            if (res.error) setMessage(res.error);
            else setMessage(`探测成功${res.noul != null ? ` noul=${res.noul.toFixed(3)}` : ''}`);
          })
          .catch((e) => setMessage(String((e as Error).message)));
      }
    }
  });

  const mark = (id: FieldId) => (field.id === id ? '> ' : '  ');

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={72}>
      <Text bold color={theme.primary}>
        Jev 判断层（/jev）
      </Text>
      <Text color={theme.textMuted}>↑↓ 选择 · Enter 切换/编辑/执行 · Esc 关闭。不生成文字，也不会绕过敏感工具审批。</Text>
      {loading || !config ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>加载中…</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {TOGGLES.map((id) => (
            <Text key={id} color={field.id === id ? theme.primary : theme.text}>
              {mark(id)}
              {FIELDS.find((item) => item.id === id)?.label} {config[id] ? '[开]' : '[关]'}
            </Text>
          ))}
          <Text color={field.id === 'model' ? theme.primary : theme.text}>
            {mark('model')}Model: {editing && field.id === 'model' ? '' : config.model}
          </Text>
          {editing && field.id === 'model' ? (
            <TextInput
              value={config.model}
              onChange={(value) => setConfig({ ...config, model: value })}
              onSubmit={() => setEditing(false)}
            />
          ) : null}
          <Text color={field.id === 'baseUrl' ? theme.primary : theme.text}>
            {mark('baseUrl')}Base URL: {editing && field.id === 'baseUrl' ? '' : config.baseUrl}
          </Text>
          {editing && field.id === 'baseUrl' ? (
            <TextInput
              value={config.baseUrl}
              onChange={(value) => setConfig({ ...config, baseUrl: value })}
              onSubmit={() => setEditing(false)}
            />
          ) : null}
          <Text color={field.id === 'apiKey' ? theme.primary : theme.text}>
            {mark('apiKey')}API Key: {config.hasApiKey ? '(已配置)' : '(未配置)'}
          </Text>
          {editing && field.id === 'apiKey' ? (
            <TextInput
              value={apiKey}
              onChange={setApiKey}
              mask="*"
              onSubmit={() => setEditing(false)}
            />
          ) : null}
          <Text color={field.id === 'save' ? theme.primary : theme.text}>{mark('save')}保存</Text>
          <Text color={field.id === 'probe' ? theme.primary : theme.text}>{mark('probe')}探测</Text>
        </Box>
      )}
      {message ? (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>{message}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
