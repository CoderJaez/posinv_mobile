import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ProductImage } from '@/components/ui/ProductImage';
import { palette, radii, spacing } from '@/constants/theme';
import { formatRole } from '@/lib/auth/roles';
import { getCategories, getProducts } from '@/lib/database/queries';
import { holdTransaction } from '@/lib/database/sales';
import type { Category, ProductListItem } from '@/lib/database/types';
import { formatCurrency } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';
import { useCartStore } from '@/lib/store/cart-store';

export default function PosCheckoutScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const currentShift = useAppStore((state) => state.currentShift);
  const cartItems = useCartStore((state) => state.items);
  const addProduct = useCartStore((state) => state.addProduct);
  const incrementItem = useCartStore((state) => state.incrementItem);
  const decrementItem = useCartStore((state) => state.decrementItem);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const getTotals = useCartStore((state) => state.getTotals);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const { width } = useWindowDimensions();
  const compact = width < 980;
  const totals = getTotals();

  const loadCatalog = useCallback(async () => {
    const [nextProducts, nextCategories] = await Promise.all([getProducts(db), getCategories(db)]);
    setProducts(nextProducts);
    setCategories(nextCategories);
  }, [db]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useFocusEffect(
    useCallback(() => {
      loadCatalog();
    }, [loadCatalog])
  );

  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory = activeCategory === 'All' || product.category_name === activeCategory;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.sku.toLowerCase().includes(normalizedSearch) ||
        product.barcode?.toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, products, search]);

  async function holdCurrentTransaction() {
    if (!currentUser || !currentShift || cartItems.length === 0) {
      return;
    }

    setHolding(true);
    try {
      await holdTransaction(db, {
        cashierId: currentUser.id,
        shiftId: currentShift.id,
        items: cartItems,
      });
      clearCart();
      setNotice('Transaction held.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to hold transaction.');
    } finally {
      setHolding(false);
    }
  }

  function voidTransaction() {
    if (cartItems.length === 0) {
      return;
    }

    clearCart();
    setNotice('Current transaction voided.');
  }

  function goToPayment() {
    if (cartItems.length === 0) {
      setNotice('Add at least one item before payment.');
      return;
    }

    router.push('/payment' as never);
  }

  return (
    <AppShell
      title="POS - Checkout"
      subtitle="Offline register ready for tablet landscape"
      actions={
        <View style={styles.headerActions}>
          <View style={styles.timeBlock}>
            <Text style={styles.timeText}>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text style={styles.dateText}>
              {new Date().toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' })}
            </Text>
          </View>
          <View style={styles.userPill}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: currentUser?.avatar_color ?? palette.primary },
              ]}
            />
            <View>
              <Text style={styles.userName}>{currentUser?.full_name ?? 'No user'}</Text>
              <Text style={styles.userRole}>
                {currentUser ? formatRole(currentUser.role) : 'Login required'}
              </Text>
            </View>
          </View>
          <Button
            title={currentShift ? `Shift #${currentShift.id}` : 'No Shift'}
            variant="outline"
            size="sm"
            onPress={() => router.push('/shift-summary' as never)}
          />
        </View>
      }
      scroll={false}>
      <View style={[styles.posLayout, compact && styles.posLayoutCompact]}>
        <View style={styles.catalogPane}>
          <View style={styles.searchRow}>
            <Input
              icon="search-outline"
              onChangeText={setSearch}
              placeholder="Scan barcode or search product..."
              value={search}
              containerStyle={styles.searchInput}
            />
            <Button
              title="Held"
              variant="secondary"
              icon="archive-outline"
              onPress={() => router.push('/hold-transactions' as never)}
            />
          </View>

          <View style={styles.categoryRow}>
            {['All', ...categories.map((category) => category.name)].map((category) => (
              <Pressable
                key={category}
                onPress={() => setActiveCategory(category)}
                style={[
                  styles.categoryPill,
                  activeCategory === category && styles.categoryPillActive,
                ]}>
                <Text
                  style={[
                    styles.categoryText,
                    activeCategory === category && styles.categoryTextActive,
                  ]}>
                  {category}
                </Text>
              </Pressable>
            ))}
          </View>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <ScrollView contentContainerStyle={styles.productGrid}>
            {visibleProducts.map((product) => {
              const outOfStock = product.current_stock <= 0;

              return (
                <Pressable
                  disabled={outOfStock}
                  key={product.id}
                  onPress={() => {
                    addProduct(product);
                    setNotice(null);
                  }}
                  style={({ pressed }) => [
                    styles.productCard,
                    outOfStock && styles.productCardDisabled,
                    pressed && styles.productCardPressed,
                  ]}>
                  <ProductImage
                    imageColor={product.image_color}
                    imageUri={product.image_uri}
                    size={58}
                    style={styles.productArt}
                  />
                  <Text style={styles.productName} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <Text style={styles.productPrice}>{formatCurrency(product.regular_price)}</Text>
                  <Text style={styles.stockText}>Stock: {product.current_stock}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Card style={styles.orderPane} padded={false}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderTitle}>Current Order ({cartItems.length})</Text>
            <Pressable onPress={voidTransaction}>
              <Ionicons name="trash-outline" size={20} color={palette.surface} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.cartList}>
            {cartItems.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="basket-outline" size={30} color={palette.inkMuted} />
                <Text style={styles.emptyCartText}>Tap a product to start checkout.</Text>
              </View>
            ) : (
              cartItems.map((item) => (
                <View key={item.productId} style={styles.cartItem}>
                  <ProductImage
                    imageColor={item.imageColor}
                    imageUri={item.imageUri}
                    size={38}
                    style={styles.cartArt}
                  />
                  <View style={styles.cartCopy}>
                    <Text style={styles.cartName}>{item.name}</Text>
                    <Text style={styles.cartMeta}>
                      {item.quantity} x {formatCurrency(item.unitPrice)}
                    </Text>
                    <View style={styles.quantityControls}>
                      <Pressable
                        onPress={() => decrementItem(item.productId)}
                        style={styles.quantityButton}>
                        <Ionicons name="remove" size={16} color={palette.ink} />
                      </Pressable>
                      <Text style={styles.quantityText}>{item.quantity}</Text>
                      <Pressable
                        onPress={() => incrementItem(item.productId)}
                        style={styles.quantityButton}>
                        <Ionicons name="add" size={16} color={palette.ink} />
                      </Pressable>
                      <Pressable
                        onPress={() => removeItem(item.productId)}
                        style={styles.removeButton}>
                        <Ionicons name="close" size={15} color={palette.danger} />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.cartPrice}>
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(totals.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={styles.totalValue}>{formatCurrency(totals.discountTotal)}</Text>
            </View>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>TOTAL</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(totals.total)}</Text>
            </View>
          </View>

          <View style={styles.orderActions}>
            <Button
              title="Hold"
              variant="outline"
              icon="archive-outline"
              style={styles.actionButton}
              loading={holding}
              onPress={holdCurrentTransaction}
            />
            <Button
              title="Void"
              variant="outline"
              icon="close-circle-outline"
              style={styles.actionButton}
              onPress={voidTransaction}
            />
          </View>
          <View style={styles.payWrap}>
            <Button title="Pay" icon="card-outline" fullWidth size="lg" onPress={goToPayment} />
          </View>
        </Card>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeBlock: {
    alignItems: 'flex-end',
  },
  timeText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  dateText: {
    color: palette.inkMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  userPill: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  avatar: {
    backgroundColor: palette.primary,
    borderRadius: radii.pill,
    height: 30,
    width: 30,
  },
  userName: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  userRole: {
    color: palette.inkMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  posLayout: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 0,
  },
  posLayoutCompact: {
    flexDirection: 'column',
  },
  catalogPane: {
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryPill: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  categoryPillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  categoryText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  categoryTextActive: {
    color: palette.surface,
  },
  notice: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  productCard: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 152,
    padding: spacing.sm,
    width: 122,
  },
  productCardDisabled: {
    opacity: 0.45,
  },
  productCardPressed: {
    borderColor: palette.primary,
    transform: [{ scale: 0.98 }],
  },
  productArt: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: 58,
    justifyContent: 'center',
    width: '100%',
  },
  productName: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '800',
    minHeight: 32,
    textAlign: 'center',
  },
  productPrice: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  stockText: {
    color: palette.inkMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  orderPane: {
    alignSelf: 'stretch',
    maxWidth: 360,
    minWidth: 330,
    overflow: 'hidden',
    width: '32%',
  },
  orderHeader: {
    alignItems: 'center',
    backgroundColor: palette.primary,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  orderTitle: {
    color: palette.surface,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  cartList: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  emptyCart: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 170,
  },
  emptyCartText: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  cartItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cartArt: {
    backgroundColor: palette.muted,
    borderRadius: radii.sm,
    height: 38,
    width: 38,
  },
  cartCopy: {
    flex: 1,
    minWidth: 0,
  },
  cartName: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  cartMeta: {
    color: palette.inkMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  cartPrice: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  quantityControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  quantityButton: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  quantityText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
    minWidth: 18,
    textAlign: 'center',
  },
  removeButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  totals: {
    borderTopColor: palette.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  totalValue: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  grandTotalLabel: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  grandTotalValue: {
    color: palette.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  orderActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  payWrap: {
    padding: spacing.md,
  },
});
