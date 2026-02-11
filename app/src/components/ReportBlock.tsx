// ===================================================================
// 📊 报告面板 — 对应 CLI ReportComponent
// 颜色: green  边框: DOUBLE(完成) / SIMPLE(流式)  图标: 📊
// 流式时显示闪烁光标，完成后显示完整报告
// ===================================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';

interface Props {
  content: string;
  streaming?: boolean;
}

const REPORT_COLOR = '#00E676'; // green

export default function ReportBlock({ content, streaming }: Props) {
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

  return (
    <View style={styles.container}>
      {/* 标题栏 */}
      <View style={styles.header}>
        <Text style={styles.icon}>{streaming ? '▌' : '📊'}</Text>
        <Text style={styles.title}>Report</Text>
        {streaming && (
          <View style={styles.streamingBadge}>
            <Text style={styles.streamingText}>streaming</Text>
          </View>
        )}
      </View>

      {/* 内容面板 — 完成后用双线边框(DOUBLE) */}
      <View style={[styles.panel, streaming ? styles.panelStreaming : styles.panelComplete]}>
        <Text style={styles.content} selectable={!streaming}>
          {content}
          {streaming && (
            <Animated.Text style={[styles.cursor, { opacity: cursorOpacity }]}>
              ▌
            </Animated.Text>
          )}
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
    color: REPORT_COLOR,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: REPORT_COLOR,
    letterSpacing: 0.5,
  },
  streamingBadge: {
    backgroundColor: REPORT_COLOR + '20',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    marginLeft: Spacing.xs,
  },
  streamingText: {
    fontSize: FontSize.xs,
    color: REPORT_COLOR,
    fontWeight: '600',
  },
  panel: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  panelStreaming: {
    borderWidth: 1,
    borderColor: REPORT_COLOR + '30',
    borderStyle: 'dashed',
  },
  panelComplete: {
    borderWidth: 2,
    borderColor: REPORT_COLOR + '50',
    borderLeftWidth: 4,
    borderLeftColor: REPORT_COLOR,
  },
  content: {
    fontSize: FontSize.md,
    color: Colors.text,
    lineHeight: 22,
  },
  cursor: {
    color: REPORT_COLOR,
    fontWeight: '700',
  },
});
