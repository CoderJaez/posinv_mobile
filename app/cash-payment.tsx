import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Controller, useForm } from 'react-hook-form';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { palette, spacing } from '@/constants/theme';
import { completeSale } from '@/lib/database/sales';
import { getOpenShiftForUser } from '@/lib/database/shifts';
import { calculateCashChange } from '@/lib/domain/sales';
import { formatCurrency } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';
import { getCartTotals, useCartStore } from '@/lib/store/cart-store';

type CashPaymentForm = {
  amountGiven: string;
};

export default function CashPaymentScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const currentShift = useAppStore((state) => state.currentShift);
  const setCurrentShift = useAppStore((state) => state.setCurrentShift);
  const items = useCartStore((state) => state.items);
  const heldTransactionId = useCartStore((state) => state.heldTransactionId);
  const clearCart = useCartStore((state) => state.clearCart);
  const totals = useMemo(() => getCartTotals(items), [items]);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CashPaymentForm>({
    defaultValues: {
      amountGiven: totals.total.toFixed(2),
    },
  });

  const amountGiven = Number(watch('amountGiven') || 0);
  const change = amountGiven >= totals.total ? calculateCashChange(totals.total, amountGiven) : 0;

  async function submitPayment(values: CashPaymentForm) {
    if (!currentUser || !currentShift) {
      setPaymentError('Login and active shift are required.');
      return;
    }

    if (items.length === 0) {
      setPaymentError('Cart is empty.');
      return;
    }

    const cashReceived = Number(values.amountGiven);

    try {
      setPaymentError(null);
      const result = await completeSale(db, {
        cashierId: currentUser.id,
        shiftId: currentShift.id,
        items,
        paymentMethod: 'cash',
        cashReceived,
        heldTransactionId,
      });
      const updatedShift = await getOpenShiftForUser(db, currentUser.id);
      await setCurrentShift(updatedShift);
      clearCart();
      router.replace({
        pathname: '/payment-success',
        params: {
          saleId: String(result.saleId),
          changeDue: result.changeDue.toFixed(2),
        },
      } as never);
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Cash payment failed.');
    }
  }

  return (
    <AppShell
      title="Cash Payment"
      subtitle="Calculate change and complete the sale"
      actions={<Button title="Back" variant="secondary" icon="arrow-back" onPress={() => router.back()} />}>
      <Card style={styles.card}>
        <Text style={styles.label}>Total Amount</Text>
        <Text style={styles.total}>{formatCurrency(totals.total)}</Text>

        <Controller
          control={control}
          name="amountGiven"
          rules={{
            validate: (value) => Number(value) >= totals.total || 'Amount given is below total.',
          }}
          render={({ field: { onBlur, onChange, value } }) => (
            <Input
              icon="cash-outline"
              keyboardType="decimal-pad"
              label="Amount Given"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
        {errors.amountGiven ? <Text style={styles.errorText}>{errors.amountGiven.message}</Text> : null}
        {paymentError ? <Text style={styles.errorText}>{paymentError}</Text> : null}

        <View style={styles.changeBox}>
          <Text style={styles.changeLabel}>Change</Text>
          <Text style={styles.changeValue}>{formatCurrency(change)}</Text>
        </View>

        <Button
          fullWidth
          icon="checkmark-circle-outline"
          loading={isSubmitting}
          onPress={handleSubmit(submitPayment)}
          size="lg"
          title="Confirm Payment"
        />
      </Card>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    gap: spacing.md,
    maxWidth: 460,
    width: '100%',
  },
  label: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  total: {
    color: palette.primary,
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  changeBox: {
    backgroundColor: palette.canvas,
    borderRadius: 8,
    padding: spacing.md,
  },
  changeLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  changeValue: {
    color: palette.primaryDark,
    fontSize: 26,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '800',
  },
});
