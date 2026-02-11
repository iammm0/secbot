// ===================================================================
// 聊天消息气泡组件
// ===================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import type { Message } from '../types';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser
            ? styles.userBubble
            : isSystem
              ? styles.systemBubble
              : styles.assistantBubble,
        ]}
      >
        {!isUser && (
          <Text style={styles.roleLabel}>
            {isSystem ? 'SYSTEM' : 'HACKBOT'}
          </Text>
        )}
        <Text
          style={[styles.text, isUser ? styles.userText : styles.assistantText]}
          selectable
        >
          {message.content}
        </Text>
        <Text style={styles.timestamp}>
          {message.timestamp.toLocaleTimeString('zh-CN', {
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
    marginVertical: Spacing.xs,
    paddingHorizontal: Spacing.lg,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  userBubble: {
    backgroundColor: Colors.userBubble,
    borderBottomRightRadius: BorderRadius.sm,
  },
  assistantBubble: {
    backgroundColor: Colors.assistantBubble,
    borderBottomLeftRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  systemBubble: {
    backgroundColor: Colors.codeBackground,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  roleLabel: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '700',
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
  text: {
    fontSize: FontSize.md,
    lineHeight: 22,
  },
  userText: {
    color: Colors.text,
  },
  assistantText: {
    color: Colors.text,
  },
  timestamp: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    alignSelf: 'flex-end',
  },
});
