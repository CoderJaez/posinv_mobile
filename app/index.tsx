import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
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
import { Modal } from '@/components/ui/Modal';
import { ProductImage } from '@/components/ui/ProductImage';
import { palette, radii, spacing } from '@/constants/theme';
import { formatRole } from '@/lib/auth/roles';
import { getCategories, getProducts } from '@/lib/database/queries';
import { getPromotions } from '@/lib/database/promotions';
import { holdTransaction } from '@/lib/database/sales';
import type { CartItemSnapshot, Category, ProductListItem, PromotionListItem } from '@/lib/database/types';
import { calculatePromotionDiscounts } from '@/lib/domain/promotions';
import { formatCurrency } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';
import { getCartTotals, useCartStore } from '@/lib/store/cart-store';

export default function PosCheckoutScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const currentShift = useAppStore((state) => state.currentShift);
  const addProduct = useCartStore((state) => state.addProduct);
  const updateItemPrice = useCartStore((state) => state.updateItemPrice);
  const clearCart = useCartStore((state) => state.clearCart);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [promotions, setPromotions] = useState<PromotionListItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [holding, setHolding] = useState(false);
  const [priceItem, setPriceItem] = useState<CartItemSnapshot | null>(null);
  const [priceValue, setPriceValue] = useState('');
  const [priceReason, setPriceReason] = useState('');
  const { width } = useWindowDimensions();
  const compact = width < 980;

  const loadCatalog = useCallback(async () => {
    const [nextProducts, nextCategories, nextPromotions] = await Promise.all([
      getProducts(db),
      getCategories(db),
      getPromotions(db),
    ]);
    setProducts(nextProducts);
    setCategories(nextCategories);
    setPromotions(nextPromotions);
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

  const addProductToCart = useCallback(
    (product: ProductListItem) => {
      addProduct(product);
      setNotice((currentNotice) => (currentNotice ? null : currentNotice));
    },
    [addProduct]
  );

  const openHeldTransactions = useCallback(() => {
    router.push('/hold-transactions' as never);
  }, [router]);

  const holdCurrentTransaction = useCallback(async () => {
    const items = useCartStore.getState().items;

    if (!currentUser || !currentShift || items.length === 0) {
      return;
    }

    setHolding(true);
    try {
      await holdTransaction(db, {
        cashierId: currentUser.id,
        shiftId: currentShift.id,
        items,
      });
      clearCart();
      setNotice('Transaction held.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to hold transaction.');
    } finally {
      setHolding(false);
    }
  }, [clearCart, currentShift, currentUser, db]);

  const voidTransaction = useCallback(() => {
    if (useCartStore.getState().items.length === 0) {
      return;
    }

    clearCart();
    setNotice('Current transaction voided.');
  }, [clearCart]);

  const goToPayment = useCallback(() => {
    if (useCartStore.getState().items.length === 0) {
      setNotice('Add at least one item before payment.');
      return;
    }

    router.push('/payment' as never);
  }, [router]);

  const openPriceEditor = useCallback((item: CartItemSnapshot) => {
    setPriceItem(item);
    setPriceValue(String(item.unitPrice));
    setPriceReason(item.priceOverrideReason ?? 'Manual price adjustment');
  }, []);

  const closePriceEditor = useCallback(() => {
    setPriceItem(null);
  }, []);

  const savePriceOverride = useCallback(() => {
    if (!priceItem) {
      return;
    }

    const nextPrice = Number(priceValue);

    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      setNotice('Adjusted price must be greater than zero.');
      return;
    }

    updateItemPrice(priceItem.productId, nextPrice, priceReason);
    setPriceItem(null);
    setNotice(`${priceItem.name} price updated.`);
  }, [priceItem, priceReason, priceValue, updateItemPrice]);

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
      <CartPromotionUpdater promotions={promotions} />

      <View style={[styles.posLayout, compact && styles.posLayoutCompact]}>
        <ProductCatalog
          activeCategory={activeCategory}
          categories={categories}
          notice={notice}
          onAddProduct={addProductToCart}
          onCategoryChange={setActiveCategory}
          onOpenHeldTransactions={openHeldTransactions}
          onSearchChange={setSearch}
          search={search}
          visibleProducts={visibleProducts}
        />

        <OrderPanel
          holding={holding}
          onGoToPayment={goToPayment}
          onHoldTransaction={holdCurrentTransaction}
          onOpenPriceEditor={openPriceEditor}
          onVoidTransaction={voidTransaction}
        />
      </View>

      <Modal
        visible={priceItem != null}
        title="Adjust Item Price"
        onClose={closePriceEditor}
        footer={
          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={closePriceEditor}
              style={styles.modalButton}
            />
            <Button
              title="Save Price"
              icon="save-outline"
              onPress={savePriceOverride}
              style={styles.modalButton}
            />
          </View>
        }>
        <View style={styles.priceEditor}>
          <Text style={styles.editorTitle}>{priceItem?.name}</Text>
          <Text style={styles.editorMeta}>
            Base price: {priceItem ? formatCurrency(priceItem.baseUnitPrice) : '-'} per item
          </Text>
          <Input
            label="Adjusted Unit Price"
            keyboardType="decimal-pad"
            value={priceValue}
            onChangeText={setPriceValue}
          />
          <Input
            label="Reason"
            value={priceReason}
            onChangeText={setPriceReason}
            placeholder="Manual price adjustment, weighed item, etc."
          />
        </View>
      </Modal>
    </AppShell>
  );
}

type ProductCatalogProps = {
  activeCategory: string;
  categories: Category[];
  notice: string | null;
  onAddProduct: (product: ProductListItem) => void;
  onCategoryChange: (category: string) => void;
  onOpenHeldTransactions: () => void;
  onSearchChange: (value: string) => void;
  search: string;
  visibleProducts: ProductListItem[];
};

const ProductCatalog = memo(function ProductCatalog({
  activeCategory,
  categories,
  notice,
  onAddProduct,
  onCategoryChange,
  onOpenHeldTransactions,
  onSearchChange,
  search,
  visibleProducts,
}: ProductCatalogProps) {
  const categoryOptions = useMemo(
    () => ['All', ...categories.map((category) => category.name)],
    [categories]
  );

  return (
    <View style={styles.catalogPane}>
      <View style={styles.searchRow}>
        <Input
          icon="search-outline"
          onChangeText={onSearchChange}
          placeholder="Scan barcode or search product..."
          value={search}
          containerStyle={styles.searchInput}
        />
        <Button
          title="Held"
          variant="secondary"
          icon="archive-outline"
          onPress={onOpenHeldTransactions}
        />
      </View>

      <View style={styles.categoryRow}>
        {categoryOptions.map((category) => (
          <CategoryPill
            active={activeCategory === category}
            category={category}
            key={category}
            onPress={onCategoryChange}
          />
        ))}
      </View>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <ScrollView contentContainerStyle={styles.productGrid}>
        {visibleProducts.map((product) => (
          <ProductCard key={product.id} onAddProduct={onAddProduct} product={product} />
        ))}
      </ScrollView>
    </View>
  );
});

type CategoryPillProps = {
  active: boolean;
  category: string;
  onPress: (category: string) => void;
};

const CategoryPill = memo(function CategoryPill({ active, category, onPress }: CategoryPillProps) {
  const handlePress = useCallback(() => {
    onPress(category);
  }, [category, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.categoryPill, active && styles.categoryPillActive]}>
      <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{category}</Text>
    </Pressable>
  );
});

type ProductCardProps = {
  onAddProduct: (product: ProductListItem) => void;
  product: ProductListItem;
};

const ProductCard = memo(function ProductCard({ onAddProduct, product }: ProductCardProps) {
  const outOfStock = product.current_stock <= 0;
  const handlePress = useCallback(() => {
    onAddProduct(product);
  }, [onAddProduct, product]);

  return (
    <Pressable
      disabled={outOfStock}
      onPress={handlePress}
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
});

type OrderPanelProps = {
  holding: boolean;
  onGoToPayment: () => void;
  onHoldTransaction: () => void;
  onOpenPriceEditor: (item: CartItemSnapshot) => void;
  onVoidTransaction: () => void;
};

const OrderPanel = memo(function OrderPanel({
  holding,
  onGoToPayment,
  onHoldTransaction,
  onOpenPriceEditor,
  onVoidTransaction,
}: OrderPanelProps) {
  const cartItems = useCartStore((state) => state.items);
  const incrementItem = useCartStore((state) => state.incrementItem);
  const decrementItem = useCartStore((state) => state.decrementItem);
  const removeItem = useCartStore((state) => state.removeItem);
  const totals = useMemo(() => getCartTotals(cartItems), [cartItems]);

  return (
    <Card style={styles.orderPane} padded={false}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderTitle}>Current Order ({cartItems.length})</Text>
        <Pressable onPress={onVoidTransaction}>
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
            <CartItemRow
              item={item}
              key={item.productId}
              onDecrement={decrementItem}
              onIncrement={incrementItem}
              onOpenPriceEditor={onOpenPriceEditor}
              onRemove={removeItem}
            />
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
          onPress={onHoldTransaction}
        />
        <Button
          title="Void"
          variant="outline"
          icon="close-circle-outline"
          style={styles.actionButton}
          onPress={onVoidTransaction}
        />
      </View>
      <View style={styles.payWrap}>
        <Button title="Pay" icon="card-outline" fullWidth size="lg" onPress={onGoToPayment} />
      </View>
    </Card>
  );
});

type CartItemRowProps = {
  item: CartItemSnapshot;
  onDecrement: (productId: number) => void;
  onIncrement: (productId: number) => void;
  onOpenPriceEditor: (item: CartItemSnapshot) => void;
  onRemove: (productId: number) => void;
};

const CartItemRow = memo(function CartItemRow({
  item,
  onDecrement,
  onIncrement,
  onOpenPriceEditor,
  onRemove,
}: CartItemRowProps) {
  const decrement = useCallback(() => {
    onDecrement(item.productId);
  }, [item.productId, onDecrement]);
  const increment = useCallback(() => {
    onIncrement(item.productId);
  }, [item.productId, onIncrement]);
  const remove = useCallback(() => {
    onRemove(item.productId);
  }, [item.productId, onRemove]);
  const openPriceEditor = useCallback(() => {
    onOpenPriceEditor(item);
  }, [item, onOpenPriceEditor]);

  return (
    <View style={styles.cartItem}>
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
        {item.priceOverrideReason ? (
          <Text style={styles.overrideText}>Adjusted from {formatCurrency(item.baseUnitPrice)}</Text>
        ) : null}
        {item.appliedPromotionName && item.discountAmount > 0 ? (
          <Text style={styles.promoText}>
            {item.appliedPromotionName}: -{formatCurrency(item.discountAmount)}
          </Text>
        ) : null}
        <View style={styles.quantityControls}>
          <Pressable onPress={decrement} style={styles.quantityButton}>
            <Ionicons name="remove" size={16} color={palette.ink} />
          </Pressable>
          <Text style={styles.quantityText}>{item.quantity}</Text>
          <Pressable onPress={increment} style={styles.quantityButton}>
            <Ionicons name="add" size={16} color={palette.ink} />
          </Pressable>
          <Pressable onPress={openPriceEditor} style={styles.priceButton}>
            <Ionicons name="pricetag-outline" size={15} color={palette.primaryDark} />
          </Pressable>
          <Pressable onPress={remove} style={styles.removeButton}>
            <Ionicons name="close" size={15} color={palette.danger} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.cartPrice}>{formatCurrency(item.quantity * item.unitPrice)}</Text>
    </View>
  );
});

function CartPromotionUpdater({ promotions }: { promotions: PromotionListItem[] }) {
  const cartItems = useCartStore((state) => state.items);
  const updatePromotionDiscounts = useCartStore((state) => state.updatePromotionDiscounts);
  const promotionDiscounts = useMemo(
    () => calculatePromotionDiscounts(cartItems, promotions),
    [cartItems, promotions]
  );

  useEffect(() => {
    updatePromotionDiscounts(promotionDiscounts);
  }, [promotionDiscounts, updatePromotionDiscounts]);

  return null;
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
  overrideText: {
    color: palette.warning,
    fontSize: 10,
    fontWeight: '900',
  },
  promoText: {
    color: palette.primaryDark,
    fontSize: 10,
    fontWeight: '900',
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
  priceButton: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
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
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  modalButton: {
    minWidth: 140,
  },
  priceEditor: {
    gap: spacing.md,
  },
  editorTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  editorMeta: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
