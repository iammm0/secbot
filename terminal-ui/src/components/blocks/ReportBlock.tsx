/**
 * 报告块 — 安全/扫描报告等
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../contexts/ThemeContext.js';

interface ReportBlockProps {
  title?: string;
  body: string;
  noMargin?: boolean;
  isPlaceholder?: boolean;
}

type Severity = 'high' | 'medium' | 'low' | 'info';

type ReportLine =
  | { kind: 'blank'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'finding'; text: string; severity: Severity }
  | { kind: 'label'; label: string; text: string }
  | { kind: 'command'; text: string }
  | { kind: 'paragraph'; text: string };

const SECTION_HEADINGS = new Set([
  '摘要',
  '关键发现',
  '主要发现',
  '发现',
  '风险评估',
  '修复建议',
  '建议',
  '总结',
  '结论',
  '总体结论',
]);

const LABELS = [
  '详情',
  '证据',
  '影响',
  '原因',
  '风险',
  '建议',
  '操作步骤',
  '修复中危问题',
  '修复高危问题',
  '修复低危问题',
];

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/__+/g, '')
    .replace(/^[-*]\s+/, '')
    .trim();
}

function cleanCommand(text: string): string {
  return cleanMarkdown(text).replace(/^`+|`+$/g, '');
}

function parseSeverity(text: string): Severity {
  if (/高危|严重|critical|high/i.test(text)) return 'high';
  if (/中危|medium/i.test(text)) return 'medium';
  if (/低危|low/i.test(text)) return 'low';
  if (/🔴/.test(text)) return 'high';
  if (/🟡/.test(text)) return 'medium';
  if (/🟢/.test(text)) return 'low';
  return 'info';
}

function normalizeLabel(line: string): { label: string; text: string } | null {
  const withoutListMarker = line.replace(/^[-*]\s+/, '').trim();
  for (const label of LABELS) {
    const pattern = new RegExp(`^\\*{0,2}${label}\\*{0,2}\\s*[：:]\\s*(.*)$`);
    const match = withoutListMarker.match(pattern);
    if (match) return { label, text: cleanMarkdown(match[1] ?? '') };
  }
  return null;
}

function looksLikeCommand(text: string): boolean {
  return /^(?:`+)?\s*(?:sudo\s+)?(?:kill|lsof|ps|netstat|ss|curl|nmap|systemctl|launchctl|docker|execgo|chmod|chown|iptables|ufw)\b/.test(
    text.trim(),
  );
}

function parseReportLines(body: string): ReportLine[] {
  return body.split('\n').map((rawLine) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) return { kind: 'blank', text: '' };

    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      return { kind: 'heading', text: cleanMarkdown(headingMatch[1] ?? '') };
    }

    const label = normalizeLabel(trimmed);
    if (label) return { kind: 'label', ...label };

    if (looksLikeCommand(trimmed)) {
      return { kind: 'command', text: cleanCommand(trimmed) };
    }

    const cleaned = cleanMarkdown(trimmed);
    if (SECTION_HEADINGS.has(cleaned.replace(/[：:]$/, ''))) {
      return { kind: 'heading', text: cleaned.replace(/[：:]$/, '') };
    }

    const isBullet = /^[-*]\s+/.test(trimmed);
    const hasRiskSignal = /🔴|🟡|🟢|高危|中危|低危|critical|high|medium|low/i.test(trimmed);
    if (isBullet && hasRiskSignal) {
      return { kind: 'finding', text: cleaned, severity: parseSeverity(trimmed) };
    }

    return { kind: 'paragraph', text: cleaned };
  });
}

function cleanFindingText(text: string): string {
  return text
    .replace(/^[^\p{L}\p{N}`]+/u, '')
    .replace(/^(?:高危|中危|低危|信息)\s*[|｜]\s*/, '')
    .trim();
}

function severityMeta(
  severity: Severity,
  theme: ReturnType<typeof useTheme>,
): { color: string | undefined; marker: string; label: string } {
  switch (severity) {
    case 'high':
      return { color: theme.error, marker: '●', label: '高危' };
    case 'medium':
      return { color: theme.warning, marker: '●', label: '中危' };
    case 'low':
      return { color: theme.info, marker: '●', label: '低危' };
    default:
      return { color: theme.textMuted, marker: '●', label: '信息' };
  }
}

function InlineText({ text }: { text: string }) {
  const theme = useTheme();
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <Text color={theme.text}>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={index} color={theme.info} bold>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
}

function ReportContentLine({ line }: { line: ReportLine }) {
  const theme = useTheme();

  switch (line.kind) {
    case 'blank':
      return <Text> </Text>;
    case 'heading':
      return (
        <Box>
          <Text color={theme.info} bold>
            {'◆ '}
            {line.text}
          </Text>
        </Box>
      );
    case 'finding': {
      const meta = severityMeta(line.severity, theme);
      const text = cleanFindingText(line.text);
      return (
        <Box flexDirection="row">
          <Text color={meta.color} bold>
            {meta.marker} {meta.label}
            {'  '}
          </Text>
          <InlineText text={text} />
        </Box>
      );
    }
    case 'label':
      return (
        <Box flexDirection="row" paddingLeft={2}>
          <Text color={theme.textMuted} bold>
            {line.label}
            {'  '}
          </Text>
          <InlineText text={line.text} />
        </Box>
      );
    case 'command':
      return (
        <Box flexDirection="row" paddingLeft={2}>
          <Text color={theme.border}>{'$ '}</Text>
          <Text color={theme.info} bold>
            {line.text}
          </Text>
        </Box>
      );
    case 'paragraph':
      return (
        <Box paddingLeft={2}>
          <InlineText text={line.text} />
        </Box>
      );
  }
}

export function ReportBlock({ title = '报告', body, noMargin, isPlaceholder }: ReportBlockProps) {
  const theme = useTheme();

  if (isPlaceholder) {
    return (
      <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
        <Text color={theme.textMuted} dimColor>
          {title}
        </Text>
        <Text color={theme.textMuted} dimColor>
          {body || ' '}
        </Text>
      </Box>
    );
  }

  const lines = parseReportLines(body || ' ');

  return (
    <Box flexDirection="column" marginBottom={noMargin ? 0 : 1}>
      <Box flexDirection="row">
        <Text color={theme.accent} bold>
          {'┌ '}
          {title.toUpperCase()}
        </Text>
        <Text color={theme.border}>{' ─────────────────────────'}</Text>
      </Box>

      {lines.map((line, index) => (
        <Box key={index} flexDirection="row">
          <Text color={theme.accent}>{'│ '}</Text>
          <ReportContentLine line={line} />
        </Box>
      ))}

      <Text color={theme.accent}>{'└'}</Text>
    </Box>
  );
}
