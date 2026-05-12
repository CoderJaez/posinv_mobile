import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, spacing } from '@/constants/theme';
import {
  getProductBatches,
  getProductById,
  getProductStockMovements,
} from '@/lib/database/inventory';
import { getStockStatus } from '@/lib/database/stock';
import type { InventoryBatch, ProductDetails, StockMovement } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

const batchColumns: TableColumn<InventoryBatch>[] = [
  { key: 'batch', title: 'Batch No.', accessor: 'batch_number', width: 150 },
  { key: 'quantity', title: 'Quantity', accessor: 'quantity', width: 110, align: 'right' },
  { key: 'expiry', title: 'Expiry Date', accessor: 'expiry_date', width: 150 },
  {
    key: 'cost',
    title: 'Unit Cost',
    width: 120,
    align: 'right',
    render: (batch) => <Text style={styles.tableText}>{formatCurrency(batch.unit_cost)}</Text>,
  },
];

const movementColumns: TableColumn<StockMovement>[] = [
  { key: 'type', title: 'Type', accessor: 'movement_type', width: 120 },
  { key: 'qty', title: 'Qty', accessor: 'quantity', width: 90, align: 'right' },
  { key: 'reason', title: 'Reason', accessor: 'reason', width: 220 },
  {
    key: 'date',
    title: 'Date',
    width: 160,
    render: (movement) => <Text style={styles.tableText}>{formatDateTime(movement.created_at)}</Text>,
  },
];

export default function ProductDetailsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string }>();
  const currentUser = useAppStore((state) => state.currentUser);
  const canManage = currentUser?.role === 'supervisor' || currentUser?.role === 'admin';
  const productId = Number(params.productId);
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const loadProduct = useCallback(async () => {
    if (!Number.isFinite(productId)) {
      return;
    }

    const [nextProduct, nextBatches, nextMovements] = await Promise.all([
      getProductById(db, productId),
      getProductBatches(db, productId),
      getProductStockMovements(db, productId),
    ]);

    setProduct(nextProduct);
    setBatches(nextBatches);
    setMovements(nextMovements);
  }, [db, productId]);

  useFocusEffect(
    useCallback(() => {
      loadProduct();
    }, [loadProduct])
  );

  return (
    <AppShell
      title="Product Details"
      subtitle={product ? `${product.sku} · ${product.category_name}` : 'Loading product'}
      actions={
        <>
          <Button title="Back" variant="secondary" icon="arrow-back" onPress={() => router.back()} />
          {product && canManage ? (
            <>
              <Button
                title="Edit"
                variant="outline"
                icon="create-outline"
                onPress={() =>
                  router.push({
                    pathname: '/product-form',
                    params: { productId: String(product.id) },
                  } as never)
                }
              />
              <Button
                title="Adjust Stock"
                icon="swap-vertical-outline"
                onPress={() =>
                  router.push({
                    pathname: '/adjust-stock',
                    params: { productId: String(product.id) },
                  } as never)
                }
              />
            </>
          ) : null}
        </>
      }>
      {!product ? (
        <Card>
          <Text style={styles.mutedText}>Product not found.</Text>
        </Card>
      ) : (
        <>
          <View style={styles.topGrid}>
            <Card style={styles.productCard}>
              <View style={[styles.productArt, { backgroundColor: product.image_color }]}>
                <Ionicons name="cube-outline" size={58} color={palette.ink} />
              </View>
              <View style={styles.productCopy}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.mutedText}>Barcode: {product.barcode || '-'}</Text>
                <Text style={styles.mutedText}>Unit: {product.unit}</Text>
                <Badge status={getStockStatus(product)} />
              </View>
            </Card>

            <View style={styles.metrics}>
              <Metric label="Regular Price" value={formatCurrency(product.regular_price)} />
              <Metric
                label="Promo Price"
                value={product.promo_price == null ? '-' : formatCurrency(product.promo_price)}
              />
              <Metric label="Current Stock" value={String(product.current_stock)} />
              <Metric label="Reorder Level" value={String(product.reorder_level)} />
            </View>
          </View>

          <Card padded={false}>
            <View style={styles.tableHeader}>
              <Text style={styles.sectionTitle}>Batch / Expiry</Text>
            </View>
            <Table
              columns={batchColumns}
              data={batches}
              emptyLabel="No batch records for this product."
              keyExtractor={(batch) => String(batch.id)}
            />
          </Card>

          <Card padded={false}>
            <View style={styles.tableHeader}>
              <Text style={styles.sectionTitle}>Stock History</Text>
            </View>
            <Table
              columns={movementColumns}
              data={movements}
              emptyLabel="No stock movements recorded."
              keyExtractor={(movement) => String(movement.id)}
            />
          </Card>
        </>
      )}
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
  topGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  productCard: {
    alignItems: 'center',
    flexBasis: 340,
    flexDirection: 'row',
    flexGrow: 1,
    gap: spacing.md,
  },
  productArt: {
    alignItems: 'center',
    borderRadius: 8,
    height: 120,
    justifyContent: 'center',
    width: 120,
  },
  productCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  productName: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  mutedText: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  metrics: {
    flexBasis: 360,
    flexDirection: 'row',
    flexGrow: 1,
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metric: {
    flexBasis: 150,
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
    fontSize: 20,
    fontWeight: '900',
  },
  tableHeader: {
    padding: spacing.md,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  tableText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
});
