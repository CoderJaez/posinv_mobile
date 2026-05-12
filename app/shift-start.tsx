import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { palette, spacing } from '@/constants/theme';
import { formatRole } from '@/lib/auth/roles';
import { getOpenShiftForUser, startShift } from '@/lib/database/shifts';
import { formatCurrency } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

type ShiftStartForm = {
  openingBalance: string;
  notes: string;
};

export default function ShiftStartScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const clearSession = useAppStore((state) => state.clearSession);
  const setCurrentShift = useAppStore((state) => state.setCurrentShift);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<ShiftStartForm>({
    defaultValues: {
      openingBalance: '1000.00',
      notes: '',
    },
  });

  const openingBalance = Number(watch('openingBalance') || 0);

  async function onSubmit(values: ShiftStartForm) {
    if (!currentUser) {
      return;
    }

    await startShift(db, {
      userId: currentUser.id,
      openingBalance: Number(values.openingBalance),
      notes: values.notes,
    });

    const shift = await getOpenShiftForUser(db, currentUser.id);
    await setCurrentShift(shift);
    router.replace('/' as never);
  }

  async function logout() {
    await clearSession();
    router.replace('/login' as never);
  }

  return (
    <AppShell
      title="Start Shift"
      subtitle="Count the drawer before opening the register"
      actions={<Button title="Logout" variant="secondary" icon="log-out-outline" onPress={logout} />}>
      <View style={styles.grid}>
        <Card style={styles.profileCard}>
          <Text style={styles.eyebrow}>Signed in as</Text>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: currentUser?.avatar_color ?? palette.primary }]}>
              <Text style={styles.avatarText}>{currentUser?.full_name.charAt(0) ?? '?'}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{currentUser?.full_name}</Text>
              <Text style={styles.profileRole}>
                {currentUser ? formatRole(currentUser.role) : 'No user selected'}
              </Text>
            </View>
          </View>
          <Text style={styles.note}>
            Shift ownership is stored locally and all sales, cash movements, and audit logs will
            attach to this user until the shift is closed.
          </Text>
        </Card>

        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Opening Cash Drawer</Text>
          <Controller
            control={control}
            name="openingBalance"
            rules={{
              validate: (value) => Number(value) >= 0 || 'Opening balance must be zero or higher.',
            }}
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                icon="cash-outline"
                keyboardType="decimal-pad"
                label="Opening Balance"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.openingBalance ? (
            <Text style={styles.errorText}>{errors.openingBalance.message}</Text>
          ) : null}

          <Controller
            control={control}
            name="notes"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                icon="document-text-outline"
                label="Notes"
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="Optional drawer notes"
                value={value}
              />
            )}
          />

          <View style={styles.expectedBox}>
            <Text style={styles.expectedLabel}>Expected Cash Starts At</Text>
            <Text style={styles.expectedValue}>{formatCurrency(Number.isFinite(openingBalance) ? openingBalance : 0)}</Text>
          </View>

          <Button
            fullWidth
            icon="play-circle-outline"
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            size="lg"
            title="Start Shift"
          />
        </Card>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  profileCard: {
    gap: spacing.md,
    maxWidth: 420,
  },
  formCard: {
    gap: spacing.md,
    maxWidth: 460,
    width: '100%',
  },
  eyebrow: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 999,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  avatarText: {
    color: palette.surface,
    fontSize: 24,
    fontWeight: '900',
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  profileRole: {
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  note: {
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  formTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  expectedBox: {
    backgroundColor: palette.successSoft,
    borderRadius: 8,
    padding: spacing.md,
  },
  expectedLabel: {
    color: palette.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  expectedValue: {
    color: palette.primaryDark,
    fontSize: 28,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  errorText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: '800',
  },
});
