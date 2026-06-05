import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { AdminPinModal } from '@/components/auth/AdminPinModal';
import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, spacing } from '@/constants/theme';
import { getSalesForShift, voidSaleTransaction } from '@/lib/database/sales';
import {
  addCashDrawerMovement,
  endShift,
  getOpenShiftForUser,
  getShiftSummary,
} from '@/lib/database/shifts';
import type {
  AuthUser,
  CashDrawerMovement,
  CashDrawerMovementType,
  SalesReportRow,
  ShiftSummary,
} from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { printReceiptForSale } from '@/lib/printing/receipt';
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
  const [sales, setSales] = useState<SalesReportRow[]>([]);
  const [voidingSale, setVoidingSale] = useState<SalesReportRow | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidRestock, setVoidRestock] = useState(true);
  const [pinPromptVisible, setPinPromptVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingVoid, setSavingVoid] = useState(false);
  const [printingSaleId, setPrintingSaleId] = useState<number | null>(null);
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
      setSales([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [nextSummary, nextSales] = await Promise.all([
      getShiftSummary(db, shiftId),
      getSalesForShift(db, shiftId),
    ]);
    setSummary(nextSummary);
    setSales(nextSales);
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

  const printSaleReceipt = useCallback(
    async (sale: SalesReportRow) => {
      setPrintingSaleId(sale.id);
      setMessage(null);

      try {
        await printReceiptForSale(db, { saleId: sale.id, userId: currentUser?.id ?? null });
        setMessage(`Receipt ${sale.receipt_number} sent to printer.`);
        await refreshSummary();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to print receipt.');
      } finally {
        setPrintingSaleId(null);
      }
    },
    [currentUser?.id, db, refreshSummary]
  );

  const saleColumns = useMemo<TableColumn<SalesReportRow>[]>(
    () => [
      { key: 'receipt', title: 'Receipt', accessor: 'receipt_number', width: 150 },
      {
        key: 'time',
        title: 'Time',
        width: 170,
        render: (sale) => <Text style={styles.tableText}>{formatDateTime(sale.completed_at)}</Text>,
      },
      {
        key: 'status',
        title: 'Status',
        width: 110,
        render: (sale) => (
          <Badge
            status={sale.status === 'completed' ? 'active' : 'critical'}
            label={sale.status.toUpperCase()}
          />
        ),
      },
      { key: 'items', title: 'Items', accessor: 'item_count', width: 80, align: 'right' },
      {
        key: 'payments',
        title: 'Payment',
        accessor: 'payment_methods',
        width: 120,
      },
      {
        key: 'total',
        title: 'Total',
        width: 120,
        align: 'right',
        render: (sale) => <Text style={styles.tableText}>{formatCurrency(sale.total)}</Text>,
      },
      {
        key: 'adjustments',
        title: 'Adjustments',
        accessor: 'adjustment_count',
        width: 110,
        align: 'right',
      },
      {
        key: 'actions',
        title: '',
        width: 260,
        render: (sale) => (
          <View style={styles.rowActions}>
            <Button
              title="Adjust"
              size="sm"
              variant="outline"
              disabled={sale.status !== 'completed'}
              onPress={() =>
                router.push({
                  pathname: '/sale-adjustment',
                  params: { saleId: String(sale.id) },
                } as never)
              }
            />
            <Button
              title="Void"
              size="sm"
              variant="danger"
              disabled={sale.status !== 'completed'}
              onPress={() => {
                setVoidingSale(sale);
                setVoidReason('');
                setVoidRestock(true);
                setMessage(null);
              }}
            />
            <Button
              title="Print"
              size="sm"
              variant="secondary"
              loading={printingSaleId === sale.id}
              onPress={() => printSaleReceipt(sale)}
            />
          </View>
        ),
      },
    ],
    [printSaleReceipt, printingSaleId, router]
  );

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

  function requestVoidApproval() {
    if (!voidingSale) {
      return;
    }

    if (!voidReason.trim()) {
      setMessage('Void reason is required.');
      return;
    }

    setPinPromptVisible(true);
  }

  async function authorizeVoid(admin: AuthUser) {
    if (!currentUser || !voidingSale) {
      return;
    }

    setSavingVoid(true);
    setMessage(null);

    try {
      await voidSaleTransaction(db, {
        saleId: voidingSale.id,
        restock: voidRestock,
        reason: voidReason,
        userId: admin.id,
        requestedByUserId: currentUser.id,
      });

      const updatedShift = await getOpenShiftForUser(db, currentUser.id);
      await setCurrentShift(updatedShift);
      setMessage(`Receipt ${voidingSale.receipt_number} voided.`);
      setPinPromptVisible(false);
      setVoidingSale(null);
      setVoidReason('');
      await refreshSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to void sale.');
      throw error;
    } finally {
      setSavingVoid(false);
    }
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
              <View>
                <Text style={styles.title}>Sales Transactions</Text>
                <Text style={styles.mutedText}>
                  Transactions handled by {summary.cashier_name} during this shift.
                </Text>
              </View>
              <Badge status="inactive" label={`${sales.length} rows`} />
            </View>
            <Table
              columns={saleColumns}
              data={sales}
              emptyLabel="No sales recorded for this shift yet."
              keyExtractor={(sale) => String(sale.id)}
            />
          </Card>

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

          <Modal
            visible={Boolean(voidingSale)}
            title="Void Sale Transaction"
            onClose={() => {
              if (savingVoid) {
                return;
              }
              setVoidingSale(null);
              setVoidReason('');
            }}
            footer={
              <View style={styles.modalFooter}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  disabled={savingVoid}
                  onPress={() => {
                    setVoidingSale(null);
                    setVoidReason('');
                  }}
                  style={styles.modalButton}
                />
                <Button
                  title="Ask Admin PIN"
                  icon="key-outline"
                  variant="danger"
                  loading={savingVoid}
                  onPress={requestVoidApproval}
                  style={styles.modalButton}
                />
              </View>
            }>
            <View style={styles.voidPrompt}>
              <Text style={styles.modalText}>
                Receipt {voidingSale?.receipt_number ?? '-'} will be marked void and removed from
                completed sales totals after admin approval.
              </Text>
              <Input
                label="Void Reason"
                value={voidReason}
                onChangeText={setVoidReason}
                placeholder="Wrong order, cancelled sale, damaged/expired item"
              />
              <View style={styles.choiceRow}>
                <Button
                  title="Return to Stock"
                  variant={voidRestock ? 'primary' : 'outline'}
                  onPress={() => setVoidRestock(true)}
                  style={styles.choiceButton}
                />
                <Button
                  title="Remove from Stock"
                  variant={!voidRestock ? 'primary' : 'outline'}
                  onPress={() => setVoidRestock(false)}
                  style={styles.choiceButton}
                />
              </View>
            </View>
          </Modal>

          <AdminPinModal
            visible={pinPromptVisible}
            actionLabel="Void Sale"
            loading={savingVoid}
            message="Enter an active admin PIN to approve this sale void."
            onClose={() => setPinPromptVisible(false)}
            onAuthorized={authorizeVoid}
          />
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
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
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
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  modalFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  modalButton: {
    minWidth: 140,
  },
  modalText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  voidPrompt: {
    gap: spacing.md,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  choiceButton: {
    flexGrow: 1,
    minWidth: 180,
  },
});
