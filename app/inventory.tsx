import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ScreenState } from '@/components/ui/ScreenState';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, spacing } from '@/constants/theme';
import { getProducts } from '@/lib/database/queries';
import { getStockStatus } from '@/lib/database/stock';
import type { ProductListItem } from '@/lib/database/types';
import { useAppStore } from '@/lib/store/app-store';

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'critical' | 'expiring'>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canManage = currentUser?.role === 'supervisor' || currentUser?.role === 'admin';

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      setProducts(await getProducts(db));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load products.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [loadProducts])
  );

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products.filter((product) => {
      const status = getStockStatus(product);
      const matchesSearch =
        term.length === 0 ||
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        product.barcode?.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'low' && status === 'lowStock') ||
        (statusFilter === 'critical' && status === 'critical') ||
        (statusFilter === 'expiring' && status === 'expiringSoon');

      return matchesSearch && matchesStatus;
    });
  }, [products, search, statusFilter]);

  const columns: TableColumn<ProductListItem>[] = [
    {
      key: 'name',
      title: 'Product',
      width: 210,
      render: (product) => (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/product-details', params: { productId: String(product.id) } } as never)
          }>
          <Text style={styles.productLink}>{product.name}</Text>
        </Pressable>
      ),
    },
    { key: 'sku', title: 'SKU', accessor: 'sku', width: 110 },
    { key: 'category', title: 'Category', accessor: 'category_name', width: 140 },
    { key: 'stock', title: 'Stock', accessor: 'current_stock', align: 'right', width: 90 },
    { key: 'expiry', title: 'Expiry Date', accessor: 'nearest_expiry', width: 120 },
    {
      key: 'status',
      title: 'Status',
      width: 130,
      render: (product) => <Badge status={getStockStatus(product)} />,
    },
    {
      key: 'action',
      title: 'Action',
      align: 'center',
      width: 110,
      render: (product) => (
        <View style={styles.rowActions}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/product-details',
                params: { productId: String(product.id) },
              } as never)
            }
            style={styles.iconButton}>
            <Ionicons name="eye-outline" size={18} color={palette.inkMuted} />
          </Pressable>
          {canManage ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/product-form',
                  params: { productId: String(product.id) },
                } as never)
              }
              style={styles.iconButton}>
              <Ionicons name="create-outline" size={18} color={palette.primaryDark} />
            </Pressable>
          ) : null}
        </View>
      ),
    },
  ];

  return (
    <AppShell
      title="Inventory List"
      subtitle="Products, stock status, batches, and expiry monitoring"
      actions={
        <>
          <Button
            title="Stock In"
            variant="secondary"
            icon="clipboard-outline"
            onPress={() => router.push('/stock-in' as never)}
          />
          {canManage ? (
            <Button
              title="Add Product"
              icon="add"
              onPress={() => router.push('/product-form' as never)}
            />
          ) : null}
        </>
      }>
      <Card padded={false}>
        <View style={styles.toolbar}>
          <Input
            icon="search-outline"
            onChangeText={setSearch}
            placeholder="Search product, SKU or barcode..."
            value={search}
            containerStyle={styles.search}
          />
          <View style={styles.filterRow}>
            {[
              ['all', 'All'],
              ['low', 'Low'],
              ['critical', 'Critical'],
              ['expiring', 'Expiring'],
            ].map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setStatusFilter(key as typeof statusFilter)}
                style={[styles.filterPill, statusFilter === key && styles.filterPillActive]}>
                <Text
                  style={[
                    styles.filterText,
                    statusFilter === key && styles.filterTextActive,
                  ]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {loading ? (
          <ScreenState loading title="Loading inventory" description="Reading products from local SQLite." />
        ) : loadError ? (
          <ScreenState
            icon="warning-outline"
            title="Inventory could not be loaded"
            description={loadError}
          />
        ) : (
          <Table
            columns={columns}
            data={filteredProducts}
            emptyLabel="No products match the current filter."
            keyExtractor={(product) => String(product.id)}
          />
        )}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Showing {filteredProducts.length} of {products.length} items
          </Text>
        </View>
      </Card>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    padding: spacing.md,
  },
  search: {
    flexBasis: 360,
    flexGrow: 1,
    maxWidth: 460,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filterPill: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  filterText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  filterTextActive: {
    color: palette.surface,
  },
  productLink: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  rowActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  iconButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  footerText: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
