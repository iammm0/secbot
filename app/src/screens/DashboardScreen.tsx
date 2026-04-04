// ===================================================================
// 仪表盘页面 — 系统信息 + 系统状态
// ===================================================================

import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useApi } from '../hooks/useApi';
import StatusCard from '../components/StatusCard';
import { getSystemInfo, getSystemStatus } from '../api/endpoints';
import type { SystemInfoResponse, SystemStatusResponse } from '../types';

export default function DashboardScreen() {
  const sysInfo = useApi<SystemInfoResponse>();
  const sysStatus = useApi<SystemStatusResponse>();

  const loadData = useCallback(() => {
    sysInfo.execute(getSystemInfo);
    sysStatus.execute(getSystemStatus);
  }, [sysInfo.execute, sysStatus.execute]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshing = sysInfo.loading || sysStatus.loading;

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
      {/* 标题 */}
      <Text style={styles.sectionTitle}>系统信息</Text>

      {sysInfo.error && (
        <Text style={styles.errorText}>{sysInfo.error}</Text>
      )}

      {sysInfo.data && (
        <View style={styles.infoGrid}>
          <InfoRow label="操作系统" value={`${sysInfo.data.os_name} ${sysInfo.data.os_version}`} />
          <InfoRow label="架构" value={sysInfo.data.architecture} />
          <InfoRow label="处理器" value={sysInfo.data.processor} />
          <InfoRow label="Node.js" value={sysInfo.data.node_version} />
          <InfoRow label="主机名" value={sysInfo.data.hostname} />
          <InfoRow label="用户" value={sysInfo.data.username} />
        </View>
      )}

      {/* 系统状态 */}
      <Text style={styles.sectionTitle}>实时状态</Text>

      {sysStatus.error && (
        <Text style={styles.errorText}>{sysStatus.error}</Text>
      )}

      {sysStatus.data && (
        <>
          <View style={styles.cardRow}>
            <StatusCard
              title="CPU"
              value={`${sysStatus.data.cpu?.percent?.toFixed(1) ?? '-'}%`}
              subtitle={`${sysStatus.data.cpu?.count ?? '-'} 核心`}
              color={
                (sysStatus.data.cpu?.percent ?? 0) > 80
                  ? Colors.danger
                  : Colors.primary
              }
            />
            <StatusCard
              title="内存"
              value={`${sysStatus.data.memory?.percent?.toFixed(1) ?? '-'}%`}
              subtitle={`${sysStatus.data.memory?.used_gb?.toFixed(1) ?? '-'} / ${sysStatus.data.memory?.total_gb?.toFixed(1) ?? '-'} GB`}
              color={
                (sysStatus.data.memory?.percent ?? 0) > 80
                  ? Colors.danger
                  : Colors.success
              }
            />
          </View>

          {sysStatus.data.disks.length > 0 && (
            <>
              <Text style={styles.subsectionTitle}>磁盘</Text>
              {sysStatus.data.disks.map((disk, idx) => (
                <View key={idx} style={styles.diskRow}>
                  <Text style={styles.diskDevice}>{disk.mountpoint}</Text>
                  <View style={styles.diskBar}>
                    <View
                      style={[
                        styles.diskBarFill,
                        {
                          width: `${disk.percent}%`,
                          backgroundColor:
                            disk.percent > 90
                              ? Colors.danger
                              : disk.percent > 70
                                ? Colors.warning
                                : Colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.diskPercent}>{disk.percent.toFixed(0)}%</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}

      {refreshing && !sysInfo.data && (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  subsectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  infoGrid: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    flex: 1,
  },
  infoValue: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  cardRow: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.xs,
  },
  diskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  diskDevice: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    width: 80,
    fontFamily: 'monospace',
  },
  diskBar: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  diskBarFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  diskPercent: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    width: 40,
    textAlign: 'right',
  },
});
