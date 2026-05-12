import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, radii, spacing } from '@/constants/theme';
import {
  createPrepaidReference,
  createPrepaidTransaction,
  getRecentPrepaidTransactions,
  getTodayPrepaidSummary,
} from '@/lib/database/prepaid';
import type {
  PrepaidProvider,
  PrepaidSummary,
  PrepaidTransaction,
} from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

type PrepaidFormValues = {
  mobileNumber: string;
  amount: string;
  serviceFee: string;
  referenceNumber: string;
};

const providers: { label: string; value: PrepaidProvider }[] = [
  { label: 'Smart', value: 'smart' },
  { label: 'Globe', value: 'globe' },
  { label: 'TNT', value: 'tnt' },
  { label: 'Sun', value: 'sun' },
];

const amounts = [50, 100, 200, 500, 1000];

const emptySummary: PrepaidSummary = {
  total_amount: 0,
  service_fees: 0,
  transaction_count: 0,
};

const columns: TableColumn<PrepaidTransaction>[] = [
  {
    key: 'provider',
    title: 'Provider',
    width: 110,
    render: (transaction) => (
      <Text style={styles.tableText}>{transaction.provider.toUpperCase()}</Text>
    ),
  },
  { key: 'mobile', title: 'Mobile Number', accessor: 'mobile_number', width: 160 },
  {
    key: 'amount',
    title: 'Amount',
    width: 120,
    align: 'right',
    render: (transaction) => <Text style={styles.tableText}>{formatCurrency(transaction.amount)}</Text>,
  },
  {
    key: 'fee',
    title: 'Fee',
    width: 100,
    align: 'right',
    render: (transaction) => (
      <Text style={styles.tableText}>{formatCurrency(transaction.service_fee)}</Text>
    ),
  },
  { key: 'reference', title: 'Reference', accessor: 'reference_number', width: 170 },
  {
    key: 'status',
    title: 'Status',
    width: 120,
    render: (transaction) => (
      <Badge status={transaction.status === 'completed' ? 'active' : 'inactive'} label={transaction.status.toUpperCase()} />
    ),
  },
  {
    key: 'cashier',
    title: 'Cashier',
    accessor: 'cashier_name',
    width: 160,
  },
  {
    key: 'date',
    title: 'Created',
    width: 160,
    render: (transaction) => (
      <Text style={styles.tableText}>{formatDateTime(transaction.created_at)}</Text>
    ),
  },
];

export default function PrepaidScreen() {
  const db = useSQLiteContext();
  const currentUser = useAppStore((state) => state.currentUser);
  const currentShift = useAppStore((state) => state.currentShift);
  const [provider, setProvider] = useState<PrepaidProvider>('smart');
  const [transactions, setTransactions] = useState<PrepaidTransaction[]>([]);
  const [summary, setSummary] = useState<PrepaidSummary>(emptySummary);
  const [message, setMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PrepaidFormValues>({
    defaultValues: {
      mobileNumber: '',
      amount: '50',
      serviceFee: '0',
      referenceNumber: createPrepaidReference(),
    },
  });

  const selectedAmount = Number(watch('amount') || 0);
  const serviceFee = Number(watch('serviceFee') || 0);
  const cashCollected = selectedAmount + serviceFee;

  const refresh = useCallback(async () => {
    const [nextTransactions, nextSummary] = await Promise.all([
      getRecentPrepaidTransactions(db, 20),
      getTodayPrepaidSummary(db),
    ]);
    setTransactions(nextTransactions);
    setSummary(nextSummary);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function onSubmit(values: PrepaidFormValues) {
    if (!currentUser) {
      return;
    }

    if (!currentShift) {
      setMessage('Start a shift before recording prepaid load.');
      return;
    }

    try {
      const result = await createPrepaidTransaction(db, {
        cashierId: currentUser.id,
        shiftId: currentShift.id,
        provider,
        mobileNumber: values.mobileNumber,
        amount: Number(values.amount),
        serviceFee: Number(values.serviceFee || 0),
        referenceNumber: values.referenceNumber,
      });

      setMessage(`Load recorded. Reference ${result.referenceNumber}.`);
      reset({
        mobileNumber: '',
        amount: '50',
        serviceFee: '0',
        referenceNumber: createPrepaidReference(),
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to record prepaid load.');
    }
  }

  return (
    <AppShell
      title="Prepaid / Load"
      subtitle="Offline record keeping for prepaid transactions"
      actions={
        <Button
          title="New Load"
          icon="phone-portrait-outline"
          onPress={() => {
            reset({
              mobileNumber: '',
              amount: '50',
              serviceFee: '0',
              referenceNumber: createPrepaidReference(),
            });
            setMessage(null);
          }}
        />
      }>
      <RequireRole roles={['cashier', 'supervisor', 'admin']}>
        <View style={styles.metricGrid}>
          <MetricCard label="Today Load Sales" value={formatCurrency(summary.total_amount)} />
          <MetricCard label="Transactions" value={summary.transaction_count.toLocaleString()} />
          <MetricCard label="Service Fees" value={formatCurrency(summary.service_fees)} />
        </View>

        <View style={styles.layout}>
          <Card style={styles.formCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionTitle}>Network</Text>
              {currentShift ? <Badge status="active" label={`SHIFT #${currentShift.id}`} /> : <Badge status="inactive" label="NO SHIFT" />}
            </View>

            <View style={styles.providerRow}>
              {providers.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setProvider(option.value)}
                  style={[styles.providerPill, provider === option.value && styles.providerPillActive]}>
                  <Text
                    style={[
                      styles.providerText,
                      provider === option.value && styles.providerTextActive,
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Controller
              control={control}
              name="mobileNumber"
              rules={{ required: 'Mobile number is required.' }}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Mobile Number"
                  icon="person-outline"
                  keyboardType="phone-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  placeholder="09XX XXX XXXX"
                  value={value}
                />
              )}
            />

            <View style={styles.fieldBlock}>
              <Text style={styles.blockLabel}>Select Amount</Text>
              <View style={styles.amountGrid}>
                {amounts.map((amount) => (
                  <Pressable
                    key={amount}
                    onPress={() => setValue('amount', String(amount))}
                    style={[styles.amountButton, selectedAmount === amount && styles.amountButtonActive]}>
                    <Text
                      style={[
                        styles.amountText,
                        selectedAmount === amount && styles.amountTextActive,
                      ]}>
                      {formatCurrency(amount)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inlineFields}>
              <Controller
                control={control}
                name="amount"
                rules={{ validate: (value) => Number(value) > 0 || 'Amount must be greater than zero.' }}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Custom Amount"
                    keyboardType="decimal-pad"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    containerStyle={styles.inlineInput}
                  />
                )}
              />
              <Controller
                control={control}
                name="serviceFee"
                rules={{ validate: (value) => Number(value || 0) >= 0 || 'Fee cannot be negative.' }}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Service Fee"
                    keyboardType="decimal-pad"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    containerStyle={styles.inlineInput}
                  />
                )}
              />
            </View>

            <Controller
              control={control}
              name="referenceNumber"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Reference Number"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />

            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Cash Collected</Text>
              <Text style={styles.totalValue}>{formatCurrency(cashCollected)}</Text>
            </View>

            {Object.values(errors)[0]?.message ? (
              <Text style={styles.errorText}>{Object.values(errors)[0]?.message}</Text>
            ) : null}
            {message ? <Text style={styles.message}>{message}</Text> : null}

            <Button
              fullWidth
              icon="checkmark-circle-outline"
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
              size="lg"
              title="Confirm Load"
            />
          </Card>

          <Card style={styles.helpCard}>
            <Ionicons name="phone-portrait-outline" size={34} color={palette.primary} />
            <Text style={styles.helpTitle}>Offline prepaid records</Text>
            <Text style={styles.helpText}>
              This version records the load sale locally only. Provider fulfillment and balance
              inquiry integrations are placeholders for a future connected release.
            </Text>
          </Card>
        </View>

        <Card padded={false}>
          <View style={styles.tableHeader}>
            <Text style={styles.sectionTitle}>Recent Prepaid Transactions</Text>
            <Text style={styles.mutedText}>{transactions.length} rows</Text>
          </View>
          <Table
            columns={columns}
            data={transactions}
            emptyLabel="No prepaid transactions yet."
            keyExtractor={(transaction) => String(transaction.id)}
          />
        </Card>
      </RequireRole>
    </AppShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricCard: {
    flexBasis: 180,
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
  layout: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  formCard: {
    flexBasis: 420,
    flexGrow: 1,
    gap: spacing.md,
  },
  helpCard: {
    flexBasis: 260,
    flexGrow: 1,
    gap: spacing.sm,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  providerPill: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexBasis: 92,
    flexGrow: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  providerPillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  providerText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  providerTextActive: {
    color: palette.surface,
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  blockLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  amountButton: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexBasis: 92,
    flexGrow: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  amountButtonActive: {
    borderColor: palette.primary,
    borderWidth: 2,
  },
  amountText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  amountTextActive: {
    color: palette.primaryDark,
  },
  inlineFields: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inlineInput: {
    flex: 1,
  },
  totalBox: {
    backgroundColor: palette.successSoft,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  totalLabel: {
    color: palette.primaryDark,
    fontSize: 12,
    fontWeight: '900',
  },
  totalValue: {
    color: palette.primaryDark,
    fontSize: 24,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  helpTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  helpText: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  tableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  tableText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  mutedText: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  message: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '800',
  },
});
