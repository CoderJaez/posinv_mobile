import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { palette, spacing } from '@/constants/theme';
import type { AuthUser } from '@/lib/database/types';
import { verifyAdminPin } from '@/lib/database/users';

type Props = {
  visible: boolean;
  title?: string;
  message?: string;
  actionLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onAuthorized: (admin: AuthUser) => Promise<void> | void;
};

export function AdminPinModal({
  visible,
  title = 'Admin Approval Required',
  message = 'Enter an active admin PIN to continue.',
  actionLabel = 'Authorize',
  loading = false,
  onClose,
  onAuthorized,
}: Props) {
  const db = useSQLiteContext();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPin('');
      setError(null);
    }
  }, [visible]);

  async function submit() {
    setChecking(true);
    setError(null);

    try {
      const admin = await verifyAdminPin(db, pin);
      await onAuthorized(admin);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to authorize action.');
    } finally {
      setChecking(false);
    }
  }

  function close() {
    if (checking || loading) {
      return;
    }

    setPin('');
    setError(null);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      title={title}
      onClose={close}
      footer={
        <View style={styles.footer}>
          <Button title="Cancel" variant="secondary" onPress={close} style={styles.button} />
          <Button
            title={actionLabel}
            icon="key-outline"
            loading={checking || loading}
            onPress={submit}
            style={styles.button}
          />
        </View>
      }>
      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>
        <Input
          autoFocus
          icon="lock-closed-outline"
          keyboardType="number-pad"
          label="Admin PIN"
          maxLength={6}
          onChangeText={setPin}
          secureTextEntry
          value={pin}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  message: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  error: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  button: {
    minWidth: 140,
  },
});
