import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
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
  adjustSaleItem,
  getSaleAdjustments,
  getSaleById,
  getSaleItems,
} from '@/lib/database/sales';
import type { SaleAdjustment, SaleItemRecord, SaleRecord } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

const adjustmentColumns: TableColumn<SaleAdjustment>[] = [
  {
    key: 'created',
    title: 'Date',
    width: 160,
    render: (adjustment) => (
      <Text style={styles.tableText}>{formatDateTime(adjustment.created_at)}</Text>
    ),
  },
  { key: 'product', title: 'Product', accessor: 'product_name', width: 180 },
  { key: 'reason', title: 'Reason', accessor: 'reason', width: 220 },
  {
    key: 'qty',
    title: 'Qty',
    width: 120,
    align: 'right',
    render: (adjustment) => (
      <Text style={styles.tableText}>
        {adjustment.previous_quantity} to {adjustment.new_quantity}
      </Text>
    ),
  },
  {
    key: 'amount',
    title: 'Amount Delta',
    width: 140,
    align: 'right',
    render: (adjustment) => (
      <Text style={styles.tableText}>{formatCurrency(adjustment.amount_delta)}</Text>
    ),
  },
  {
    key: 'restock',
    title: 'Stock',
    width: 120,
    render: (adjustment) => (
      <Badge
        status={adjustment.restock ? 'active' : 'inactive'}
        label={adjustment.restock ? 'Returned' : 'Removed'}
      />
    ),
  },
];

export default function SaleAdjustmentScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ saleId?: string }>();
  const currentUser = useAppStore((state) => state.currentUser);
  const saleId = Number(params.saleId);
  const [sale, setSale] = useState<SaleRecord | null>(null);
  const [items, setItems] = useState<SaleItemRecord[]>([]);
  const [adjustments, setAdjustments] = useState<SaleAdjustment[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const selectItem = useCallback((item: SaleItemRecord) => {
    setSelectedItemId(item.id);
    setNewQuantity(String(item.quantity));
    setNewUnitPrice(String(item.unit_price));
    setReason('');
    setRestock(true);
    setMessage(null);
  }, []);

  const itemColumns = useMemo<TableColumn<SaleItemRecord>[]>(
    () => [
      { key: 'product', title: 'Product', accessor: 'product_name', width: 190 },
      { key: 'sku', title: 'SKU', accessor: 'sku', width: 110 },
      { key: 'qty', title: 'Qty', accessor: 'quantity', width: 80, align: 'right' },
      {
        key: 'price',
        title: 'Unit Price',
        width: 120,
        align: 'right',
        render: (item) => <Text style={styles.tableText}>{formatCurrency(item.unit_price)}</Text>,
      },
      {
        key: 'line',
        title: 'Line Total',
        width: 130,
        align: 'right',
        render: (item) => <Text style={styles.tableText}>{formatCurrency(item.line_total)}</Text>,
      },
      {
        key: 'action',
        title: '',
        width: 110,
        render: (item) => (
          <Button title="Adjust" size="sm" variant="outline" onPress={() => selectItem(item)} />
        ),
      },
    ],
    [selectItem]
  );

  const refresh = useCallback(async () => {
    if (!Number.isFinite(saleId)) {
      return;
    }

    const [nextSale, nextItems, nextAdjustments] = await Promise.all([
      getSaleById(db, saleId),
      getSaleItems(db, saleId),
      getSaleAdjustments(db, saleId),
    ]);
    setSale(nextSale);
    setItems(nextItems);
    setAdjustments(nextAdjustments);
  }, [db, saleId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function saveAdjustment() {
    if (!currentUser || !selectedItem) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      await adjustSaleItem(db, {
        saleId,
        saleItemId: selectedItem.id,
        newQuantity: Number(newQuantity),
        newUnitPrice: Number(newUnitPrice),
        restock,
        reason,
        userId: currentUser.id,
      });
      setMessage('Sale item adjustment saved.');
      setSelectedItemId(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to adjust sale item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="Adjust Sold Transaction"
      subtitle={sale ? `Receipt ${sale.receipt_number}` : 'Update sold items'}
      actions={<Button title="Back" variant="secondary" icon="arrow-back" onPress={() => router.back()} />}>
      <RequireRole roles={['supervisor', 'admin']}>
        {sale ? (
          <View style={styles.metrics}>
            <Metric label="Receipt Total" value={formatCurrency(sale.total)} />
            <Metric label="Net Sales" value={formatCurrency(sale.net_sales)} />
            <Metric label="Completed" value={formatDateTime(sale.completed_at)} />
          </View>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Card padded={false}>
          <View style={styles.tableHeader}>
            <Text style={styles.sectionTitle}>Sold Items</Text>
            <Text style={styles.mutedText}>Set quantity to 0 to remove an item.</Text>
          </View>
          <Table
            columns={itemColumns}
            data={items}
            emptyLabel="No sale items found."
            keyExtractor={(item) => String(item.id)}
          />
        </Card>

        {selectedItem ? (
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Adjust {selectedItem.product_name}</Text>
            <View style={styles.formGrid}>
              <Input
                label="New Quantity"
                keyboardType="number-pad"
                value={newQuantity}
                onChangeText={setNewQuantity}
                containerStyle={styles.formInput}
              />
              <Input
                label="New Unit Price"
                keyboardType="decimal-pad"
                value={newUnitPrice}
                onChangeText={setNewUnitPrice}
                containerStyle={styles.formInput}
              />
            </View>
            <Input
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder="Damaged, expired, wrong item, customer return"
            />
            <View style={styles.pillRow}>
              <Pressable
                onPress={() => setRestock(true)}
                style={[styles.pill, restock && styles.pillActive]}>
                <Text style={[styles.pillText, restock && styles.pillTextActive]}>
                  Return removed qty to stock
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRestock(false)}
                style={[styles.pill, !restock && styles.pillActive]}>
                <Text style={[styles.pillText, !restock && styles.pillTextActive]}>
                  Remove without stock return
                </Text>
              </Pressable>
            </View>
            <Button
              title="Save Adjustment"
              icon="save-outline"
              loading={saving}
              onPress={saveAdjustment}
            />
          </Card>
        ) : null}

        <Card padded={false}>
          <View style={styles.tableHeader}>
            <Text style={styles.sectionTitle}>Adjustment Log</Text>
          </View>
          <Table
            columns={adjustmentColumns}
            data={adjustments}
            emptyLabel="No adjustments recorded for this sale."
            keyExtractor={(adjustment) => String(adjustment.id)}
          />
        </Card>
      </RequireRole>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metric: {
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
    fontSize: 18,
    fontWeight: '900',
  },
  tableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  mutedText: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tableText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  formCard: {
    gap: spacing.md,
    maxWidth: 760,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  formInput: {
    flexBasis: 220,
    flexGrow: 1,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  pillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  pillText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  pillTextActive: {
    color: palette.surface,
  },
  message: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
});
