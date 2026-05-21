import { create } from 'zustand';

import { calculateSaleTotals, type SaleTotals } from '@/lib/domain/sales';
import type { CartItemSnapshot, ProductListItem } from '@/lib/database/types';

type CartState = {
  items: CartItemSnapshot[];
  heldTransactionId: number | null;
  addProduct: (product: ProductListItem) => void;
  incrementItem: (productId: number) => void;
  decrementItem: (productId: number) => void;
  updateItemPrice: (productId: number, unitPrice: number, reason?: string | null) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
  replaceCart: (items: CartItemSnapshot[], heldTransactionId?: number | null) => void;
  getTotals: () => SaleTotals;
};

function toCartItem(product: ProductListItem): CartItemSnapshot {
  return {
    productId: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    quantity: 1,
    unitPrice: product.promo_price ?? product.regular_price,
    baseUnitPrice: product.promo_price ?? product.regular_price,
    priceOverrideReason: null,
    imageColor: product.image_color,
    imageUri: product.image_uri,
    currentStock: product.current_stock,
  };
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  heldTransactionId: null,
  addProduct: (product) =>
    set((state) => {
      const existing = state.items.find((item) => item.productId === product.id);

      if (existing) {
        return {
          items: state.items.map((item) =>
            item.productId === product.id
              ? {
                  ...item,
                  currentStock: product.current_stock,
                  quantity: Math.min(item.quantity + 1, product.current_stock),
                }
              : item
          ),
        };
      }

      if (product.current_stock <= 0) {
        return state;
      }

      return {
        items: [...state.items, toCartItem(product)],
      };
    }),
  incrementItem: (productId) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(item.quantity + 1, item.currentStock) }
          : item
      ),
    })),
  decrementItem: (productId) =>
    set((state) => ({
      items: state.items
        .map((item) =>
          item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0),
    })),
  updateItemPrice: (productId, unitPrice, reason = null) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.productId === productId
          ? {
              ...item,
              unitPrice,
              priceOverrideReason:
                unitPrice === item.baseUnitPrice ? null : reason?.trim() || 'Manual price override',
            }
          : item
      ),
    })),
  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((item) => item.productId !== productId),
    })),
  clearCart: () => set({ heldTransactionId: null, items: [] }),
  replaceCart: (items, heldTransactionId = null) =>
    set({
      heldTransactionId,
      items: items.map((item) => ({
        ...item,
        baseUnitPrice: item.baseUnitPrice ?? item.unitPrice,
        priceOverrideReason: item.priceOverrideReason ?? null,
        quantity: Math.max(1, item.quantity),
      })),
    }),
  getTotals: () => calculateSaleTotals(get().items),
}));

export function getCartTotals(items: CartItemSnapshot[]) {
  return calculateSaleTotals(items);
}
