/**
 * 首页 — 复刻 opencode 初始页：居中 Logo、输入框、建议、快捷键提示、Tip、底部状态栏
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import figlet from 'figlet';
import { useTheme } from '../contexts/ThemeContext.js';
import { useKeybind, inkKeyToParsedKey } from '../contexts/KeybindContext.js';
import { useRoute } from '../contexts/RouteContext.js';
import { useCommand, useExit } from '../contexts/index.js';
import { SlashSuggestions } from '../components/SlashSuggestions.js';

const VERSION = '1.0.0';

/** 标题式 ASCII 艺术字 — 纯绿色粗体 Logo */
const TITLE_ASCII = (() => {
  try {
    return figlet.textSync('SECBOT', { font: 'Big', horizontalLayout: 'default' });
  } catch {
    try {
      return figlet.textSync('SECBOT', { font: 'Block', horizontalLayout: 'default' });
    } catch {
      return figlet.textSync('SECBOT', { font: 'Standard', horizontalLayout: 'default' });
    }
  }
})();
const TITLE_LINES = TITLE_ASCII.split('\n');

export function HomeView() {
  const theme = useTheme();
  const keybind = useKeybind();
  const { navigate } = useRoute();
  const { commands, trigger } = useCommand();
  const exit = useExit();
  const [inputValue, setInputValue] = useState('');
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  /** 刚从斜杠列表中选中的完整命令（如 '/agent'）；若下一次 handleSubmit 收到的是不完整斜杠（如 '/ag'）则忽略，避免 TextInput 的 Enter 覆盖跳转 */
  const justSubmittedSlashRef = useRef<string | null>(null);

  const slashSuggestions = useMemo(() => {
    if (!inputValue.startsWith('/')) return [];
    const f = inputValue.toLowerCase();
    return commands.filter((c) => c.slash && c.slash.toLowerCase().startsWith(f)).slice(0, 12);
  }, [commands, inputValue]);

  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [inputValue]);

  useInput((input, key) => {
    const evt = inkKeyToParsedKey(input, key);
    if (keybind.match('agent_switch', evt)) {
      trigger('/agent');
      return;
    }
    if (slashSuggestions.length === 0) return;
    if (key.upArrow) {
      setSlashSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSlashSelectedIndex((i) => Math.min(slashSuggestions.length - 1, i + 1));
      return;
    }
    if (key.return) {
      if (slashSuggestions.length > 0) return;
      return;
    }
    if (key.escape) {
      setInputValue('');
      return;
    }
  });

  const handleSubmit = useCallback(
    (value?: string) => {
      let trimmed = (value ?? inputValue).trim();
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        setInputValue('');
        exit(0);
        return;
      }
      if (justSubmittedSlashRef.current && trimmed.startsWith('/') && trimmed !== justSubmittedSlashRef.current) {
        justSubmittedSlashRef.current = null;
        return;
      }
      if (!trimmed) return;
      if (trimmed.startsWith('/')) {
        const match = commands.filter(
          (c) => c.slash && c.slash.toLowerCase().startsWith(trimmed.toLowerCase())
        );
        if (match.length === 1 && match[0].slash) trimmed = match[0].slash;
      }
      navigate({ type: 'session', initialPrompt: trimmed || undefined });
      setInputValue('');
    },
    [navigate, commands, exit, inputValue]
  );

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={2} paddingRight={2}>
      <Box flexGrow={1} minHeight={1} />
      <Box height={1} minHeight={0} flexShrink={1} />

      {/* Logo — 纯绿色 ASCII：粗体加粗显示 */}
      <Box flexShrink={0} alignItems="center" justifyContent="center">
        <Box flexDirection="column" alignItems="center">
          {TITLE_LINES.map((line, i) => (
            <Text key={i} color={theme.success} bold>
              {line}
            </Text>
          ))}
        </Box>
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
              onSubmit={() => {
                if (slashSuggestions.length > 0) {
                  const sel = slashSuggestions[Math.min(slashSelectedIndex, slashSuggestions.length - 1)];
                  if (sel) {
                    setInputValue(sel.slash ?? sel.value);
                    justSubmittedSlashRef.current = sel.value;
                    // 仅打开弹窗的命令（REST/agent）不跳转 session，留在首页，关弹窗后能回到首页
                    if (sel.category === 'REST' || sel.slash === '/agent') {
                      trigger(sel.value);
                      setInputValue('');
                      return;
                    }
                    handleSubmit(sel.value);
                    return;
                  }
                }
                handleSubmit();
              }}
              placeholder="Ask anything... 如 '执行安全扫描'"
            />
          </Box>
        </Box>
      </Box>

      {/* 输入斜杠后显示待选命令 */}
      {inputValue.startsWith('/') ? (
        <Box flexShrink={0} alignItems="center" justifyContent="center" width="100%" marginTop={1}>
          <Box width={64}>
            <SlashSuggestions
              commands={commands}
              selectedIndex={slashSelectedIndex}
              filter={inputValue}
            />
          </Box>
        </Box>
      ) : null}

      {/* 建议行 — 首项高亮（绿色），其余灰色；仅 Ask / Agent */}
      <Box flexShrink={0} alignItems="center" justifyContent="center" width="100%" marginTop={1}>
        <Box flexDirection="row" gap={1}>
          <Text color={theme.primary}>Ask</Text>
          <Text color={theme.textMuted}>Agent</Text>
        </Box>
      </Box>

      <Box height={2} minHeight={0} flexShrink={1} />

      {/* Tip — 橙色圆点 + 提示文案 */}
      <Box flexShrink={0} alignItems="center" justifyContent="center" width="100%">
        <Text color={theme.text}>
          <Text color={theme.warning}>• </Text>
          <Text color={theme.text}>
            Tip 输入 /ask 问答、直接输入任务执行安全测试
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
