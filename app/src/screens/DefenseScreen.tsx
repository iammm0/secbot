// ===================================================================
// 防御页面 — 安全状态、封禁IP、扫描
// ===================================================================

import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import { useApi } from '../hooks/useApi';
import StatusCard from '../components/StatusCard';
import {
  getDefenseStatus,
  getBlockedIps,
  defenseScan,
  unblockIp,
} from '../api/endpoints';
import type { DefenseStatusResponse, BlockedIpsResponse } from '../types';

export default function DefenseScreen() {
  const status = useApi<DefenseStatusResponse>();
  const blocked = useApi<BlockedIpsResponse>();
  const [scanning, setScanning] = useState(false);

  const loadData = useCallback(() => {
    status.execute(getDefenseStatus);
    blocked.execute(getBlockedIps);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      await defenseScan();
      Alert.alert('扫描完成', '安全扫描已完成，请刷新查看结果。');
      loadData();
    } catch (err: any) {
      Alert.alert('扫描失败', err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleUnblock = async (ip: string) => {
    try {
      await unblockIp(ip);
      loadData();
    } catch (err: any) {
      Alert.alert('解封失败', err.message);
    }
  };

  const refreshing = status.loading || blocked.loading;

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
      {/* 扫描按钮 */}
      <TouchableOpacity
        style={[styles.scanBtn, scanning && styles.scanBtnDisabled]}
        onPress={handleScan}
        disabled={scanning}
        activeOpacity={0.7}
      >
        {scanning ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Ionicons name="shield-checkmark" size={20} color={Colors.background} />
        )}
        <Text style={styles.scanBtnText}>
          {scanning ? '扫描中...' : '执行安全扫描'}
        </Text>
      </TouchableOpacity>

      {/* 状态卡片 */}
      {status.data && (
        <>
          <Text style={styles.sectionTitle}>防御状态</Text>
          <View style={styles.cardRow}>
            <StatusCard
              title="封禁 IP"
              value={String(status.data.blocked_ips)}
              color={Colors.danger}
            />
            <StatusCard
              title="漏洞"
              value={String(status.data.vulnerabilities)}
              color={Colors.warning}
            />
          </View>
          <View style={[styles.cardRow, { marginTop: Spacing.sm }]}>
            <StatusCard
              title="检测攻击"
              value={String(status.data.detected_attacks)}
              color={Colors.accent}
            />
            <StatusCard
              title="恶意 IP"
              value={String(status.data.malicious_ips)}
              color={Colors.danger}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>监控状态</Text>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: status.data.monitoring
                    ? Colors.success
                    : Colors.textMuted,
                },
              ]}
            />
            <Text style={styles.toggleValue}>
              {status.data.monitoring ? '运行中' : '已停止'}
            </Text>
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>自动响应</Text>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: status.data.auto_response
                    ? Colors.success
                    : Colors.textMuted,
                },
              ]}
            />
            <Text style={styles.toggleValue}>
              {status.data.auto_response ? '启用' : '禁用'}
            </Text>
          </View>
        </>
      )}

      {/* 封禁 IP 列表 */}
      <Text style={styles.sectionTitle}>封禁的 IP</Text>
      {blocked.data && blocked.data.blocked_ips.length > 0 ? (
        blocked.data.blocked_ips.map((ip) => (
          <View key={ip} style={styles.ipRow}>
            <Ionicons name="ban" size={16} color={Colors.danger} />
            <Text style={styles.ipText}>{ip}</Text>
            <TouchableOpacity
              onPress={() => handleUnblock(ip)}
              style={styles.unblockBtn}
            >
              <Text style={styles.unblockText}>解封</Text>
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>暂无封禁的 IP</Text>
      )}

      {status.error && (
        <Text style={styles.errorText}>{status.error}</Text>
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
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  scanBtnDisabled: {
    opacity: 0.6,
  },
  scanBtnText: {
    color: Colors.background,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
    marginTop: Spacing.xl,
  },
  cardRow: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  toggleLabel: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  toggleValue: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '500',
    width: 60,
  },
  ipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ipText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    fontFamily: 'monospace',
  },
  unblockBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.danger + '20',
    borderRadius: BorderRadius.sm,
  },
  unblockText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: '600',
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
