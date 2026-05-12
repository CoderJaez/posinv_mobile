import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { palette, spacing } from '@/constants/theme';
import { getSaleById } from '@/lib/database/sales';
import type { SaleRecord } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';

export default function PaymentSuccessScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ saleId?: string; changeDue?: string }>();
  const [sale, setSale] = useState<SaleRecord | null>(null);
  const saleId = Number(params.saleId);
  const changeDue = Number(params.changeDue ?? 0);

  useEffect(() => {
    if (!Number.isFinite(saleId)) {
      return;
    }

    getSaleById(db, saleId).then(setSale);
  }, [db, saleId]);

  return (
    <AppShell title="Payment Success" subtitle="Sale saved locally and inventory deducted">
      <Card style={styles.card}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={54} color={palette.surface} />
        </View>
        <Text style={styles.title}>Payment Successful!</Text>
        <Text style={styles.change}>Change: {formatCurrency(Number.isFinite(changeDue) ? changeDue : 0)}</Text>

        <View style={styles.divider} />

        <Text style={styles.receipt}>Receipt # {sale?.receipt_number ?? 'Loading...'}</Text>
        <Text style={styles.meta}>{sale ? formatDateTime(sale.completed_at) : '-'}</Text>
        <Text style={styles.total}>{sale ? formatCurrency(sale.total) : formatCurrency(0)}</Text>

        <Button
          fullWidth
          icon="add-circle-outline"
          onPress={() => router.replace('/' as never)}
          size="lg"
          title="New Sale"
        />
        <Button fullWidth icon="print-outline" title="Print Receipt" variant="outline" />
      </Card>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.md,
    maxWidth: 460,
    width: '100%',
  },
  successIcon: {
    alignItems: 'center',
    backgroundColor: palette.primary,
    borderRadius: 999,
    height: 94,
    justifyContent: 'center',
    width: 94,
  },
  title: {
    color: palette.primaryDark,
    fontSize: 20,
    fontWeight: '900',
  },
  change: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  divider: {
    backgroundColor: palette.border,
    height: 1,
    width: '100%',
  },
  receipt: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  meta: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  total: {
    color: palette.primary,
    fontSize: 24,
    fontWeight: '900',
  },
});
