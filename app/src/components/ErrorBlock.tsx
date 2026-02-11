// ===================================================================
// 错误块 — 对应 CLI 错误显示
// 颜色: red
// ===================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';

interface Props {
  error: string;
}

const ERROR_COLOR = '#FF5252';

export default function ErrorBlock({ error }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Ionicons name="alert-circle" size={18} color={ERROR_COLOR} />
        <Text style={styles.text}>{error}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: ERROR_COLOR + '10',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: ERROR_COLOR + '30',
    borderLeftWidth: 3,
    borderLeftColor: ERROR_COLOR,
    padding: Spacing.md,
  },
  text: {
    flex: 1,
    fontSize: FontSize.md,
    color: ERROR_COLOR,
    lineHeight: 20,
  },
});
