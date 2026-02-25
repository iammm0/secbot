/**
 * 首页 — 复刻 opencode 初始页：居中 Logo、输入框、建议、快捷键提示、Tip、底部状态栏
 */
import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import figlet from 'figlet';
import { useTheme } from '../contexts/ThemeContext.js';
import { useKeybind } from '../contexts/KeybindContext.js';
import { useRoute } from '../contexts/RouteContext.js';

const VERSION = '1.0.0';

/** 标题式 ASCII 艺术字 */
const TITLE_ASCII = figlet.textSync('Secbot', { font: 'Standard', horizontalLayout: 'default' });

export function HomeView() {
  const theme = useTheme();
  const keybind = useKeybind();
  const { navigate } = useRoute();
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      navigate({ type: 'session', initialPrompt: trimmed || undefined });
      setInputValue('');
    },
    [navigate]
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2}>
      <Box flexGrow={1} minHeight={1} />
      <Box height={1} minHeight={0} flexShrink={1} />

      {/* Logo — 标题式 ASCII 艺术字 */}
      <Box flexShrink={0} alignItems="center" justifyContent="center">
        <Text color={theme.primary} bold>
          {TITLE_ASCII}
        </Text>
      </Box>

      <Box height={2} minHeight={0} flexShrink={1} />

      {/* 主输入区 — 居中 */}
      <Box flexShrink={0} alignItems="center" justifyContent="center" width="100%">
        <Box width={64}>
          <Box flexDirection="row" alignItems="center">
            <Text color={theme.textMuted}>› </Text>
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              placeholder="Ask anything... '执行安全扫描' 或 '/plan 制定计划'"
            />
          </Box>
        </Box>
      </Box>

      {/* 建议行 — 首项高亮（蓝色），其余灰色 */}
      <Box flexShrink={0} alignItems="center" justifyContent="center" width="100%" marginTop={1}>
        <Box flexDirection="row" gap={1}>
          <Text color={theme.primary}>Plan</Text>
          <Text color={theme.textMuted}>Start</Text>
          <Text color={theme.textMuted}>Ask</Text>
          <Text color={theme.textMuted}>Agent</Text>
        </Box>
      </Box>

      {/* 快捷键提示 */}
      <Box flexShrink={0} alignItems="center" justifyContent="center" width="100%" marginTop={1}>
        <Text color={theme.textMuted}>
          tab agents · {keybind.print('command_list')} commands
        </Text>
      </Box>

      <Box height={2} minHeight={0} flexShrink={1} />

      {/* Tip — 橙色圆点 + 提示文案 */}
      <Box flexShrink={0} alignItems="center" justifyContent="center" width="100%">
        <Text color={theme.text}>
          <Text color={theme.warning}>• </Text>
          <Text color={theme.text}>
            Tip 输入 /plan 制定计划，/start 开始执行安全测试
          </Text>
        </Text>
      </Box>

      <Box flexGrow={1} minHeight={1} />

      {/* 底部状态栏 — 左：路径/标识，右：版本 */}
      <Box
        flexShrink={0}
        flexDirection="row"
        justifyContent="space-between"
        paddingTop={1}
        paddingBottom={1}
      >
        <Text color={theme.textMuted}>~: HEAD</Text>
        <Text color={theme.textMuted}>{VERSION}</Text>
      </Box>
    </Box>
  );
}
