import type { ProductListItem, StockStatus } from './types';

export function getStockStatus(product: ProductListItem, today = new Date()): StockStatus {
  if (product.nearest_expiry) {
    const expiry = new Date(`${product.nearest_expiry}T00:00:00`);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);

    if (daysUntilExpiry >= 0 && daysUntilExpiry <= 30) {
      return 'expiringSoon';
    }
  }

  if (product.current_stock <= Math.max(1, Math.floor(product.reorder_level / 2))) {
    return 'critical';
  }

  if (product.current_stock <= product.reorder_level) {
    return 'lowStock';
  }

  return 'inStock';
}
