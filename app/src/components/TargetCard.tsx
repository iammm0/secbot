// ===================================================================
// 目标主机卡片组件
// ===================================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import type { HostInfo } from '../types';

interface Props {
  host: HostInfo;
  onPress?: () => void;
}

export default function TargetCard({ host, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name="desktop-outline"
            size={20}
            color={host.authorized ? Colors.success : Colors.textSecondary}
          />
          <Text style={styles.ip}>{host.ip}</Text>
        </View>
        <View
          style={[
            styles.badge,
            host.authorized ? styles.badgeAuth : styles.badgeUnauth,
          ]}
        >
          <Text style={styles.badgeText}>
            {host.authorized ? '已授权' : '未授权'}
          </Text>
        </View>
      </View>

      <Text style={styles.hostname}>{host.hostname}</Text>

      {host.open_ports.length > 0 && (
        <View style={styles.portsRow}>
          <Text style={styles.portsLabel}>端口: </Text>
          <Text style={styles.ports} numberOfLines={1}>
            {host.open_ports.slice(0, 8).join(', ')}
            {host.open_ports.length > 8 ? '...' : ''}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ip: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    fontFamily: 'monospace',
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  badgeAuth: {
    backgroundColor: Colors.success + '20',
  },
  badgeUnauth: {
    backgroundColor: Colors.danger + '20',
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  hostname: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  portsRow: {
    flexDirection: 'row',
    marginTop: Spacing.xs,
  },
  portsLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  ports: {
    fontSize: FontSize.xs,
    color: Colors.info,
    fontFamily: 'monospace',
    flex: 1,
  },
});
