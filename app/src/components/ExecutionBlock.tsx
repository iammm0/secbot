// ===================================================================
// ⚡ 执行面板 — 工具名 + 参数 + 执行结果
// 默认折叠：只显示一行标题摘要，点击展开详情
// ===================================================================

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';

interface Props {
  tool: string;
  params?: Record<string, any>;
  success?: boolean;
  result?: any;
  error?: string;
  running?: boolean;
   agent?: string;
}

const EXEC_COLOR = '#FFD740';
const SUCCESS_COLOR = '#00E676';
const ERROR_COLOR = '#FF5252';

export default function ExecutionBlock({
  tool,
  params,
  success,
  result,
  error,
  running,
  agent,
}: Props) {
  const hasResult = success !== undefined;
  // 默认折叠（running 时展开参数，结果到达后折叠）
  const [expanded, setExpanded] = useState(false);

  const formatResult = (val: any): string => {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  const resultText = hasResult
    ? success
      ? formatResult(result)
      : error || '执行失败'
    : '';

  // 生成一行参数摘要
  const paramsSummary = (() => {
    if (!params || Object.keys(params).length === 0) return '';
    const entries = Object.entries(params);
    const parts = entries.slice(0, 2).map(([k, v]) => {
      const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${k}=${val.length > 30 ? val.slice(0, 30) + '…' : val}`;
    });
    if (entries.length > 2) parts.push(`+${entries.length - 2}`);
    return parts.join(', ');
  })();

  // 状态图标
  const statusIcon = running
    ? 'hourglass-outline'
    : hasResult
      ? success
        ? 'checkmark-circle'
        : 'close-circle'
      : 'ellipse-outline';
  const statusColor = running
    ? EXEC_COLOR
    : hasResult
      ? success
        ? SUCCESS_COLOR
        : ERROR_COLOR
      : Colors.textMuted;

  return (
    <View style={styles.container}>
      {/* 标题栏（可点击折叠/展开） */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.icon}>⚡</Text>
        <Text style={styles.toolName}>{tool}</Text>
        {agent && (
          <Text style={styles.agentTag}>
            [{agent}]
          </Text>
        )}

        {paramsSummary && !expanded ? (
          <Text style={styles.paramsSummary} numberOfLines={1}>
            {paramsSummary}
          </Text>
        ) : null}

        <View style={styles.headerRight}>
          {running && (
            <View style={styles.runningBadge}>
              <Text style={styles.runningText}>running</Text>
            </View>
          )}
          <Ionicons name={statusIcon} size={14} color={statusColor} />
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={Colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* 展开区域 */}
      {expanded && (
        <View style={styles.body}>
          {/* 参数面板 */}
          {params && Object.keys(params).length > 0 && (
            <View style={styles.paramsPanel}>
              <Text style={styles.sectionLabel}>参数</Text>
              {Object.entries(params).map(([key, value]) => (
                <View key={key} style={styles.paramRow}>
                  <Text style={styles.paramKey}>{key}</Text>
                  <Text style={styles.paramValue} numberOfLines={5} selectable>
                    {typeof value === 'object'
                      ? JSON.stringify(value, null, 2)
                      : String(value)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* 执行结果 */}
          {hasResult && (
            <View
              style={[
                styles.resultPanel,
                success ? styles.resultSuccess : styles.resultError,
              ]}
            >
              <View style={styles.resultHeader}>
                <Ionicons
                  name={success ? 'checkmark-circle' : 'close-circle'}
                  size={14}
                  color={success ? SUCCESS_COLOR : ERROR_COLOR}
                />
                <Text
                  style={[
                    styles.resultTitle,
                    { color: success ? SUCCESS_COLOR : ERROR_COLOR },
                  ]}
                >
                  {success ? '执行成功' : '执行失败'}
                </Text>
              </View>
              {resultText.length > 0 && (
                <Text style={styles.resultContent} selectable>
                  {resultText}
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: EXEC_COLOR + '30',
    borderLeftWidth: 3,
    borderLeftColor: EXEC_COLOR,
    overflow: 'hidden',
  },
  // -- 标题行 --
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  icon: {
    fontSize: 13,
  },
  toolName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: EXEC_COLOR,
    fontFamily: 'monospace',
  },
  agentTag: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: 'monospace',
    marginLeft: Spacing.xs,
  },
  paramsSummary: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: 'monospace',
    marginLeft: Spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginLeft: 'auto',
  },
  runningBadge: {
    backgroundColor: EXEC_COLOR + '20',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
  },
  runningText: {
    fontSize: FontSize.xs,
    color: EXEC_COLOR,
    fontWeight: '600',
  },
  // -- 展开区 --
  body: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  paramsPanel: {},
  paramRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    gap: Spacing.sm,
  },
  paramKey: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontFamily: 'monospace',
    width: 100,
  },
  paramValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    flex: 1,
    fontFamily: 'monospace',
  },
  // -- 结果 --
  resultPanel: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  resultSuccess: {
    backgroundColor: SUCCESS_COLOR + '0A',
    borderWidth: 1,
    borderColor: SUCCESS_COLOR + '30',
  },
  resultError: {
    backgroundColor: ERROR_COLOR + '0A',
    borderWidth: 1,
    borderColor: ERROR_COLOR + '30',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  resultTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  resultContent: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
});
