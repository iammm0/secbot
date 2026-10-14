import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { api } from '../api/api.js';
import { useTheme } from '../contexts/ThemeContext.js';
import { useDialog } from '../contexts/DialogContext.js';
import { isInkEscape } from '../contexts/KeybindContext.js';

interface ExecGoSettings {
  enabled: boolean;
  auditActions: boolean;
  fallbackLocal: boolean;
  sandboxProfile: 'process' | 'isolated';
  url: string;
  runtimeUrl: string;
  cliPath: string;
}

interface ExecGoSandboxStatus {
  label: string;
  detail: string;
  os: string | null;
  linux_sandbox: boolean | null;
  cgroup_v2: boolean | null;
}

interface ExecGoProbe {
  config: ExecGoSettings;
  healthy: boolean;
  sandbox?: ExecGoSandboxStatus;
  error?: string;
}

type Field = 'enabled' | 'audit' | 'profile' | 'fallback' | 'save' | 'probe';

const FIELDS: Array<{ id: Field; label: string }> = [
  { id: 'enabled', label: '启用' },
  { id: 'audit', label: '审计' },
  { id: 'profile', label: '隔离档位' },
  { id: 'fallback', label: '失败回退本机' },
  { id: 'save', label: '保存' },
  { id: 'probe', label: '重新探测' },
];

export function ExecGoConfigDialog() {
  const theme = useTheme();
  const { pop } = useDialog();
  const [config, setConfig] = useState<ExecGoSettings | null>(null);
  const [sandbox, setSandbox] = useState<ExecGoSandboxStatus | null>(null);
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState('');

  const load = () => {
    api
      .get<ExecGoProbe>('/api/settings/execgo')
      .then((payload) => {
        setConfig({
          ...payload.config,
          sandboxProfile: payload.config.sandboxProfile || 'process',
        });
        setSandbox(payload.sandbox ?? null);
        if (payload.error) setMessage(payload.error);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  };

  useEffect(() => {
    load();
  }, []);

  const field = FIELDS[index];

  useInput((input, key) => {
    if (isInkEscape(input, key)) {
      pop();
      return;
    }
    if (!config || !field) return;
    if (key.upArrow) {
      setIndex((prev) => (prev === 0 ? FIELDS.length - 1 : prev - 1));
      return;
    }
    if (key.downArrow) {
      setIndex((prev) => (prev + 1) % FIELDS.length);
      return;
    }
    if (!(key.return || input === ' ')) return;
    if (field.id === 'enabled') setConfig({ ...config, enabled: !config.enabled });
    if (field.id === 'audit') setConfig({ ...config, auditActions: !config.auditActions });
    if (field.id === 'profile') {
      const sandboxProfile = config.sandboxProfile === 'isolated' ? 'process' : 'isolated';
      setConfig({
        ...config,
        sandboxProfile,
        fallbackLocal: sandboxProfile === 'isolated' ? false : config.fallbackLocal,
      });
    }
    if (field.id === 'fallback' && config.sandboxProfile !== 'isolated') {
      setConfig({ ...config, fallbackLocal: !config.fallbackLocal });
    }
    if (field.id === 'save') {
      void api
        .put<{ config: ExecGoSettings }>('/api/settings/execgo', config)
        .then((saved) => {
          setConfig(saved.config);
          setMessage(
            saved.config.sandboxProfile === 'isolated'
              ? '已保存。isolated 不会回退本机。'
              : '已保存。',
          );
          load();
        })
        .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
    }
    if (field.id === 'probe') load();
  });

  const mark = (id: Field) => (field?.id === id ? '> ' : '  ');

  return (
    <Box flexDirection="column" paddingX={1} minWidth={72}>
      <Text bold color={theme.primary}>
        ExecGo 运行时（/execgo）
      </Text>
      <Text color={theme.textMuted}>
        ↑↓ 选择 · Enter 切换 · Esc 关闭。状态只显示 runtime 回包。
      </Text>
      {!config ? (
        <Text color={theme.textMuted}>加载中…</Text>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text}>{sandbox?.label || 'ExecGo process'}</Text>
          <Text color={theme.textMuted}>
            {sandbox?.detail || '进程隔离'}
            {sandbox?.os ? ` · ${sandbox.os}` : ''}
            {sandbox?.linux_sandbox != null
              ? ` · linux_sandbox=${String(sandbox.linux_sandbox)}`
              : ''}
            {sandbox?.cgroup_v2 != null ? ` · cgroup_v2=${String(sandbox.cgroup_v2)}` : ''}
          </Text>
          <Text color={field?.id === 'enabled' ? theme.primary : theme.text}>
            {mark('enabled')}启用 {config.enabled ? '[开]' : '[关]'}
          </Text>
          <Text color={field?.id === 'audit' ? theme.primary : theme.text}>
            {mark('audit')}审计 {config.auditActions ? '[开]' : '[关]'}
          </Text>
          <Text color={field?.id === 'profile' ? theme.primary : theme.text}>
            {mark('profile')}隔离档位 [{config.sandboxProfile}]
          </Text>
          <Text color={field?.id === 'fallback' ? theme.primary : theme.text}>
            {mark('fallback')}失败回退本机{' '}
            {config.sandboxProfile === 'isolated'
              ? '[已禁止]'
              : config.fallbackLocal
                ? '[开]'
                : '[关]'}
          </Text>
          <Text color={field?.id === 'save' ? theme.primary : theme.text}>{mark('save')}保存</Text>
          <Text color={field?.id === 'probe' ? theme.primary : theme.text}>
            {mark('probe')}重新探测
          </Text>
        </Box>
      )}
      {message ? <Text color={theme.warning}>{message}</Text> : null}
    </Box>
  );
}
