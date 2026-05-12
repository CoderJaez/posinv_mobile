import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, spacing } from '@/constants/theme';
import {
  addCashDrawerMovement,
  endShift,
  getOpenShiftForUser,
  getShiftSummary,
} from '@/lib/database/shifts';
import type { CashDrawerMovement, CashDrawerMovementType, ShiftSummary } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

type CashMovementForm = {
  amount: string;
  reason: string;
};

type EndShiftForm = {
  actualCash: string;
  notes: string;
};

const movementColumns: TableColumn<CashDrawerMovement>[] = [
  {
    key: 'type',
    title: 'Type',
    width: 120,
    render: (movement) => (
      <Badge
        status={movement.movement_type === 'cash_in' ? 'active' : 'lowStock'}
        label={movement.movement_type === 'cash_in' ? 'Cash In' : 'Cash Out'}
      />
    ),
  },
  {
    key: 'amount',
    title: 'Amount',
    width: 120,
    align: 'right',
    render: (movement) => <Text style={styles.tableText}>{formatCurrency(movement.amount)}</Text>,
  },
  { key: 'reason', title: 'Reason', accessor: 'reason', width: 260 },
  {
    key: 'created',
    title: 'Time',
    width: 150,
    render: (movement) => <Text style={styles.tableText}>{formatDateTime(movement.created_at)}</Text>,
  },
];

export default function ShiftSummaryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ shiftId?: string }>();
  const currentUser = useAppStore((state) => state.currentUser);
  const currentShift = useAppStore((state) => state.currentShift);
  const setCurrentShift = useAppStore((state) => state.setCurrentShift);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const shiftId = useMemo(() => {
    const paramShiftId = Number(params.shiftId);
    return Number.isFinite(paramShiftId) && paramShiftId > 0 ? paramShiftId : currentShift?.id;
  }, [currentShift?.id, params.shiftId]);

  const {
    control: movementControl,
    handleSubmit: handleMovementSubmit,
    reset: resetMovement,
    formState: { errors: movementErrors, isSubmitting: movementSubmitting },
  } = useForm<CashMovementForm>({
    defaultValues: { amount: '', reason: '' },
  });

  const {
    control: endControl,
    handleSubmit: handleEndSubmit,
    setValue,
    formState: { errors: endErrors, isSubmitting: endSubmitting },
  } = useForm<EndShiftForm>({
    defaultValues: { actualCash: '', notes: '' },
  });

  const refreshSummary = useCallback(async () => {
    if (!shiftId) {
      setSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const nextSummary = await getShiftSummary(db, shiftId);
    setSummary(nextSummary);
    setLoading(false);

    if (nextSummary && nextSummary.status === 'open') {
      const expectedCash =
        nextSummary.opening_balance +
        (nextSummary.cash_sales_total ?? 0) +
        nextSummary.cash_in_total -
        nextSummary.cash_out_total;
      setValue('actualCash', expectedCash.toFixed(2));
    }
  }, [db, setValue, shiftId]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  async function submitMovement(type: CashDrawerMovementType, values: CashMovementForm) {
    if (!currentUser || !summary) {
      return;
    }

    await addCashDrawerMovement(db, {
      shiftId: summary.id,
      userId: currentUser.id,
      movementType: type,
      amount: Number(values.amount),
      reason: values.reason,
    });

    const updatedShift = await getOpenShiftForUser(db, currentUser.id);
    await setCurrentShift(updatedShift);
    resetMovement({ amount: '', reason: '' });
    setMessage(type === 'cash_in' ? 'Cash in recorded.' : 'Cash out recorded.');
    await refreshSummary();
  }

  async function submitEndShift(values: EndShiftForm) {
    if (!currentUser || !summary) {
      return;
    }

    await endShift(db, {
      shiftId: summary.id,
      userId: currentUser.id,
      actualCash: Number(values.actualCash),
      notes: values.notes,
    });

    await setCurrentShift(null);
    setMessage('Shift closed and cash drawer summary saved.');
    await refreshSummary();
  }

  const expectedCash = summary
    ? summary.opening_balance +
      (summary.cash_sales_total ?? 0) +
      summary.cash_in_total -
      summary.cash_out_total
    : 0;
  const variance =
    summary?.actual_cash == null ? null : Number((summary.actual_cash - expectedCash).toFixed(2));

  return (
    <AppShell
      title="Shift Summary"
      subtitle="Cash drawer tracking, closeout, and audit-backed shift totals"
      actions={<Button title="Back to POS" variant="secondary" icon="storefront-outline" onPress={() => router.replace('/' as never)} />}>
      {loading ? (
        <Card>
          <Text style={styles.mutedText}>Loading shift summary...</Text>
        </Card>
      ) : !summary ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.title}>No active shift</Text>
          <Text style={styles.mutedText}>Start a shift before using the register.</Text>
          <Button title="Start Shift" icon="play-circle-outline" onPress={() => router.replace('/shift-start' as never)} />
        </Card>
      ) : (
        <>
          <View style={styles.kpiGrid}>
            <Metric label="Opening Balance" value={formatCurrency(summary.opening_balance)} />
            <Metric label="Cash Sales" value={formatCurrency(summary.cash_sales_total ?? 0)} />
            <Metric label="Cash In" value={formatCurrency(summary.cash_in_total)} />
            <Metric label="Cash Out" value={formatCurrency(summary.cash_out_total)} tone="warning" />
            <Metric label="Expected Cash" value={formatCurrency(expectedCash)} />
            <Metric
              label="Actual Cash"
              value={summary.actual_cash == null ? '-' : formatCurrency(summary.actual_cash)}
              tone={summary.status === 'closed' ? 'primary' : 'muted'}
            />
          </View>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <View>
                <Text style={styles.title}>Shift #{summary.id}</Text>
                <Text style={styles.mutedText}>
                  {summary.cashier_name} · {formatDateTime(summary.started_at)}
                </Text>
              </View>
              <Badge status={summary.status === 'open' ? 'active' : 'inactive'} label={summary.status.toUpperCase()} />
            </View>
            {variance != null ? (
              <View style={styles.varianceBox}>
                <Text style={styles.varianceLabel}>Cash Variance</Text>
                <Text style={[styles.varianceValue, variance < 0 && styles.varianceNegative]}>
                  {formatCurrency(variance)}
                </Text>
              </View>
            ) : null}
          </Card>

          {summary.status === 'open' ? (
            <View style={styles.formGrid}>
              <Card style={styles.formCard}>
                <Text style={styles.title}>Cash In / Out</Text>
                <Controller
                  control={movementControl}
                  name="amount"
                  rules={{ validate: (value) => Number(value) > 0 || 'Amount must be greater than zero.' }}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      icon="cash-outline"
                      keyboardType="decimal-pad"
                      label="Amount"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {movementErrors.amount ? (
                  <Text style={styles.errorText}>{movementErrors.amount.message}</Text>
                ) : null}
                <Controller
                  control={movementControl}
                  name="reason"
                  rules={{ required: 'Reason is required.' }}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      icon="document-text-outline"
                      label="Reason"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      placeholder="Petty cash, drawer pull, etc."
                      value={value}
                    />
                  )}
                />
                {movementErrors.reason ? (
                  <Text style={styles.errorText}>{movementErrors.reason.message}</Text>
                ) : null}
                <View style={styles.buttonRow}>
                  <Button
                    title="Cash In"
                    icon="add-circle-outline"
                    loading={movementSubmitting}
                    onPress={handleMovementSubmit((values) => submitMovement('cash_in', values))}
                    style={styles.flexButton}
                  />
                  <Button
                    title="Cash Out"
                    icon="remove-circle-outline"
                    loading={movementSubmitting}
                    onPress={handleMovementSubmit((values) => submitMovement('cash_out', values))}
                    variant="outline"
                    style={styles.flexButton}
                  />
                </View>
              </Card>

              <Card style={styles.formCard}>
                <Text style={styles.title}>End Shift</Text>
                <Controller
                  control={endControl}
                  name="actualCash"
                  rules={{ validate: (value) => Number(value) >= 0 || 'Actual cash must be zero or higher.' }}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      icon="wallet-outline"
                      keyboardType="decimal-pad"
                      label="Actual Cash"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                {endErrors.actualCash ? (
                  <Text style={styles.errorText}>{endErrors.actualCash.message}</Text>
                ) : null}
                <Controller
                  control={endControl}
                  name="notes"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      icon="document-text-outline"
                      label="Closeout Notes"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      placeholder="Optional closeout notes"
                      value={value}
                    />
                  )}
                />
                <Button
                  fullWidth
                  icon="stop-circle-outline"
                  loading={endSubmitting}
                  onPress={handleEndSubmit(submitEndShift)}
                  size="lg"
                  title="End Shift"
                  variant="danger"
                />
              </Card>
            </View>
          ) : null}

          {message ? <Text style={styles.successText}>{message}</Text> : null}

          <Card padded={false}>
            <View style={styles.tableHeader}>
              <Text style={styles.title}>Cash Movement History</Text>
            </View>
            <Table
              columns={movementColumns}
              data={summary.cash_movements}
              emptyLabel="No cash movements recorded for this shift."
              keyExtractor={(movement) => String(movement.id)}
            />
          </Card>
        </>
      )}
    </AppShell>
  );
}

function Metric({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: string;
  tone?: 'primary' | 'warning' | 'muted';
}) {
  return (
    <Card style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text
        style={[
          styles.metricValue,
          tone === 'warning' && styles.metricWarning,
          tone === 'muted' && styles.metricMuted,
        ]}>
        {value}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metric: {
    flexBasis: 170,
    flexGrow: 1,
    gap: spacing.xs,
  },
  metricLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  metricValue: {
    color: palette.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  metricWarning: {
    color: palette.warning,
  },
  metricMuted: {
    color: palette.inkMuted,
  },
  summaryCard: {
    gap: spacing.md,
  },
  summaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  mutedText: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  varianceBox: {
    backgroundColor: palette.canvas,
    borderRadius: 8,
    padding: spacing.md,
  },
  varianceLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  varianceValue: {
    color: palette.primary,
    fontSize: 24,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  varianceNegative: {
    color: palette.danger,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  formCard: {
    flexBasis: 360,
    flexGrow: 1,
    gap: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flexButton: {
    flex: 1,
  },
  emptyCard: {
    alignItems: 'flex-start',
    gap: spacing.md,
    maxWidth: 520,
  },
  tableHeader: {
    padding: spacing.md,
  },
  tableText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  errorText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  successText: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
});
