// ===================================================================
// 📋 规划面板 — 对应 CLI PlanningComponent
// 颜色: magenta  边框: ROUNDED  图标: 📋
// ===================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';

interface Props {
  content: string;
}

const PLANNING_COLOR = '#E040FB'; // magenta

export default function PlanningBlock({ content }: Props) {
  return (
    <View style={styles.container}>
      {/* 标题栏 */}
      <View style={styles.header}>
        <Text style={styles.icon}>📋</Text>
        <Text style={styles.title}>Planning</Text>
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
    color: PLANNING_COLOR,
    letterSpacing: 0.5,
  },
  panel: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: PLANNING_COLOR + '40',
    borderLeftWidth: 3,
    borderLeftColor: PLANNING_COLOR,
    padding: Spacing.md,
  },
  content: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 22,
  },
});
