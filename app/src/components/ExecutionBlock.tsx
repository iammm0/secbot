// ===================================================================
// ⚡ 执行面板 — 对应 CLI ExecutionComponent
// 颜色: yellow  图标: ⚡
// 显示工具名 + 参数表 + 执行结果
// ===================================================================

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';

interface Props {
  tool: string;
  params?: Record<string, any>;
  // 结果 (action_result 到达后填充)
  success?: boolean;
  result?: any;
  error?: string;
  running?: boolean;
}

const EXEC_COLOR = '#FFD740'; // yellow
const SUCCESS_COLOR = '#00E676';
const ERROR_COLOR = '#FF5252';

export default function ExecutionBlock({
  tool,
  params,
  success,
  result,
  error,
  running,
}: Props) {
  const [resultExpanded, setResultExpanded] = useState(false);
  const hasResult = success !== undefined;

  // 将结果格式化为字符串
  const formatResult = (val: any): string => {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  const resultText = hasResult ? (success ? formatResult(result) : error || '执行失败') : '';
  const isLongResult = resultText.length > 300;

  return (
    <View style={styles.container}>
      {/* 标题栏 */}
      <View style={styles.header}>
        <Text style={styles.icon}>⚡</Text>
        <Text style={styles.title}>执行</Text>
        <Text style={styles.toolName}>{tool}</Text>
        {running && (
          <View style={styles.runningBadge}>
            <Text style={styles.runningText}>running</Text>
          </View>
        )}
      </View>

      {/* 工具信息面板 */}
      <View style={styles.panel}>
        {/* 工具名 */}
        <View style={styles.row}>
          <Text style={styles.label}>工具名称</Text>
          <Text style={styles.toolValue}>{tool}</Text>
        </View>

        {/* 参数列表 */}
        {params && Object.keys(params).length > 0 && (
          <View style={styles.paramsSection}>
            <Text style={styles.paramsTitle}>参数</Text>
            {Object.entries(params).map(([key, value]) => (
              <View key={key} style={styles.paramRow}>
                <Text style={styles.paramKey}>{key}</Text>
                <Text style={styles.paramValue} numberOfLines={3}>
                  {typeof value === 'object'
                    ? JSON.stringify(value)
                    : String(value)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 执行结果 */}
      {hasResult && (
        <TouchableOpacity
          style={[
            styles.resultPanel,
            success ? styles.resultSuccess : styles.resultError,
          ]}
          onPress={() => isLongResult && setResultExpanded(!resultExpanded)}
          activeOpacity={isLongResult ? 0.7 : 1}
        >
          <View style={styles.resultHeader}>
            <Ionicons
              name={success ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={success ? SUCCESS_COLOR : ERROR_COLOR}
            />
            <Text
              style={[
                styles.resultTitle,
                { color: success ? SUCCESS_COLOR : ERROR_COLOR },
              ]}
            >
              Result — {success ? 'Success' : 'Failed'}
            </Text>
            {isLongResult && (
              <Ionicons
                name={resultExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={Colors.textMuted}
                style={{ marginLeft: 'auto' }}
              />
            )}
          </View>
          {resultText.length > 0 && (
            <Text
              style={styles.resultContent}
              numberOfLines={resultExpanded ? undefined : 6}
              selectable
            >
              {resultText}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  icon: {
    fontSize: 14,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: EXEC_COLOR,
    letterSpacing: 0.5,
  },
  toolName: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
  },
  runningBadge: {
    backgroundColor: EXEC_COLOR + '20',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    marginLeft: Spacing.xs,
  },
  runningText: {
    fontSize: FontSize.xs,
    color: EXEC_COLOR,
    fontWeight: '600',
  },
  panel: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: EXEC_COLOR + '40',
    borderLeftWidth: 3,
    borderLeftColor: EXEC_COLOR,
    padding: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    width: 70,
  },
  toolValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: EXEC_COLOR,
    fontFamily: 'monospace',
  },
  paramsSection: {
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  paramsTitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
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
  },
  // -- 结果面板 --
  resultPanel: {
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
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
