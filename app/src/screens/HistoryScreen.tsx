// ===================================================================
// 历史页面 — 对话记录 + 数据库统计
// ===================================================================

import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useApi } from '../hooks/useApi';
import StatusCard from '../components/StatusCard';
import { getDbStats, getDbHistory, clearDbHistory } from '../api/endpoints';
import type { DbStatsResponse, DbHistoryResponse } from '../types';

export default function HistoryScreen() {
  const stats = useApi<DbStatsResponse>();
  const history = useApi<DbHistoryResponse>();

  const loadData = useCallback(() => {
    stats.execute(getDbStats);
    history.execute(() => getDbHistory({ limit: 20 }));
  }, [stats.execute, history.execute]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClear = () => {
    Alert.alert('确认清空', '确定清空所有对话记录？此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearDbHistory();
            loadData();
          } catch (err: any) {
            Alert.alert('清空失败', err.message);
          }
        },
      },
    ]);
  };

  const refreshing = stats.loading || history.loading;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={loadData}
          tintColor={Colors.primary}
        />
      }
    >
      {/* 统计 */}
      <Text style={styles.sectionTitle}>数据库统计</Text>

      {stats.data && (
        <>
          <View style={styles.cardRow}>
            <StatusCard
              title="对话"
              value={String(stats.data.conversations)}
              color={Colors.primary}
            />
            <StatusCard
              title="提示词链"
              value={String(stats.data.prompt_chains)}
              color={Colors.info}
            />
          </View>
          <View style={[styles.cardRow, { marginTop: Spacing.sm }]}>
            <StatusCard
              title="用户配置"
              value={String(stats.data.user_configs)}
              color={Colors.success}
            />
            <StatusCard
              title="爬虫任务"
              value={String(stats.data.crawler_tasks)}
              color={Colors.accent}
            />
          </View>
        </>
      )}

      {/* 对话历史 */}
      <View style={styles.historyHeader}>
        <Text style={styles.sectionTitle}>对话历史</Text>
        <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
          <Text style={styles.clearText}>清空</Text>
        </TouchableOpacity>
      </View>

      {history.data && history.data.conversations.length > 0 ? (
        history.data.conversations.map((conv, idx) => (
          <View key={idx} style={styles.convCard}>
            <View style={styles.convHeader}>
              <Text style={styles.convAgent}>{conv.agent_type}</Text>
              <Text style={styles.convTime}>{conv.timestamp}</Text>
            </View>
            <View style={styles.convBody}>
              <Text style={styles.convLabel}>用户:</Text>
              <Text style={styles.convMsg} numberOfLines={2}>
                {conv.user_message}
              </Text>
            </View>
            <View style={styles.convBody}>
              <Text style={styles.convLabel}>助手:</Text>
              <Text style={styles.convMsg} numberOfLines={3}>
                {conv.assistant_message}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>暂无对话记录</Text>
      )}

      {stats.error && (
        <Text style={styles.errorText}>{stats.error}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  cardRow: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.xs,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: Spacing.xs,
  },
  clearText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  convCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  convHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  convAgent: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  convTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  convBody: {
    marginBottom: Spacing.xs,
  },
  convLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  convMsg: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 18,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    marginTop: Spacing.md,
  },
});
