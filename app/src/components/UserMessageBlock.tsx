// ===================================================================
// 用户消息块 — 对应 CLI ContentComponent 的 user message
// 颜色: bright_blue  边框: ROUNDED
// ===================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';

interface Props {
  content: string;
  timestamp: Date;
}

const USER_COLOR = '#448AFF'; // bright_blue

export default function UserMessageBlock({ content, timestamp }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.content} selectable>
          {content}
        </Text>
        <Text style={styles.timestamp}>
          {timestamp.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.xs,
    alignItems: 'flex-end',
  },
  panel: {
    maxWidth: '85%',
    backgroundColor: USER_COLOR + '20',
    borderRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: USER_COLOR + '40',
    padding: Spacing.md,
  },
  content: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    alignSelf: 'flex-end',
  },
});
