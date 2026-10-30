/**
 * 外部集成（/integrate）— 把 Secbot 注册为 Claude Code / Codex 的 MCP 工具，并给出 ACP 命令。
 */
import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../contexts/ThemeContext.js';
import { useDialog } from '../contexts/DialogContext.js';
import { isInkEscape } from '../contexts/KeybindContext.js';
import { api } from '../api/api.js';

interface ClientStatus {
  installed: boolean;
  path?: string;
  mcp_registered: boolean;
}

interface ExternalStatus {
  claude_code: ClientStatus;
  codex: ClientStatus;
  secbot_command: { command: string; args: string[] };
  acp_command: { command: string; args: string[] };
}

type Action = 'claude' | 'codex' | 'refresh' | 'close';

const ACTIONS: { id: Action; label: string; hint: string }[] = [
  { id: 'claude', label: '注册 MCP 到 Claude Code', hint: '写入 ~/.claude.json' },
  { id: 'codex', label: '注册 MCP 到 Codex', hint: '写入 ~/.codex/config.toml' },
  { id: 'refresh', label: '重新检测', hint: '刷新安装/注册状态' },
  { id: 'close', label: '关闭', hint: 'Esc' },
];

function launchLabel(spec: { command: string; args: string[] }): string {
  return [spec.command, ...spec.args].join(' ');
}

export function ExternalIntegrationDialog() {
  const theme = useTheme();
  const { pop } = useDialog();
  const [status, setStatus] = useState<ExternalStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);

  const load = () => {
    setBusy(true);
    setMessage(null);
    api
      .get<ExternalStatus>('/api/system/external-integration')
      .then(setStatus)
      .catch((e) => setMessage(`读取外部集成状态失败：${String((e as Error).message)}`))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load();
  }, []);

  useInput((input, key) => {
    if (isInkEscape(input, key)) {
      pop();
      return;
    }
    if (key.upArrow) setSelected((i) => Math.max(0, i - 1));
    else if (key.downArrow) setSelected((i) => Math.min(ACTIONS.length - 1, i + 1));
    else if (key.return && !busy) {
      const action = ACTIONS[selected].id;
      if (action === 'refresh') {
        load();
      } else if (action === 'close') {
        pop();
      } else if (action === 'claude' || action === 'codex') {
        const endpoint = action === 'claude' ? 'claude-mcp' : 'codex-mcp';
        setBusy(true);
        setMessage('注册中…');
        api
          .post<{ success: boolean; message: string }>(`/api/system/external-integration/${endpoint}`, {})
          .then((r) => {
            setMessage(r.message);
            load();
          })
          .catch((e) => setMessage(`注册失败：${String((e as Error).message)}`))
          .finally(() => setBusy(false));
      }
    }
  });

  const clientLine = (title: string, client: ClientStatus) => (
    <Text color={theme.text}>
      {title}: {client.installed ? '已安装' : '未检测到'}
      {client.installed && ` · MCP ${client.mcp_registered ? '已注册' : '未注册'}`}
    </Text>
  );

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Text bold color={theme.primary}>外部集成 — Secbot 作为外部工具 / agent</Text>
      <Text color={theme.textMuted}>
        通过 MCP 暴露为工具（mcp__secbot__*），通过 ACP 暴露为外部 agent（Zed / VS Code ACP 等）。
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {status ? (
          <>
            {clientLine('Claude Code', status.claude_code)}
            {clientLine('Codex', status.codex)}
            <Text color={theme.textMuted}>ACP 命令: {launchLabel(status.acp_command)}</Text>
          </>
        ) : (
          <Text color={theme.textMuted}>探测中…</Text>
        )}
      </Box>
      {message && (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>{message}</Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        {ACTIONS.map((action, index) => (
          <Box key={action.id} flexDirection="column">
            <Text color={index === selected ? theme.primary : theme.text}>
              {index === selected ? '> ' : '  '}[{index + 1}] {action.label}
            </Text>
            <Box marginLeft={4}>
              <Text color={theme.textMuted}>{action.hint}</Text>
            </Box>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.textMuted}>↑↓ 选择 · Enter 执行 · Esc 关闭</Text>
      </Box>
    </Box>
  );
}
