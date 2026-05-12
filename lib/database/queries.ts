import type { SQLiteDatabase } from 'expo-sqlite';

import type { Category, ProductListItem, UserListItem } from './types';

export async function getCategories(db: SQLiteDatabase) {
  return db.getAllAsync<Category>(
    `SELECT id, name, sort_order, is_active
     FROM categories
     WHERE is_active = 1
     ORDER BY sort_order ASC, name ASC`
  );
}

export async function getProducts(db: SQLiteDatabase) {
  return db.getAllAsync<ProductListItem>(
    `SELECT
       products.id,
       products.name,
       products.sku,
       products.barcode,
       categories.name as category_name,
       products.unit,
       products.regular_price,
       products.promo_price,
       products.current_stock,
       products.reorder_level,
       products.image_color,
       products.image_uri,
       MIN(inventory_batches.expiry_date) as nearest_expiry
     FROM products
     INNER JOIN categories ON categories.id = products.category_id
     LEFT JOIN inventory_batches ON inventory_batches.product_id = products.id
       AND inventory_batches.quantity > 0
       AND inventory_batches.expiry_date IS NOT NULL
     WHERE products.is_active = 1
     GROUP BY products.id
     ORDER BY categories.sort_order ASC, products.name ASC`
  );
}

export async function getUsers(db: SQLiteDatabase) {
  return db.getAllAsync<UserListItem>(
    `SELECT id, full_name, username, role, status, last_login_at, avatar_color
     FROM users
     ORDER BY
       CASE role
         WHEN 'admin' THEN 1
         WHEN 'supervisor' THEN 2
         ELSE 3
       END,
       full_name ASC`
  );
}

export async function getDatabaseSummary(db: SQLiteDatabase) {
  const [productCount, userCount, supplierCount, categoryCount] = await Promise.all([
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM products'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM suppliers'),
    db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories'),
  ]);

  return {
    products: productCount?.count ?? 0,
    users: userCount?.count ?? 0,
    suppliers: supplierCount?.count ?? 0,
    categories: categoryCount?.count ?? 0,
  };
}
