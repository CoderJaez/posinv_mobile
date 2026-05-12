import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { palette, radii, spacing } from '@/constants/theme';
import { getOpenShiftForUser } from '@/lib/database/shifts';
import { completeSale } from '@/lib/database/sales';
import type { PaymentMethod } from '@/lib/database/types';
import { formatCurrency } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';
import { getCartTotals, useCartStore } from '@/lib/store/cart-store';

type IconName = ComponentProps<typeof Ionicons>['name'];

const paymentMethods: { label: string; method: PaymentMethod; icon: IconName }[] = [
  { label: 'Cash', method: 'cash', icon: 'cash-outline' },
  { label: 'Card', method: 'card', icon: 'card-outline' },
  { label: 'GCash', method: 'gcash', icon: 'wallet-outline' },
  { label: 'Maya', method: 'maya', icon: 'phone-portrait-outline' },
  { label: 'GrabPay', method: 'grabpay', icon: 'qr-code-outline' },
];

export default function PaymentScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const currentShift = useAppStore((state) => state.currentShift);
  const setCurrentShift = useAppStore((state) => state.setCurrentShift);
  const items = useCartStore((state) => state.items);
  const heldTransactionId = useCartStore((state) => state.heldTransactionId);
  const clearCart = useCartStore((state) => state.clearCart);
  const totals = useMemo(() => getCartTotals(items), [items]);
  const [processingMethod, setProcessingMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectMethod(method: PaymentMethod) {
    if (method === 'cash') {
      router.push('/cash-payment' as never);
      return;
    }

    if (!currentUser || !currentShift) {
      setError('Login and active shift are required.');
      return;
    }

    setProcessingMethod(method);
    setError(null);

    try {
      const result = await completeSale(db, {
        cashierId: currentUser.id,
        shiftId: currentShift.id,
        items,
        paymentMethod: method,
        referenceNumber: `${method.toUpperCase()}-${Date.now()}`,
        heldTransactionId,
      });
      const updatedShift = await getOpenShiftForUser(db, currentUser.id);
      await setCurrentShift(updatedShift);
      clearCart();
      router.replace({
        pathname: '/payment-success',
        params: { saleId: String(result.saleId), changeDue: '0' },
      } as never);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Payment failed.');
    } finally {
      setProcessingMethod(null);
    }
  }

  return (
    <AppShell
      title="Payment"
      subtitle="Select a payment method for the current order"
      actions={<Button title="Back" variant="secondary" icon="arrow-back" onPress={() => router.back()} />}>
      <Card style={styles.card}>
        <Text style={styles.label}>Total Amount</Text>
        <Text style={styles.total}>{formatCurrency(totals.total)}</Text>

        <View style={styles.methodList}>
          {paymentMethods.map((item) => (
            <Pressable
              disabled={processingMethod != null || items.length === 0}
              key={item.method}
              onPress={() => selectMethod(item.method)}
              style={({ pressed }) => [
                styles.methodRow,
                item.method === 'cash' && styles.cashRow,
                pressed && styles.methodPressed,
              ]}>
              <Ionicons
                name={item.icon}
                size={22}
                color={item.method === 'cash' ? palette.primaryDark : palette.ink}
              />
              <Text style={styles.methodText}>{item.label}</Text>
              {processingMethod === item.method ? (
                <Text style={styles.processingText}>Processing...</Text>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={palette.inkMuted} />
              )}
            </Pressable>
          ))}
        </View>

        {items.length === 0 ? <Text style={styles.errorText}>Cart is empty.</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  methodList: {
    gap: spacing.sm,
  },
  methodRow: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  cashRow: {
    borderColor: palette.primary,
  },
  methodPressed: {
    opacity: 0.82,
  },
  methodText: {
    color: palette.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  processingText: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '800',
  },
});
