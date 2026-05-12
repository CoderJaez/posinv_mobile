import type { SQLiteDatabase } from 'expo-sqlite';

import { calculateCashChange } from '@/lib/domain/sales';
import { planBatchDeductions } from '@/lib/domain/stock';
import { getCartTotals } from '@/lib/store/cart-store';

import type {
  CartItemSnapshot,
  HeldTransaction,
  PaymentMethod,
  SaleRecord,
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
          (sale_id, product_id, product_name, sku, quantity, unit_price, discount_amount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        saleId,
        item.productId,
        item.name,
        item.sku,
        item.quantity,
        item.unitPrice,
        0,
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
