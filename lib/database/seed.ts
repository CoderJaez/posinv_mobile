import type { SQLiteDatabase } from 'expo-sqlite';

import { seedPinHashes } from './schema';
import type { DatabaseCount } from './types';

const categories = [
  [1, 'Beverages', 1],
  [2, 'Snacks', 2],
  [3, 'Frozen', 3],
  [4, 'Toiletries', 4],
  [5, 'Household', 5],
  [6, 'Prepaid / Load', 6],
] as const;

const users = [
  ['Juan Dela Cruz', 'juan', seedPinHashes['1234'], 'cashier', '#0EA5E9', '2026-05-06 10:42:00'],
  ['Maria Santos', 'maria', seedPinHashes['2468'], 'cashier', '#F97316', '2026-05-06 10:30:00'],
  ['Ana Reyes', 'ana', seedPinHashes['1357'], 'supervisor', '#8B5CF6', '2026-05-05 09:15:00'],
  ['Admin User', 'admin', seedPinHashes['0000'], 'admin', '#009B55', '2026-05-04 08:00:00'],
] as const;

const products = [
  ['Coke 500ml', 'CKE500', '4800012345011', 1, 'bottle', 25, null, 18, 120, 30, '#FEE2E2'],
  ['Sprite 500ml', 'SPR500', '4800012345012', 1, 'bottle', 25, null, 18, 80, 25, '#DCFCE7'],
  ['Absolute Water 500ml', 'ABS500', '4800012345013', 1, 'bottle', 20, null, 10, 200, 40, '#DBEAFE'],
  ['Royal 500ml', 'RYL500', '4800012345014', 1, 'bottle', 25, null, 18, 90, 25, '#FED7AA'],
  ['Nissin Cup Noodles', 'NDL001', '4800012345015', 2, 'cup', 18, null, 13, 5, 12, '#FDE68A'],
  ['Bear Brand Milk 200ml', 'BBMLK', '4800012345016', 1, 'pack', 30, null, 22, 12, 18, '#E0F2FE'],
  ['Chuckie 110ml', 'CHK110', '4800012345017', 1, 'pack', 15, null, 10, 48, 20, '#F5E8D8'],
  ['Oishi Prawn Crackers', 'OISPRN', '4800012345018', 2, 'pack', 20, null, 14, 60, 20, '#FCE7F3'],
  ['Piattos Cheese', 'PIACHE', '4800012345019', 2, 'pack', 18, null, 13, 44, 20, '#DBEAFE'],
  ['Selecta Cornetto', 'CORNET', '4800012345020', 3, 'piece', 35, null, 24, 20, 10, '#E0F2FE'],
  ['Surf 70g', 'SURF070', '4800012345021', 5, 'sachet', 10, null, 7, 50, 20, '#FCE7F3'],
  ['Tide 70g', 'TIDE070', '4800012345022', 5, 'sachet', 15, null, 10, 40, 18, '#FED7AA'],
  ['Colgate Toothpaste', 'COLGTP', '4800012345023', 4, 'tube', 45, null, 32, 18, 12, '#BFDBFE'],
  ['Pampers Diaper', 'PAMPDI', '4800012345024', 4, 'pack', 55, null, 39, 10, 8, '#BBF7D0'],
] as const;

const inventoryBatches = [
  [1, 'B240501', '2026-12-31', 60, 18],
  [1, 'B240430', '2026-11-30', 60, 18],
  [2, 'B240506', '2026-12-31', 80, 18],
  [3, 'B240506', '2027-05-31', 200, 10],
  [4, 'B240506', '2026-12-31', 90, 18],
  [5, 'N240430', '2026-10-31', 5, 13],
  [6, 'M240503', '2026-07-15', 12, 22],
  [10, 'F240501', '2026-05-30', 20, 24],
] as const;

const suppliers = [
  ['Coca-Cola Distributor', 'Grace Lim', '0917-555-0101', 'orders@coke.local', 'Manila'],
  ['Universal Robina Supplier', 'Mark Reyes', '0917-555-0102', 'sales@urc.local', 'Quezon City'],
  ['Grocery Wholesale PH', 'Liza Tan', '0917-555-0103', 'support@wholesale.local', 'Makati'],
] as const;

const settings = [
  ['store_name', 'StoreMate Convenience Store'],
  ['currency', 'PHP'],
  ['receipt_footer', 'Thank you for shopping with us.'],
  ['seed_version', '1'],
] as const;

export async function seedDatabase(db: SQLiteDatabase) {
  const productCount = await db.getFirstAsync<DatabaseCount>('SELECT COUNT(*) as count FROM products');

  if ((productCount?.count ?? 0) > 0) {
    return;
  }

  await db.withTransactionAsync(async () => {
    for (const [id, name, sortOrder] of categories) {
      await db.runAsync(
        'INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES (?, ?, ?)',
        id,
        name,
        sortOrder
      );
    }

    for (const [fullName, username, pinHash, role, avatarColor, lastLoginAt] of users) {
      await db.runAsync(
        `INSERT OR IGNORE INTO users
          (full_name, username, pin_hash, role, avatar_color, last_login_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        fullName,
        username,
        pinHash,
        role,
        avatarColor,
        lastLoginAt
      );
    }

    for (const product of products) {
      await db.runAsync(
        `INSERT OR IGNORE INTO products
          (name, sku, barcode, category_id, unit, regular_price, promo_price, unit_cost, current_stock, reorder_level, image_color)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ...product
      );
    }

    for (const batch of inventoryBatches) {
      await db.runAsync(
        `INSERT OR IGNORE INTO inventory_batches
          (product_id, batch_number, expiry_date, quantity, unit_cost)
          VALUES (?, ?, ?, ?, ?)`,
        ...batch
      );
    }

    for (const supplier of suppliers) {
      await db.runAsync(
        `INSERT OR IGNORE INTO suppliers
          (name, contact_name, phone, email, address)
          VALUES (?, ?, ?, ?, ?)`,
        ...supplier
      );
    }

    for (const [key, value] of settings) {
      await db.runAsync(
        `INSERT OR REPLACE INTO app_settings (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)`,
        key,
        value
      );
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, metadata_json)
        VALUES (?, ?, ?, ?)`,
      4,
      'database_seeded',
      'system',
      JSON.stringify({ seedVersion: 1, products: products.length })
    );
  });
}
