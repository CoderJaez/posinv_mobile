import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { palette, spacing } from '@/constants/theme';
import { getSaleById } from '@/lib/database/sales';
import type { SaleRecord } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { autoPrintReceiptForSale, printReceiptForSale } from '@/lib/printing/receipt';
import { useAppStore } from '@/lib/store/app-store';

export default function PaymentSuccessScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ saleId?: string; changeDue?: string }>();
  const currentUser = useAppStore((state) => state.currentUser);
  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [printMessage, setPrintMessage] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const autoPrintAttempted = useRef(false);
  const saleId = Number(params.saleId);
  const changeDue = Number(params.changeDue ?? 0);

  useEffect(() => {
    if (!Number.isFinite(saleId)) {
      return;
    }

    getSaleById(db, saleId).then(setSale);
  }, [db, saleId]);

  useEffect(() => {
    if (!sale || autoPrintAttempted.current) {
      return;
    }

    autoPrintAttempted.current = true;
    setPrinting(true);

    autoPrintReceiptForSale(db, { saleId: sale.id, userId: currentUser?.id ?? null })
      .then((result) => {
        setPrintMessage(result.message);
      })
      .catch((error) => {
        setPrintMessage(error instanceof Error ? error.message : 'Unable to auto print receipt.');
      })
      .finally(() => {
        setPrinting(false);
      });
  }, [currentUser?.id, db, sale]);

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
        {sale ? (
          <Button
            fullWidth
            icon="swap-horizontal-outline"
            title="Adjust Sale"
            variant="outline"
            onPress={() =>
              router.push({
                pathname: '/sale-adjustment',
                params: { saleId: String(sale.id) },
              } as never)
            }
          />
        ) : null}
        <Button
          fullWidth
          icon="print-outline"
          title="Print Receipt"
          variant="outline"
          loading={printing}
          onPress={async () => {
            if (!sale) {
              return;
            }

            setPrinting(true);
            setPrintMessage(null);

            try {
              await printReceiptForSale(db, { saleId: sale.id, userId: currentUser?.id ?? null });
              setPrintMessage('Receipt sent to printer.');
            } catch (error) {
              setPrintMessage(error instanceof Error ? error.message : 'Unable to print receipt.');
            } finally {
              setPrinting(false);
            }
          }}
        />
        {printMessage ? <Text style={styles.printMessage}>{printMessage}</Text> : null}
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
  printMessage: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
});
