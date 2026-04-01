import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme';
import type { RootAction } from '../types';

interface Props {
  visible: boolean;
  command: string;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (action: RootAction, password?: string) => void;
}

const OPTIONS: Array<{
  id: RootAction;
  title: string;
  description: string;
  requiresPassword: boolean;
}> = [
  {
    id: 'run_once',
    title: '执行一次',
    description: '本次输入密码后执行，不记住策略。',
    requiresPassword: true,
  },
  {
    id: 'always_allow',
    title: '总是允许',
    description: '记住允许策略，本次可附带密码继续执行。',
    requiresPassword: false,
  },
  {
    id: 'deny',
    title: '拒绝',
    description: '取消本次需要提权的操作。',
    requiresPassword: false,
  },
];

export default function RootPermissionModal({
  visible,
  command,
  loading,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [selected, setSelected] = useState<RootAction>('run_once');
  const [password, setPassword] = useState('');

  const selectedOption = useMemo(
    () => OPTIONS.find((option) => option.id === selected) ?? OPTIONS[0],
    [selected],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.eyebrow}>Root Permission</Text>
          <Text style={styles.title}>需要本机管理员权限</Text>
          <Text style={styles.description}>
            后端请求执行一条需要提权的命令。请选择执行策略，并在需要时输入密码。
          </Text>

          <View style={styles.commandBox}>
            <Text style={styles.commandText}>{command}</Text>
          </View>

          <View style={styles.options}>
            {OPTIONS.map((option) => {
              const active = option.id === selected;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.option, active && styles.optionActive]}
                  activeOpacity={0.8}
                  onPress={() => setSelected(option.id)}
                >
                  <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                    {option.title}
                  </Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>密码（可选）</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={
                selectedOption.requiresPassword
                  ? '执行一次时需要输入密码'
                  : '总是允许时可以留空'
              }
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              style={styles.input}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelBtnText}>拒绝并关闭</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                loading && styles.confirmBtnDisabled,
                selectedOption.requiresPassword && !password.trim() && styles.confirmBtnDisabled,
              ]}
              disabled={loading || (selectedOption.requiresPassword && !password.trim())}
              onPress={() => onSubmit(selected, password.trim() || undefined)}
            >
              <Text style={styles.confirmBtnText}>
                {loading ? '提交中...' : '继续执行'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.56)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  eyebrow: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  description: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  commandBox: {
    backgroundColor: Colors.codeBackground,
    borderColor: Colors.warning + '55',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  commandText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  options: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  option: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    backgroundColor: Colors.card,
  },
  optionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '12',
  },
  optionTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 4,
  },
  optionTitleActive: {
    color: Colors.primary,
  },
  optionDescription: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  field: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  fieldLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    color: Colors.text,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    color: Colors.background,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
