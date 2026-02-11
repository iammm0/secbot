// ===================================================================
// 最终响应块 — 对应 CLI 最终输出的 assistant panel
// 颜色: green  边框: ROUNDED  图标: 🤖
// ===================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';

interface Props {
  content: string;
  agent: string;
}

const RESPONSE_COLOR = '#00E676'; // green

export default function ResponseBlock({ content, agent }: Props) {
  return (
    <View style={styles.container}>
      {/* 标题栏 */}
      <View style={styles.header}>
        <Text style={styles.icon}>🤖</Text>
        <Text style={styles.title}>{agent || 'Hackbot'}</Text>
      </View>

      {/* 内容面板 */}
      <View style={styles.panel}>
        <Text style={styles.content} selectable>
          {content}
        </Text>
      </View>
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
    color: RESPONSE_COLOR,
    letterSpacing: 0.5,
    textTransform: 'capitalize',
  },
  panel: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: RESPONSE_COLOR + '40',
    borderLeftWidth: 3,
    borderLeftColor: RESPONSE_COLOR,
    padding: Spacing.md,
  },
  content: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 22,
  },
});
