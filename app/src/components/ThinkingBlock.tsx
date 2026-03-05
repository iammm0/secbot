// ===================================================================
// 💭 推理面板 — 流式时展开显示，完成后默认折叠（只显示前两行预览）
// ===================================================================

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import MarkdownText from './MarkdownText';

interface Props {
  content: string;
  iteration?: number;
  streaming?: boolean;
  agent?: string;
}

const THINKING_COLOR = '#00BCD4';
const PREVIEW_LINES = 2;

export default function ThinkingBlock({ content, iteration, streaming, agent }: Props) {
  // 流式时强制展开；完成后默认折叠
  const [expanded, setExpanded] = useState(false);

  // 闪烁光标动画
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!streaming) {
      cursorOpacity.setValue(0);
      return;
    }
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, [streaming]);

  // 生成预览文本（取前 N 行，去除空行和 markdown 标记）
  const preview = (() => {
    if (!content) return '';
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const slice = lines.slice(0, PREVIEW_LINES).join('  ');
    if (lines.length > PREVIEW_LINES) return slice + ' …';
    return slice;
  })();

  const isLong = (content || '').split('\n').filter((l) => l.trim()).length > PREVIEW_LINES;
  const showFull = streaming || expanded;

  return (
    <View style={styles.container}>
      {/* 标题栏（可点击折叠/展开） */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => !streaming && setExpanded(!expanded)}
        activeOpacity={streaming ? 1 : 0.7}
      >
        <Text style={styles.icon}>{streaming ? '▌' : '💭'}</Text>
        <Text style={styles.title}>
          推理{iteration != null && iteration > 0 ? ` #${iteration}` : ''}
        </Text>
        {agent && (
          <Text style={styles.agentTag}>
            [{agent}]
          </Text>
        )}

        {/* 折叠态：行内预览 */}
        {!showFull && preview ? (
          <Text style={styles.previewText} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}

        <View style={styles.headerRight}>
          {streaming && (
            <View style={styles.streamingBadge}>
              <Text style={styles.streamingText}>streaming</Text>
            </View>
          )}
          {!streaming && isLong && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={Colors.textMuted}
            />
          )}
        </View>
      </TouchableOpacity>

      {/* 内容面板 */}
      {showFull && (
        <View
          style={[
            styles.panel,
            streaming ? styles.panelStreaming : styles.panelComplete,
          ]}
        >
          {streaming ? (
            <Text style={styles.content} selectable={false}>
              {content}
              <Animated.Text style={[styles.cursor, { opacity: cursorOpacity }]}>
                ▌
              </Animated.Text>
            </Text>
          ) : (
            <MarkdownText content={content} />
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
    borderColor: THINKING_COLOR + '30',
    borderLeftWidth: 3,
    borderLeftColor: THINKING_COLOR,
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
    fontSize: 14,
    color: THINKING_COLOR,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: THINKING_COLOR,
    letterSpacing: 0.5,
  },
  agentTag: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginLeft: Spacing.xs,
    fontFamily: 'monospace',
  },
  previewText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginLeft: Spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginLeft: 'auto',
  },
  streamingBadge: {
    backgroundColor: THINKING_COLOR + '20',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
  },
  streamingText: {
    fontSize: FontSize.xs,
    color: THINKING_COLOR,
    fontWeight: '600',
  },
  // -- 内容面板 --
  panel: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  panelStreaming: {},
  panelComplete: {},
  content: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 22,
  },
  cursor: {
    color: THINKING_COLOR,
    fontWeight: '700',
  },
});
