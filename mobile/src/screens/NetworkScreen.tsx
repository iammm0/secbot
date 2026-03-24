// ===================================================================
// 网络页面 — 内网发现 + 目标管理 + 授权
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
import TargetCard from '../components/TargetCard';
import {
  getTargets,
  getAuthorizations,
  discoverNetwork,
  revokeAuthorization,
} from '../api/endpoints';
import type {
  TargetListResponse,
  AuthorizationListResponse,
} from '../types';

export default function NetworkScreen() {
  const targets = useApi<TargetListResponse>();
  const auths = useApi<AuthorizationListResponse>();
  const [discovering, setDiscovering] = useState(false);

  const loadData = useCallback(() => {
    targets.execute(() => getTargets(false));
    auths.execute(getAuthorizations);
  }, [targets.execute, auths.execute]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const result = await discoverNetwork();
      Alert.alert(
        '发现完成',
        `发现 ${result?.hosts?.length ?? 0} 个在线主机`,
      );
      loadData();
    } catch (err: any) {
      Alert.alert('发现失败', err.message);
    } finally {
      setDiscovering(false);
    }
  };

  const handleRevoke = async (ip: string) => {
    Alert.alert('确认撤销', `确定撤销 ${ip} 的授权？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeAuthorization(ip);
            loadData();
          } catch (err: any) {
            Alert.alert('撤销失败', err.message);
          }
        },
      },
    ]);
  };

  const refreshing = targets.loading || auths.loading;

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
      {/* 发现按钮 */}
      <TouchableOpacity
        style={[styles.discoverBtn, discovering && styles.discoverBtnDisabled]}
        onPress={handleDiscover}
        disabled={discovering}
        activeOpacity={0.7}
      >
        {discovering ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Ionicons name="search-outline" size={20} color={Colors.background} />
        )}
        <Text style={styles.discoverBtnText}>
          {discovering ? '发现中...' : '内网发现'}
        </Text>
      </TouchableOpacity>

      {/* 目标列表 */}
      <Text style={styles.sectionTitle}>
        目标主机
        {targets.data && (
          <Text style={styles.count}> ({targets.data.targets.length})</Text>
        )}
      </Text>

      {targets.data && targets.data.targets.length > 0 ? (
        targets.data.targets.map((host) => (
          <TargetCard key={host.ip} host={host} />
        ))
      ) : (
        <Text style={styles.emptyText}>暂无发现的目标</Text>
      )}

      {/* 授权列表 */}
      <Text style={styles.sectionTitle}>
        授权记录
        {auths.data && (
          <Text style={styles.count}>
            {' '}
            ({auths.data.authorizations.length})
          </Text>
        )}
      </Text>

      {auths.data && auths.data.authorizations.length > 0 ? (
        auths.data.authorizations.map((auth) => (
          <View key={auth.target_ip} style={styles.authRow}>
            <View style={styles.authInfo}>
              <Text style={styles.authIp}>{auth.target_ip}</Text>
              <Text style={styles.authDetail}>
                {auth.username} | {auth.auth_type} | {auth.created_at}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => handleRevoke(auth.target_ip)}
              style={styles.revokeBtn}
            >
              <Ionicons name="close-circle" size={20} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>暂无授权记录</Text>
      )}

      {targets.error && (
        <Text style={styles.errorText}>{targets.error}</Text>
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
  discoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.info,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  discoverBtnDisabled: {
    opacity: 0.6,
  },
  discoverBtnText: {
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
  count: {
    color: Colors.textMuted,
    fontWeight: '400',
  },
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  authInfo: {
    flex: 1,
  },
  authIp: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    fontFamily: 'monospace',
  },
  authDetail: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  revokeBtn: {
    padding: Spacing.xs,
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
