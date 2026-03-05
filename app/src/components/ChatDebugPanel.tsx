// ===================================================================
// 聊天调试面板 — 展示当前模式、模型、状态、事件日志与 refs
// ===================================================================

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import type { SSEEvent } from '../types';

const MAX_LOG = 80;

interface DebugState {
  mode: string;
  model: string;
  currentPhase: string;
  streaming: boolean;
  blocksCount: number;
  phaseId: string | null;
  thinkingId: string | null;
  reportId: string | null;
  currentExecTool: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  state: DebugState;
  eventLog: SSEEvent[];
}

function DebugRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, mono && styles.mono]} numberOfLines={2}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

export default function ChatDebugPanel({
  visible,
  onClose,
  state,
  eventLog,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>调试面板</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator
          >
            <Text style={styles.sectionTitle}>当前配置</Text>
            <View style={styles.card}>
              <DebugRow label="模式" value={state.mode} />
              <DebugRow label="模型" value={state.model} />
              <DebugRow label="状态" value={state.currentPhase} />
              <DebugRow label="流式中" value={state.streaming ? '是' : '否'} />
              <DebugRow label="块数量" value={state.blocksCount} />
            </View>

            <Text style={styles.sectionTitle}>Refs（当前流）</Text>
            <View style={styles.card}>
              <DebugRow label="phaseId" value={state.phaseId} mono />
              <DebugRow label="thinkingId" value={state.thinkingId} mono />
              <DebugRow label="reportId" value={state.reportId} mono />
              <DebugRow label="currentExec" value={state.currentExecTool} mono />
            </View>

            <Text style={styles.sectionTitle}>
              最近事件 ({eventLog.length})
            </Text>
            <View style={styles.card}>
              {eventLog.length === 0 ? (
                <Text style={styles.emptyLog}>暂无事件</Text>
              ) : (
                [...eventLog].reverse().slice(0, MAX_LOG).map((ev, i) => (
                  <View key={`${ev.event}-${i}`} style={styles.logRow}>
                    <Text style={styles.logEvent}>{ev.event}</Text>
                    <Text style={styles.logData} numberOfLines={1}>
                      {ev.data != null && typeof ev.data === 'object'
                        ? JSON.stringify(ev.data).slice(0, 60) + '…'
                        : ev.data != null
                          ? String(ev.data)
                          : '—'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  body: {
    maxHeight: 500,
  },
  bodyContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    width: 100,
  },
  value: {
    fontSize: FontSize.sm,
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: FontSize.xs,
  },
  emptyLog: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  logRow: {
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  logEvent: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  logData: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
    marginTop: 2,
  },
});
