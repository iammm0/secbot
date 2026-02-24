/**
 * 需 root/本机管理员权限时的弹窗：执行一次 / 总是允许 / 拒绝，首次允许时输入密码
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../contexts/ThemeContext.js';
import { api } from '../api.js';

type RootAction = 'run_once' | 'always_allow' | 'deny';

interface RootPermissionDialogProps {
  requestId: string;
  command: string;
  onResolve: () => void;
}

export function RootPermissionDialog({ requestId, command, onResolve }: RootPermissionDialogProps) {
  const theme = useTheme();
  const [step, setStep] = useState<'choose' | 'password'>('choose');
  const [action, setAction] = useState<RootAction | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (act: RootAction, pwd: string | null) => {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/chat/root-response', {
        request_id: requestId,
        action: act,
        password: pwd ?? undefined,
      });
      onResolve();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      if (step === 'password') {
        setStep('choose');
        setAction(null);
        setPassword('');
        setError(null);
      } else {
        submit('deny', null);
      }
      return;
    }
    if (step === 'choose') {
      if (input === '1') {
        setAction('run_once');
        setStep('password');
      } else if (input === '2') {
        setAction('always_allow');
        setStep('password');
      } else if (input === '3') {
        submit('deny', null);
      }
    }
  });

  const handlePasswordSubmit = () => {
    const pwd = password.trim();
    if (action === 'run_once' && !pwd) {
      setError('执行一次需要输入本机账户或 root 密码');
      return;
    }
    if (action === 'always_allow') {
      submit('always_allow', pwd || null);
      return;
    }
    if (action === 'run_once') {
      submit('run_once', pwd);
    }
  };

  return (
    <Box flexDirection="column">
      <Text bold color={theme.primary}>
        需要 root / 本机管理员权限
      </Text>
      <Box marginTop={1}>
        <Text color={theme.textMuted}>即将执行：</Text>
      </Box>
      <Box marginTop={0}>
        <Text color={theme.text}>  {command}</Text>
      </Box>
      {step === 'choose' ? (
        <>
          <Box marginTop={2}>
            <Text color={theme.text}>请选择：</Text>
          </Box>
          <Box marginTop={0}>
            <Text>  [1] 执行一次 — 本次输入密码后执行</Text>
          </Box>
          <Box>
            <Text>  [2] 总是允许 — 记住选择，首次需输入密码</Text>
          </Box>
          <Box>
            <Text>  [3] 拒绝</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>按 1/2/3 选择，Esc 拒绝</Text>
          </Box>
        </>
      ) : (
        <>
          <Box marginTop={2}>
            <Text color={theme.text}>
              {action === 'always_allow'
                ? '总是允许：请输入本机账户或 root 密码（本次执行使用，之后不再询问）：'
                : '执行一次：请输入本机账户或 root 密码：'}
            </Text>
          </Box>
          <Box marginTop={0}>
            <Text color={theme.text}>{'> '}</Text>
            <TextInput
              value={password}
              onChange={setPassword}
              onSubmit={handlePasswordSubmit}
              placeholder="输入后回车确认"
              showCursor
            />
          </Box>
          <Box marginTop={0}>
            <Text dimColor>Esc 返回上一步</Text>
          </Box>
        </>
      )}
      {error && (
        <Box marginTop={1}>
          <Text color={theme.error}>{error}</Text>
        </Box>
      )}
      {submitting && (
        <Box marginTop={1}>
          <Text color={theme.textMuted}>提交中…</Text>
        </Box>
      )}
    </Box>
  );
}
