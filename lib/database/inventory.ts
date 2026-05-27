import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  Category,
  CategoryManagementItem,
  DeliveryListItem,
  InventoryBatch,
  ProductDetails,
  ProductListItem,
  StockMovement,
  Supplier,
} from './types';

export type ProductFormInput = {
  name: string;
  sku: string;
  barcode?: string | null;
  categoryId: number;
  unit: string;
  regularPrice: number;
  promoPrice?: number | null;
  unitCost: number;
  currentStock: number;
  reorderLevel: number;
  imageColor?: string;
  imageUri?: string | null;
};

export type StockAdjustmentInput = {
  productId: number;
  userId: number;
  shiftId?: number | null;
  quantityDelta: number;
  reason: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  unitCost?: number | null;
};

export type SupplierInput = {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export type CategoryInput = {
  name: string;
  sortOrder: number;
};

export type DeliveryItemInput = {
  productId: number;
  batchNumber: string;
  expiryDate?: string | null;
  quantity: number;
  unitCost: number;
};

export type DeliveryInput = {
  supplierId: number;
  invoiceNumber: string;
  deliveryDate: string;
  createdBy: number;
  shiftId?: number | null;
  items: DeliveryItemInput[];
};

export async function getProductById(db: SQLiteDatabase, productId: number) {
  return db.getFirstAsync<ProductDetails>(
    `SELECT
       products.id,
       products.name,
       products.sku,
       products.barcode,
       products.category_id,
       categories.name as category_name,
       products.unit,
       products.regular_price,
       products.promo_price,
       products.unit_cost,
       products.current_stock,
       products.reorder_level,
       products.image_color,
       products.image_uri,
       products.is_active,
       products.created_at,
       products.updated_at,
       MIN(inventory_batches.expiry_date) as nearest_expiry
     FROM products
     INNER JOIN categories ON categories.id = products.category_id
     LEFT JOIN inventory_batches ON inventory_batches.product_id = products.id
       AND inventory_batches.quantity > 0
       AND inventory_batches.expiry_date IS NOT NULL
     WHERE products.id = ?
     GROUP BY products.id`,
    productId
  );
}

export async function getProductBatches(db: SQLiteDatabase, productId: number) {
  return db.getAllAsync<InventoryBatch>(
    `SELECT id, product_id, batch_number, expiry_date, quantity, unit_cost, created_at
     FROM inventory_batches
     WHERE product_id = ?
     ORDER BY
       CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
       expiry_date ASC,
       id ASC`,
    productId
  );
}

export async function getProductStockMovements(db: SQLiteDatabase, productId: number) {
  return db.getAllAsync<StockMovement>(
    `SELECT stock_movements.*, products.name as product_name
     FROM stock_movements
     INNER JOIN products ON products.id = stock_movements.product_id
     WHERE product_id = ?
     ORDER BY stock_movements.created_at DESC
     LIMIT 30`,
    productId
  );
}

export async function getSuppliers(db: SQLiteDatabase, search = '') {
  const term = `%${search.trim()}%`;

  return db.getAllAsync<Supplier>(
    `SELECT id, name, contact_name, phone, email, address, is_active, created_at
     FROM suppliers
     WHERE is_active = 1
       AND (
         ? = '%%'
         OR name LIKE ?
         OR contact_name LIKE ?
         OR phone LIKE ?
         OR email LIKE ?
         OR address LIKE ?
       )
     ORDER BY name ASC`
    ,
    term,
    term,
    term,
    term,
    term,
    term
  );
}

export async function getCategoryManagementItems(db: SQLiteDatabase, search = '') {
  const term = `%${search.trim()}%`;

  return db.getAllAsync<CategoryManagementItem>(
    `SELECT
       categories.id,
       categories.name,
       categories.sort_order,
       categories.is_active,
       COUNT(products.id) as product_count
     FROM categories
     LEFT JOIN products ON products.category_id = categories.id
     WHERE categories.is_active = 1
       AND (? = '%%' OR categories.name LIKE ?)
     GROUP BY categories.id
     ORDER BY categories.sort_order ASC, categories.name ASC`,
    term,
    term
  );
}

export async function getProductManagementItems(db: SQLiteDatabase, search = '') {
  const term = `%${search.trim()}%`;

  return db.getAllAsync<ProductListItem>(
    `SELECT
       products.id,
       products.name,
       products.sku,
       products.barcode,
       products.category_id,
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
       AND (
         ? = '%%'
         OR products.name LIKE ?
         OR products.sku LIKE ?
         OR products.barcode LIKE ?
         OR categories.name LIKE ?
       )
     GROUP BY products.id
     ORDER BY categories.sort_order ASC, products.name ASC`,
    term,
    term,
    term,
    term,
    term
  );
}

export async function getRecentDeliveries(db: SQLiteDatabase, limit = 20) {
  return db.getAllAsync<DeliveryListItem>(
    `SELECT deliveries.*, suppliers.name as supplier_name
     FROM deliveries
     INNER JOIN suppliers ON suppliers.id = deliveries.supplier_id
     ORDER BY deliveries.created_at DESC
     LIMIT ?`,
    limit
  );
}

export async function createProduct(db: SQLiteDatabase, input: ProductFormInput, userId: number) {
  let productId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO products
        (name, sku, barcode, category_id, unit, regular_price, promo_price, unit_cost, current_stock, reorder_level, image_color, image_uri)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name.trim(),
      input.sku.trim(),
      input.barcode?.trim() || null,
      input.categoryId,
      input.unit.trim() || 'pc',
      input.regularPrice,
      input.promoPrice ?? null,
      input.unitCost,
      input.currentStock,
      input.reorderLevel,
      input.imageColor || '#E6F7EE',
      input.imageUri?.trim() || null
    );

    productId = result.lastInsertRowId;

    if (input.currentStock > 0) {
      await db.runAsync(
        `INSERT INTO inventory_batches (product_id, batch_number, quantity, unit_cost)
         VALUES (?, ?, ?, ?)`,
        productId,
        `OPENING-${productId}`,
        input.currentStock,
        input.unitCost
      );

      await db.runAsync(
        `INSERT INTO stock_movements
          (product_id, movement_type, quantity, previous_stock, new_stock, reason, reference_type, reference_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        productId,
        'adjustment',
        input.currentStock,
        0,
        input.currentStock,
        'Opening stock',
        'product',
        productId,
        userId
      );
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      'product_created',
      'product',
      productId,
      JSON.stringify({ sku: input.sku.trim(), name: input.name.trim() })
    );
  });

  return productId;
}

export async function updateProduct(
  db: SQLiteDatabase,
  productId: number,
  input: ProductFormInput,
  userId: number
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE products
       SET name = ?,
           sku = ?,
           barcode = ?,
           category_id = ?,
           unit = ?,
           regular_price = ?,
           promo_price = ?,
           unit_cost = ?,
           reorder_level = ?,
           image_color = ?,
           image_uri = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      input.name.trim(),
      input.sku.trim(),
      input.barcode?.trim() || null,
      input.categoryId,
      input.unit.trim() || 'pc',
      input.regularPrice,
      input.promoPrice ?? null,
      input.unitCost,
      input.reorderLevel,
      input.imageColor || '#E6F7EE',
      input.imageUri?.trim() || null,
      productId
    );

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      'product_updated',
      'product',
      productId,
      JSON.stringify({ sku: input.sku.trim(), name: input.name.trim() })
    );
  });
}

export async function adjustProductStock(db: SQLiteDatabase, input: StockAdjustmentInput) {
  if (input.quantityDelta === 0) {
    throw new Error('Adjustment quantity cannot be zero.');
  }

  const product = await db.getFirstAsync<ProductListItem>(
    `SELECT
       products.id,
       products.name,
       products.sku,
       products.barcode,
       products.category_id,
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
     WHERE products.id = ?
     GROUP BY products.id`,
    input.productId
  );

  if (!product) {
    throw new Error('Product not found.');
  }

  if (product.current_stock + input.quantityDelta < 0) {
    throw new Error('Adjustment would create negative stock.');
  }

  await db.withTransactionAsync(async () => {
    const previousStock = product.current_stock;
    const newStock = previousStock + input.quantityDelta;
    let batchId: number | null = null;

    if (input.quantityDelta > 0) {
      const batchNumber = input.batchNumber?.trim() || `ADJ-${Date.now()}`;
      const existingBatch = await db.getFirstAsync<{ id: number; quantity: number }>(
        'SELECT id, quantity FROM inventory_batches WHERE product_id = ? AND batch_number = ?',
        input.productId,
        batchNumber
      );

      if (existingBatch) {
        batchId = existingBatch.id;
        await db.runAsync(
          `UPDATE inventory_batches
           SET quantity = quantity + ?, expiry_date = COALESCE(?, expiry_date), unit_cost = ?
           WHERE id = ?`,
          input.quantityDelta,
          input.expiryDate || null,
          input.unitCost ?? 0,
          existingBatch.id
        );
      } else {
        const result = await db.runAsync(
          `INSERT INTO inventory_batches (product_id, batch_number, expiry_date, quantity, unit_cost)
           VALUES (?, ?, ?, ?, ?)`,
          input.productId,
          batchNumber,
          input.expiryDate || null,
          input.quantityDelta,
          input.unitCost ?? 0
        );
        batchId = result.lastInsertRowId;
      }
    } else {
      let remaining = Math.abs(input.quantityDelta);
      const batches = await db.getAllAsync<{ id: number; quantity: number }>(
        `SELECT id, quantity
         FROM inventory_batches
         WHERE product_id = ? AND quantity > 0
         ORDER BY
           CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
           expiry_date ASC,
           id ASC`,
        input.productId
      );

      for (const batch of batches) {
        if (remaining <= 0) {
          break;
        }

        const deducted = Math.min(batch.quantity, remaining);
        remaining -= deducted;
        batchId = batch.id;
        await db.runAsync(
          'UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?',
          deducted,
          batch.id
        );
      }
    }

    await db.runAsync(
      `UPDATE products
       SET current_stock = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      newStock,
      input.productId
    );

    await db.runAsync(
      `INSERT INTO stock_movements
        (product_id, batch_id, shift_id, movement_type, quantity, previous_stock, new_stock, reason, reference_type, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.productId,
      batchId,
      input.shiftId ?? null,
      'adjustment',
      input.quantityDelta,
      previousStock,
      newStock,
      input.reason.trim(),
      'adjustment',
      input.userId
    );

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.userId,
      'stock_adjusted',
      'product',
      input.productId,
      JSON.stringify({ quantityDelta: input.quantityDelta, reason: input.reason.trim() })
    );
  });
}

export async function createSupplier(db: SQLiteDatabase, input: SupplierInput, userId: number) {
  const name = input.name.trim();

  if (!name) {
    throw new Error('Supplier name is required.');
  }

  const existingSupplier = await db.getFirstAsync<Supplier>(
    'SELECT id, name, contact_name, phone, email, address, is_active, created_at FROM suppliers WHERE lower(name) = lower(?)',
    name
  );

  if (existingSupplier?.is_active) {
    throw new Error('A supplier with this name already exists.');
  }

  let supplierId = 0;

  await db.withTransactionAsync(async () => {
    if (existingSupplier) {
      supplierId = existingSupplier.id;
      await db.runAsync(
        `UPDATE suppliers
         SET name = ?,
             contact_name = ?,
             phone = ?,
             email = ?,
             address = ?,
             is_active = 1
         WHERE id = ?`,
        name,
        input.contactName?.trim() || null,
        input.phone?.trim() || null,
        input.email?.trim() || null,
        input.address?.trim() || null,
        supplierId
      );
    } else {
      const result = await db.runAsync(
        `INSERT INTO suppliers (name, contact_name, phone, email, address)
         VALUES (?, ?, ?, ?, ?)`,
        name,
        input.contactName?.trim() || null,
        input.phone?.trim() || null,
        input.email?.trim() || null,
        input.address?.trim() || null
      );

      supplierId = result.lastInsertRowId;
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      existingSupplier ? 'supplier_restored' : 'supplier_created',
      'supplier',
      supplierId,
      JSON.stringify({ name })
    );
  });

  return supplierId;
}

export async function updateSupplier(
  db: SQLiteDatabase,
  supplierId: number,
  input: SupplierInput,
  userId: number
) {
  const name = input.name.trim();

  if (!name) {
    throw new Error('Supplier name is required.');
  }

  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM suppliers WHERE lower(name) = lower(?) AND id != ?',
    name,
    supplierId
  );

  if (duplicate) {
    throw new Error('A supplier with this name already exists.');
  }

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `UPDATE suppliers
       SET name = ?,
           contact_name = ?,
           phone = ?,
           email = ?,
           address = ?
       WHERE id = ?
         AND is_active = 1`,
      name,
      input.contactName?.trim() || null,
      input.phone?.trim() || null,
      input.email?.trim() || null,
      input.address?.trim() || null,
      supplierId
    );

    if (result.changes === 0) {
      throw new Error('Supplier not found.');
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      'supplier_updated',
      'supplier',
      supplierId,
      JSON.stringify({ name })
    );
  });
}

export async function deleteSupplier(db: SQLiteDatabase, supplierId: number, userId: number) {
  const supplier = await db.getFirstAsync<Supplier>(
    'SELECT id, name, contact_name, phone, email, address, is_active, created_at FROM suppliers WHERE id = ? AND is_active = 1',
    supplierId
  );

  if (!supplier) {
    throw new Error('Supplier not found.');
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE suppliers SET is_active = 0 WHERE id = ?', supplierId);
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      'supplier_deleted',
      'supplier',
      supplierId,
      JSON.stringify({ name: supplier.name })
    );
  });
}

export async function createCategory(db: SQLiteDatabase, input: CategoryInput, userId: number) {
  const name = input.name.trim();
  const sortOrder = Number.isFinite(input.sortOrder) ? input.sortOrder : 0;

  if (!name) {
    throw new Error('Category name is required.');
  }

  const existingCategory = await db.getFirstAsync<Category>(
    'SELECT id, name, sort_order, is_active FROM categories WHERE lower(name) = lower(?)',
    name
  );

  if (existingCategory?.is_active) {
    throw new Error('A category with this name already exists.');
  }

  let categoryId = 0;

  await db.withTransactionAsync(async () => {
    if (existingCategory) {
      categoryId = existingCategory.id;
      await db.runAsync(
        `UPDATE categories
         SET name = ?,
             sort_order = ?,
             is_active = 1
         WHERE id = ?`,
        name,
        sortOrder,
        categoryId
      );
    } else {
      const result = await db.runAsync(
        'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
        name,
        sortOrder
      );
      categoryId = result.lastInsertRowId;
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      existingCategory ? 'category_restored' : 'category_created',
      'category',
      categoryId,
      JSON.stringify({ name, sortOrder })
    );
  });

  return categoryId;
}

export async function updateCategory(
  db: SQLiteDatabase,
  categoryId: number,
  input: CategoryInput,
  userId: number
) {
  const name = input.name.trim();
  const sortOrder = Number.isFinite(input.sortOrder) ? input.sortOrder : 0;

  if (!name) {
    throw new Error('Category name is required.');
  }

  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM categories WHERE lower(name) = lower(?) AND id != ?',
    name,
    categoryId
  );

  if (duplicate) {
    throw new Error('A category with this name already exists.');
  }

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `UPDATE categories
       SET name = ?,
           sort_order = ?
       WHERE id = ?
         AND is_active = 1`,
      name,
      sortOrder,
      categoryId
    );

    if (result.changes === 0) {
      throw new Error('Category not found.');
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      'category_updated',
      'category',
      categoryId,
      JSON.stringify({ name, sortOrder })
    );
  });
}

export async function deleteCategory(db: SQLiteDatabase, categoryId: number, userId: number) {
  const category = await db.getFirstAsync<CategoryManagementItem>(
    `SELECT
       categories.id,
       categories.name,
       categories.sort_order,
       categories.is_active,
       COUNT(products.id) as product_count
     FROM categories
     LEFT JOIN products ON products.category_id = categories.id
     WHERE categories.id = ?
       AND categories.is_active = 1
     GROUP BY categories.id`,
    categoryId
  );

  if (!category) {
    throw new Error('Category not found.');
  }

  if (category.product_count > 0) {
    throw new Error('Move or delete products in this category before deleting it.');
  }

  const activeCount = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM categories WHERE is_active = 1'
  );

  if ((activeCount?.count ?? 0) <= 1) {
    throw new Error('At least one active category is required.');
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE categories SET is_active = 0 WHERE id = ?', categoryId);
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      'category_deleted',
      'category',
      categoryId,
      JSON.stringify({ name: category.name })
    );
  });
}

export async function deleteProduct(db: SQLiteDatabase, productId: number, userId: number) {
  const product = await db.getFirstAsync<ProductDetails>(
    `SELECT
       products.id,
       products.name,
       products.sku,
       products.barcode,
       products.category_id,
       categories.name as category_name,
       products.unit,
       products.regular_price,
       products.promo_price,
       products.unit_cost,
       products.current_stock,
       products.reorder_level,
       products.image_color,
       products.image_uri,
       products.is_active,
       products.created_at,
       products.updated_at,
       MIN(inventory_batches.expiry_date) as nearest_expiry
     FROM products
     INNER JOIN categories ON categories.id = products.category_id
     LEFT JOIN inventory_batches ON inventory_batches.product_id = products.id
     WHERE products.id = ?
       AND products.is_active = 1
     GROUP BY products.id`,
    productId
  );

  if (!product) {
    throw new Error('Product not found.');
  }

  if (product.current_stock !== 0) {
    throw new Error('Product can only be deleted when current stock is zero.');
  }

  const batchStock = await db.getFirstAsync<{ quantity: number }>(
    `SELECT COALESCE(SUM(quantity), 0) as quantity
     FROM inventory_batches
     WHERE product_id = ?`,
    productId
  );

  if ((batchStock?.quantity ?? 0) !== 0) {
    throw new Error('Product has remaining batch stock and cannot be deleted.');
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE products
       SET is_active = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      productId
    );
    await db.runAsync(
      `UPDATE promotions
       SET status = 'inactive'
       WHERE product_id = ?`,
      productId
    );
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      'product_deleted',
      'product',
      productId,
      JSON.stringify({ sku: product.sku, name: product.name })
    );
  });
}

export async function saveDelivery(db: SQLiteDatabase, input: DeliveryInput) {
  if (input.items.length === 0) {
    throw new Error('Add at least one product to the delivery.');
  }

  const deliveryTotal = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );
  let deliveryId = 0;

  await db.withTransactionAsync(async () => {
    const deliveryResult = await db.runAsync(
      `INSERT INTO deliveries (supplier_id, invoice_number, delivery_date, total_amount, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      input.supplierId,
      input.invoiceNumber.trim(),
      input.deliveryDate,
      deliveryTotal,
      input.createdBy
    );

    deliveryId = deliveryResult.lastInsertRowId;

    for (const item of input.items) {
      const product = await db.getFirstAsync<{ current_stock: number }>(
        'SELECT current_stock FROM products WHERE id = ?',
        item.productId
      );

      if (!product) {
        throw new Error('Delivery contains a missing product.');
      }

      const existingBatch = await db.getFirstAsync<{ id: number; quantity: number }>(
        'SELECT id, quantity FROM inventory_batches WHERE product_id = ? AND batch_number = ?',
        item.productId,
        item.batchNumber.trim()
      );
      let batchId: number;

      if (existingBatch) {
        batchId = existingBatch.id;
        await db.runAsync(
          `UPDATE inventory_batches
           SET quantity = quantity + ?, expiry_date = COALESCE(?, expiry_date), unit_cost = ?
           WHERE id = ?`,
          item.quantity,
          item.expiryDate || null,
          item.unitCost,
          existingBatch.id
        );
      } else {
        const batchResult = await db.runAsync(
          `INSERT INTO inventory_batches (product_id, batch_number, expiry_date, quantity, unit_cost)
           VALUES (?, ?, ?, ?, ?)`,
          item.productId,
          item.batchNumber.trim(),
          item.expiryDate || null,
          item.quantity,
          item.unitCost
        );
        batchId = batchResult.lastInsertRowId;
      }

      await db.runAsync(
        `INSERT INTO delivery_items
          (delivery_id, product_id, batch_id, batch_number, expiry_date, quantity, unit_cost, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        deliveryId,
        item.productId,
        batchId,
        item.batchNumber.trim(),
        item.expiryDate || null,
        item.quantity,
        item.unitCost,
        item.quantity * item.unitCost
      );

      const previousStock = product.current_stock;
      const newStock = previousStock + item.quantity;

      await db.runAsync(
        `UPDATE products
         SET current_stock = ?, unit_cost = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        newStock,
        item.unitCost,
        item.productId
      );

      await db.runAsync(
        `INSERT INTO stock_movements
          (product_id, batch_id, shift_id, movement_type, quantity, previous_stock, new_stock, reason, reference_type, reference_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.productId,
        batchId,
        input.shiftId ?? null,
        'stock_in',
        item.quantity,
        previousStock,
        newStock,
        `Delivery ${input.invoiceNumber.trim()}`,
        'delivery',
        deliveryId,
        input.createdBy
      );
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.createdBy,
      'delivery_saved',
      'delivery',
      deliveryId,
      JSON.stringify({
        supplierId: input.supplierId,
        invoiceNumber: input.invoiceNumber.trim(),
        itemCount: input.items.length,
        total: deliveryTotal,
      })
    );
  });

  return deliveryId;
}

export function getCategoryName(categories: Category[], categoryId: number) {
  return categories.find((category) => category.id === categoryId)?.name ?? 'Uncategorized';
}
