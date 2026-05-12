import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { palette, spacing } from '@/constants/theme';
import {
  clearHeldTransactions,
  getHeldTransactions,
  markHeldTransactionResumed,
  voidHeldTransaction,
} from '@/lib/database/sales';
import type { CartItemSnapshot, HeldTransaction } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';
import { useCartStore } from '@/lib/store/cart-store';

export default function HoldTransactionsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const currentShift = useAppStore((state) => state.currentShift);
  const replaceCart = useCartStore((state) => state.replaceCart);
  const [heldTransactions, setHeldTransactions] = useState<HeldTransaction[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setHeldTransactions(await getHeldTransactions(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function resumeTransaction(transaction: HeldTransaction) {
    if (!currentUser) {
      return;
    }

    const items = JSON.parse(transaction.cart_json) as CartItemSnapshot[];
    await markHeldTransactionResumed(db, {
      heldTransactionId: transaction.id,
      userId: currentUser.id,
    });
    replaceCart(items, transaction.id);
    router.replace('/' as never);
  }

  async function voidTransaction(transaction: HeldTransaction) {
    if (!currentUser) {
      return;
    }

    await voidHeldTransaction(db, { heldTransactionId: transaction.id, userId: currentUser.id });
    setMessage(`${transaction.hold_number} voided.`);
    await refresh();
  }

  async function clearAll() {
    if (!currentUser) {
      return;
    }

    await clearHeldTransactions(db, {
      userId: currentUser.id,
      shiftId: currentShift?.id ?? null,
    });
    setMessage('Held transactions cleared.');
    await refresh();
  }

  return (
    <AppShell
      title="Hold Transactions"
      subtitle="Resume or clear locally held carts"
      actions={
        <>
          <Button title="Back" variant="secondary" icon="arrow-back" onPress={() => router.back()} />
          <Button title="Clear All" variant="outline" icon="trash-outline" onPress={clearAll} />
        </>
      }>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Card style={styles.list}>
        {heldTransactions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="archive-outline" size={34} color={palette.inkMuted} />
            <Text style={styles.emptyText}>No held transactions.</Text>
          </View>
        ) : (
          heldTransactions.map((transaction) => {
            const items = JSON.parse(transaction.cart_json) as CartItemSnapshot[];
            const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

            return (
              <View key={transaction.id} style={styles.row}>
                <View style={styles.rowCopy}>
                  <Text style={styles.holdNumber}>#{transaction.hold_number}</Text>
                  <Text style={styles.meta}>
                    {itemCount} items · {formatDateTime(transaction.held_at)}
                  </Text>
                </View>
                <Text style={styles.amount}>{formatCurrency(transaction.total)}</Text>
                <Pressable
                  onPress={() => resumeTransaction(transaction)}
                  style={[styles.iconButton, styles.resumeButton]}>
                  <Text style={styles.resumeText}>Resume</Text>
                </Pressable>
                <Pressable onPress={() => voidTransaction(transaction)} style={styles.iconButton}>
                  <Ionicons name="trash-outline" size={18} color={palette.danger} />
                </Pressable>
              </View>
            );
          })
        )}
      </Card>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  message: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  list: {
    gap: spacing.sm,
    maxWidth: 680,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 180,
  },
  emptyText: {
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 62,
    paddingVertical: spacing.sm,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  holdNumber: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  meta: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  amount: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '900',
    minWidth: 86,
    textAlign: 'right',
  },
  iconButton: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  resumeButton: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  resumeText: {
    color: palette.surface,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
