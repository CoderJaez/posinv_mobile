import type { SQLiteDatabase } from 'expo-sqlite';

import { calculateCashChange } from '@/lib/domain/sales';
import { planBatchDeductions } from '@/lib/domain/stock';
import { getCartTotals } from '@/lib/store/cart-store';

import type {
  CartItemSnapshot,
  HeldTransaction,
  PaymentMethod,
  SaleAdjustment,
  SaleItemRecord,
  SaleRecord,
  SalesReportRow,
} from './types';

type CompleteSaleInput = {
  cashierId: number;
  shiftId: number;
  items: CartItemSnapshot[];
  paymentMethod: PaymentMethod;
  cashReceived?: number | null;
  referenceNumber?: string | null;
  heldTransactionId?: number | null;
};

type HoldTransactionInput = {
  cashierId: number;
  shiftId: number;
  items: CartItemSnapshot[];
};

type ShiftSalesInput = {
  shiftId: number;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
  offset?: number;
};

function parseDateInput(value?: string | null) {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toSqlDateTime(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function buildShiftSalesWhere(input: ShiftSalesInput) {
  const where = ['sales.shift_id = ?'];
  const params: (number | string)[] = [input.shiftId];
  const parsedStart = parseDateInput(input.startDate);
  const parsedEnd = parseDateInput(input.endDate);
  const start = parsedStart && parsedEnd && parsedStart > parsedEnd ? parsedEnd : parsedStart;
  const end = parsedStart && parsedEnd && parsedStart > parsedEnd ? parsedStart : parsedEnd;

  if (start) {
    where.push('sales.completed_at >= ?');
    params.push(toSqlDateTime(start));
  }

  if (end) {
    where.push('sales.completed_at < ?');
    params.push(toSqlDateTime(addDays(end, 1)));
  }

  return {
    clause: where.join(' AND '),
    params,
  };
}

function createReceiptNumber() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 900 + 100);
  return `OR${timestamp}${random}`;
}

function createHoldNumber() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 90 + 10);
  return `H${timestamp}${random}`;
}

export async function holdTransaction(db: SQLiteDatabase, input: HoldTransactionInput) {
  const totals = getCartTotals(input.items);
  const holdNumber = createHoldNumber();
  let heldTransactionId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO held_transactions
        (hold_number, cashier_id, shift_id, cart_json, subtotal, discount_total, total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      holdNumber,
      input.cashierId,
      input.shiftId,
      JSON.stringify(input.items),
      totals.subtotal,
      totals.discountTotal,
      totals.total
    );

    heldTransactionId = result.lastInsertRowId;

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.cashierId,
      'transaction_held',
      'held_transaction',
      heldTransactionId,
      JSON.stringify({ holdNumber, total: totals.total, itemCount: input.items.length })
    );
  });

  return heldTransactionId;
}

export async function getHeldTransactions(db: SQLiteDatabase) {
  return db.getAllAsync<HeldTransaction>(
    `SELECT held_transactions.*, users.full_name as cashier_name
     FROM held_transactions
     INNER JOIN users ON users.id = held_transactions.cashier_id
     WHERE held_transactions.status = 'held'
     ORDER BY held_transactions.held_at DESC`
  );
}

export async function markHeldTransactionResumed(
  db: SQLiteDatabase,
  input: { heldTransactionId: number; userId: number }
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE held_transactions
       SET status = 'resumed', resumed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'held'`,
      input.heldTransactionId
    );
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
       VALUES (?, ?, ?, ?)`,
      input.userId,
      'transaction_resumed',
      'held_transaction',
      input.heldTransactionId
    );
  });
}

export async function voidHeldTransaction(
  db: SQLiteDatabase,
  input: { heldTransactionId: number; userId: number }
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE held_transactions
       SET status = 'voided'
       WHERE id = ? AND status = 'held'`,
      input.heldTransactionId
    );
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
       VALUES (?, ?, ?, ?)`,
      input.userId,
      'held_transaction_voided',
      'held_transaction',
      input.heldTransactionId
    );
  });
}

export async function clearHeldTransactions(
  db: SQLiteDatabase,
  input: { userId: number; shiftId?: number | null }
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE held_transactions
       SET status = 'voided'
       WHERE status = 'held'
         AND (? IS NULL OR shift_id = ?)`,
      input.shiftId ?? null,
      input.shiftId ?? null
    );
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, metadata_json)
       VALUES (?, ?, ?, ?)`,
      input.userId,
      'held_transactions_cleared',
      'held_transaction',
      JSON.stringify({ shiftId: input.shiftId ?? null })
    );
  });
}

export async function completeSale(db: SQLiteDatabase, input: CompleteSaleInput) {
  if (input.items.length === 0) {
    throw new Error('Cart is empty.');
  }

  const totals = getCartTotals(input.items);
  const changeDue =
    input.paymentMethod === 'cash'
      ? calculateCashChange(totals.total, input.cashReceived ?? 0)
      : null;
  const receiptNumber = createReceiptNumber();
  let saleId = 0;

  await db.withTransactionAsync(async () => {
    for (const item of input.items) {
      const stock = await db.getFirstAsync<{ current_stock: number }>(
        'SELECT current_stock FROM products WHERE id = ?',
        item.productId
      );

      if (!stock || stock.current_stock < item.quantity) {
        throw new Error(`${item.name} has insufficient stock.`);
      }
    }

    const saleResult = await db.runAsync(
      `INSERT INTO sales
        (receipt_number, shift_id, cashier_id, subtotal, discount_total, tax_total, total, net_sales)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      receiptNumber,
      input.shiftId,
      input.cashierId,
      totals.subtotal,
      totals.discountTotal,
      0,
      totals.total,
      totals.total
    );

    saleId = saleResult.lastInsertRowId;

    for (const item of input.items) {
      const lineTotal = item.quantity * item.unitPrice;

      await db.runAsync(
        `INSERT INTO sale_items
          (sale_id, product_id, product_name, sku, quantity, unit_price, original_unit_price, price_override_reason, discount_amount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        saleId,
        item.productId,
        item.name,
        item.sku,
        item.quantity,
        item.unitPrice,
        item.baseUnitPrice,
        item.priceOverrideReason,
        item.discountAmount ?? 0,
        lineTotal
      );

      const stockBefore = await db.getFirstAsync<{ current_stock: number }>(
        'SELECT current_stock FROM products WHERE id = ?',
        item.productId
      );
      const previousStock = stockBefore?.current_stock ?? 0;
      const newStock = previousStock - item.quantity;

      await db.runAsync(
        `UPDATE products
         SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        item.quantity,
        item.productId
      );

      const batches = await db.getAllAsync<{
        id: number;
        quantity: number;
        expiry_date: string | null;
      }>(
        `SELECT id, quantity, expiry_date
         FROM inventory_batches
         WHERE product_id = ? AND quantity > 0
         ORDER BY
           CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
           expiry_date ASC,
           id ASC`,
        item.productId
      );
      const deductionPlan = planBatchDeductions(
        item.quantity,
        batches.map((batch) => ({
          id: batch.id,
          quantity: batch.quantity,
          expiryDate: batch.expiry_date,
        }))
      );

      for (const deduction of deductionPlan.deductions) {
        await db.runAsync(
          'UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?',
          deduction.quantity,
          deduction.batchId
        );
      }

      await db.runAsync(
        `INSERT INTO stock_movements
          (product_id, shift_id, movement_type, quantity, previous_stock, new_stock, reason, reference_type, reference_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.productId,
        input.shiftId,
        'sale',
        -item.quantity,
        previousStock,
        newStock,
        'POS sale',
        'sale',
        saleId,
        input.cashierId
      );
    }

    await db.runAsync(
      `INSERT INTO payments
        (sale_id, method, amount, cash_received, change_due, reference_number)
       VALUES (?, ?, ?, ?, ?, ?)`,
      saleId,
      input.paymentMethod,
      totals.total,
      input.cashReceived ?? null,
      changeDue,
      input.referenceNumber ?? null
    );

    if (input.paymentMethod === 'cash') {
      await db.runAsync(
        'UPDATE shifts SET expected_cash = expected_cash + ? WHERE id = ?',
        totals.total,
        input.shiftId
      );
    }

    if (input.heldTransactionId) {
      await db.runAsync(
        `UPDATE held_transactions
         SET status = 'resumed', resumed_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        input.heldTransactionId
      );
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.cashierId,
      'sale_completed',
      'sale',
      saleId,
      JSON.stringify({
        receiptNumber,
        paymentMethod: input.paymentMethod,
        total: totals.total,
        itemCount: input.items.length,
        priceOverrides: input.items
          .filter((item) => item.priceOverrideReason)
          .map((item) => ({
            productId: item.productId,
            name: item.name,
            baseUnitPrice: item.baseUnitPrice,
            unitPrice: item.unitPrice,
            reason: item.priceOverrideReason,
          })),
        promotions: input.items
          .filter((item) => item.appliedPromotionName && item.discountAmount > 0)
          .map((item) => ({
            productId: item.productId,
            name: item.name,
            promotionId: item.appliedPromotionId,
            promotionName: item.appliedPromotionName,
            discountAmount: item.discountAmount,
          })),
      })
    );
  });

  return {
    saleId,
    receiptNumber,
    total: totals.total,
    changeDue: changeDue ?? 0,
  };
}

export async function getSaleById(db: SQLiteDatabase, saleId: number) {
  return db.getFirstAsync<SaleRecord>(
    `SELECT sales.*, users.full_name as cashier_name
     FROM sales
     INNER JOIN users ON users.id = sales.cashier_id
     WHERE sales.id = ?`,
    saleId
  );
}

export async function getSaleItems(db: SQLiteDatabase, saleId: number) {
  return db.getAllAsync<SaleItemRecord>(
    `SELECT sale_items.*, products.current_stock
     FROM sale_items
     INNER JOIN products ON products.id = sale_items.product_id
     WHERE sale_items.sale_id = ?
     ORDER BY sale_items.id ASC`,
    saleId
  );
}

export async function getSaleAdjustments(db: SQLiteDatabase, saleId: number) {
  return db.getAllAsync<SaleAdjustment>(
    `SELECT
       sale_adjustments.*,
       products.name as product_name,
       users.full_name as created_by_name
     FROM sale_adjustments
     INNER JOIN products ON products.id = sale_adjustments.product_id
     INNER JOIN users ON users.id = sale_adjustments.created_by
     WHERE sale_adjustments.sale_id = ?
     ORDER BY sale_adjustments.created_at DESC`,
    saleId
  );
}

export async function getSalesForShift(db: SQLiteDatabase, input: ShiftSalesInput) {
  const limit = input.limit ?? 10;
  const offset = input.offset ?? 0;
  const filter = buildShiftSalesWhere(input);
  const total = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM sales
     WHERE ${filter.clause}`,
    ...filter.params
  );
  const rows = await db.getAllAsync<SalesReportRow>(
    `SELECT
       sales.*,
       users.full_name as cashier_name,
       COALESCE(item_totals.item_count, 0) as item_count,
       COALESCE(adjustment_totals.adjustment_count, 0) as adjustment_count,
       GROUP_CONCAT(DISTINCT payments.method) as payment_methods
     FROM sales
     INNER JOIN users ON users.id = sales.cashier_id
     LEFT JOIN (
       SELECT sale_id, SUM(quantity) as item_count
       FROM sale_items
       GROUP BY sale_id
     ) item_totals ON item_totals.sale_id = sales.id
     LEFT JOIN (
       SELECT sale_id, COUNT(*) as adjustment_count
       FROM sale_adjustments
       GROUP BY sale_id
     ) adjustment_totals ON adjustment_totals.sale_id = sales.id
     LEFT JOIN payments ON payments.sale_id = sales.id
     WHERE ${filter.clause}
     GROUP BY sales.id
     ORDER BY sales.completed_at DESC
     LIMIT ? OFFSET ?`,
    ...filter.params,
    limit,
    offset
  );

  return {
    rows,
    total: total?.count ?? 0,
  };
}

export async function adjustSaleItem(
  db: SQLiteDatabase,
  input: {
    saleId: number;
    saleItemId: number;
    newQuantity: number;
    newUnitPrice: number;
    restock: boolean;
    reason: string;
    userId: number;
    requestedByUserId?: number | null;
  }
) {
  if (input.newQuantity < 0) {
    throw new Error('Quantity cannot be negative.');
  }

  if (input.newUnitPrice < 0) {
    throw new Error('Unit price cannot be negative.');
  }

  if (!input.reason.trim()) {
    throw new Error('Adjustment reason is required.');
  }

  const sale = await db.getFirstAsync<SaleRecord>(
    'SELECT * FROM sales WHERE id = ?',
    input.saleId
  );

  if (!sale || sale.status !== 'completed') {
    throw new Error('Only completed sales can be adjusted.');
  }

  const item = await db.getFirstAsync<SaleItemRecord>(
    'SELECT * FROM sale_items WHERE id = ? AND sale_id = ?',
    input.saleItemId,
    input.saleId
  );

  if (!item) {
    throw new Error('Sale item not found.');
  }

  if (input.newQuantity > item.quantity) {
    throw new Error('This adjustment can only reduce or remove sold quantity.');
  }

  const previousLineTotal = item.quantity * item.unit_price;
  const nextLineTotal = input.newQuantity * input.newUnitPrice;
  const previousDiscountAmount = item.discount_amount ?? 0;
  const nextDiscountAmount =
    previousLineTotal > 0
      ? Math.min(nextLineTotal, previousDiscountAmount * (nextLineTotal / previousLineTotal))
      : 0;
  const amountDelta =
    nextLineTotal - nextDiscountAmount - (previousLineTotal - previousDiscountAmount);
  const quantityDelta = input.newQuantity - item.quantity;
  const restockQuantity = input.restock ? Math.abs(Math.min(0, quantityDelta)) : 0;

  if (quantityDelta === 0 && input.newUnitPrice === item.unit_price) {
    throw new Error('No item change was made.');
  }

  if (amountDelta > 0) {
    throw new Error('Sold transaction adjustments cannot increase the sale total.');
  }

  await db.withTransactionAsync(async () => {
    let previousStock = 0;
    let newStock = 0;
    let returnBatchId: number | null = null;

    if (restockQuantity > 0) {
      const stock = await db.getFirstAsync<{ current_stock: number }>(
        'SELECT current_stock FROM products WHERE id = ?',
        item.product_id
      );
      previousStock = stock?.current_stock ?? 0;
      newStock = previousStock + restockQuantity;

      const batchNumber = `RETURN-${input.saleId}-${item.product_id}`;
      const existingBatch = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM inventory_batches WHERE product_id = ? AND batch_number = ?',
        item.product_id,
        batchNumber
      );

      if (existingBatch) {
        returnBatchId = existingBatch.id;
        await db.runAsync(
          'UPDATE inventory_batches SET quantity = quantity + ? WHERE id = ?',
          restockQuantity,
          existingBatch.id
        );
      } else {
        const batchResult = await db.runAsync(
          `INSERT INTO inventory_batches (product_id, batch_number, quantity, unit_cost)
           VALUES (?, ?, ?, ?)`,
          item.product_id,
          batchNumber,
          restockQuantity,
          0
        );
        returnBatchId = batchResult.lastInsertRowId;
      }

      await db.runAsync(
        `UPDATE products
         SET current_stock = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        newStock,
        item.product_id
      );

      await db.runAsync(
        `INSERT INTO stock_movements
          (product_id, batch_id, shift_id, movement_type, quantity, previous_stock, new_stock, reason, reference_type, reference_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.product_id,
        returnBatchId,
        sale.shift_id,
        'return',
        restockQuantity,
        previousStock,
        newStock,
        input.reason.trim(),
        'sale_adjustment',
        input.saleId,
        input.userId
      );
    }

    await db.runAsync(
      `UPDATE sale_items
       SET quantity = ?,
           unit_price = ?,
           line_total = ?,
           discount_amount = ?,
           price_override_reason = COALESCE(price_override_reason, ?)
       WHERE id = ?`,
      input.newQuantity,
      input.newUnitPrice,
      nextLineTotal,
      nextDiscountAmount,
      input.newUnitPrice !== (item.original_unit_price ?? item.unit_price)
        ? input.reason.trim()
        : null,
      input.saleItemId
    );

    const nextTotals = await db.getFirstAsync<{
      subtotal: number;
      discounts: number;
    }>(
      `SELECT
         COALESCE(SUM(line_total), 0) as subtotal,
         COALESCE(SUM(discount_amount), 0) as discounts
       FROM sale_items
       WHERE sale_id = ?`,
      input.saleId
    );
    const nextSubtotal = nextTotals?.subtotal ?? 0;
    const nextDiscount = nextTotals?.discounts ?? 0;
    const nextTotal = Math.max(0, nextSubtotal - nextDiscount);

    await db.runAsync(
      `UPDATE sales
       SET subtotal = ?,
           discount_total = ?,
           total = ?,
           net_sales = ?
       WHERE id = ?`,
      nextSubtotal,
      nextDiscount,
      nextTotal,
      nextTotal,
      input.saleId
    );

    const adjustmentResult = await db.runAsync(
      `INSERT INTO sale_adjustments
        (sale_id, sale_item_id, product_id, adjustment_type, previous_quantity, new_quantity, quantity_delta, previous_unit_price, new_unit_price, amount_delta, restock, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.saleId,
      input.saleItemId,
      item.product_id,
      input.newQuantity === 0 ? 'remove_item' : 'quantity_update',
      item.quantity,
      input.newQuantity,
      quantityDelta,
      item.unit_price,
      input.newUnitPrice,
      amountDelta,
      input.restock ? 1 : 0,
      input.reason.trim(),
      input.userId
    );

    const cashPayment = await db.getFirstAsync<{ amount: number }>(
      `SELECT amount FROM payments
       WHERE sale_id = ? AND method = 'cash'
       LIMIT 1`,
      input.saleId
    );

    if (cashPayment && sale.shift_id && amountDelta < 0) {
      await db.runAsync(
        'UPDATE shifts SET expected_cash = expected_cash + ? WHERE id = ?',
        amountDelta,
        sale.shift_id
      );
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.userId,
      'sale_item_adjusted',
      'sale',
      input.saleId,
      JSON.stringify({
        saleItemId: input.saleItemId,
        adjustmentId: adjustmentResult.lastInsertRowId,
        productId: item.product_id,
        previousQuantity: item.quantity,
        newQuantity: input.newQuantity,
        amountDelta,
        restock: input.restock,
        reason: input.reason.trim(),
        approvedBy: input.userId,
        requestedBy: input.requestedByUserId ?? input.userId,
      })
    );
  });
}

export async function voidSaleTransaction(
  db: SQLiteDatabase,
  input: {
    saleId: number;
    restock: boolean;
    reason: string;
    userId: number;
    requestedByUserId?: number | null;
  }
) {
  if (!input.reason.trim()) {
    throw new Error('Void reason is required.');
  }

  const sale = await db.getFirstAsync<SaleRecord>(
    'SELECT * FROM sales WHERE id = ?',
    input.saleId
  );

  if (!sale || sale.status !== 'completed') {
    throw new Error('Only completed sales can be voided.');
  }

  const items = await db.getAllAsync<SaleItemRecord>(
    'SELECT * FROM sale_items WHERE sale_id = ? AND quantity > 0 ORDER BY id ASC',
    input.saleId
  );

  if (items.length === 0) {
    throw new Error('This sale has no remaining items to void.');
  }

  await db.withTransactionAsync(async () => {
    const adjustmentIds: number[] = [];

    for (const item of items) {
      const quantityDelta = -item.quantity;
      const lineNetTotal = Math.max(0, item.line_total - (item.discount_amount ?? 0));
      let previousStock = 0;
      let newStock = 0;
      let returnBatchId: number | null = null;

      if (input.restock) {
        const stock = await db.getFirstAsync<{ current_stock: number }>(
          'SELECT current_stock FROM products WHERE id = ?',
          item.product_id
        );
        previousStock = stock?.current_stock ?? 0;
        newStock = previousStock + item.quantity;

        const batchNumber = `VOID-${input.saleId}-${item.product_id}`;
        const existingBatch = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM inventory_batches WHERE product_id = ? AND batch_number = ?',
          item.product_id,
          batchNumber
        );

        if (existingBatch) {
          returnBatchId = existingBatch.id;
          await db.runAsync(
            'UPDATE inventory_batches SET quantity = quantity + ? WHERE id = ?',
            item.quantity,
            existingBatch.id
          );
        } else {
          const batchResult = await db.runAsync(
            `INSERT INTO inventory_batches (product_id, batch_number, quantity, unit_cost)
             VALUES (?, ?, ?, ?)`,
            item.product_id,
            batchNumber,
            item.quantity,
            0
          );
          returnBatchId = batchResult.lastInsertRowId;
        }

        await db.runAsync(
          `UPDATE products
           SET current_stock = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          newStock,
          item.product_id
        );

        await db.runAsync(
          `INSERT INTO stock_movements
            (product_id, batch_id, shift_id, movement_type, quantity, previous_stock, new_stock, reason, reference_type, reference_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          item.product_id,
          returnBatchId,
          sale.shift_id,
          'return',
          item.quantity,
          previousStock,
          newStock,
          input.reason.trim(),
          'sale_void',
          input.saleId,
          input.userId
        );
      }

      await db.runAsync(
        `UPDATE sale_items
         SET quantity = 0,
             line_total = 0,
             discount_amount = 0
         WHERE id = ?`,
        item.id
      );

      const adjustmentResult = await db.runAsync(
        `INSERT INTO sale_adjustments
          (sale_id, sale_item_id, product_id, adjustment_type, previous_quantity, new_quantity, quantity_delta, previous_unit_price, new_unit_price, amount_delta, restock, reason, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.saleId,
        item.id,
        item.product_id,
        'remove_item',
        item.quantity,
        0,
        quantityDelta,
        item.unit_price,
        item.unit_price,
        -lineNetTotal,
        input.restock ? 1 : 0,
        input.reason.trim(),
        input.userId
      );
      adjustmentIds.push(adjustmentResult.lastInsertRowId);
    }

    await db.runAsync(
      `UPDATE sales
       SET status = 'voided',
           subtotal = 0,
           discount_total = 0,
           total = 0,
           net_sales = 0,
           void_reason = ?
       WHERE id = ?`,
      input.reason.trim(),
      input.saleId
    );

    const cashPayment = await db.getFirstAsync<{ amount: number }>(
      `SELECT amount FROM payments
       WHERE sale_id = ? AND method = 'cash'
       LIMIT 1`,
      input.saleId
    );

    if (cashPayment && sale.shift_id && sale.total > 0) {
      await db.runAsync(
        'UPDATE shifts SET expected_cash = expected_cash - ? WHERE id = ?',
        sale.total,
        sale.shift_id
      );
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.userId,
      'sale_voided',
      'sale',
      input.saleId,
      JSON.stringify({
        receiptNumber: sale.receipt_number,
        previousTotal: sale.total,
        itemCount: items.length,
        adjustmentIds,
        restock: input.restock,
        reason: input.reason.trim(),
        approvedBy: input.userId,
        requestedBy: input.requestedByUserId ?? input.userId,
      })
    );
  });
}
