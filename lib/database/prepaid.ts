import type { SQLiteDatabase } from 'expo-sqlite';

import type { PrepaidProvider, PrepaidSummary, PrepaidTransaction } from './types';

export type CreatePrepaidTransactionInput = {
  cashierId: number;
  shiftId?: number | null;
  provider: PrepaidProvider;
  mobileNumber: string;
  amount: number;
  serviceFee: number;
  referenceNumber?: string | null;
};

export function createPrepaidReference() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 900 + 100);
  return `LOAD${timestamp}${random}`;
}

export async function createPrepaidTransaction(
  db: SQLiteDatabase,
  input: CreatePrepaidTransactionInput
) {
  const mobileNumber = input.mobileNumber.trim();

  if (!mobileNumber) {
    throw new Error('Mobile number is required.');
  }

  if (input.amount <= 0) {
    throw new Error('Load amount must be greater than zero.');
  }

  if (input.serviceFee < 0) {
    throw new Error('Service fee cannot be negative.');
  }

  let transactionId = 0;
  const referenceNumber = input.referenceNumber?.trim() || createPrepaidReference();
  const cashCollected = input.amount + input.serviceFee;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO prepaid_transactions
        (cashier_id, shift_id, provider, mobile_number, amount, service_fee, status, reference_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.cashierId,
      input.shiftId ?? null,
      input.provider,
      mobileNumber,
      input.amount,
      input.serviceFee,
      'completed',
      referenceNumber
    );

    transactionId = result.lastInsertRowId;

    if (input.shiftId) {
      await db.runAsync(
        'UPDATE shifts SET expected_cash = expected_cash + ? WHERE id = ?',
        cashCollected,
        input.shiftId
      );
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.cashierId,
      'prepaid_transaction_completed',
      'prepaid_transaction',
      transactionId,
      JSON.stringify({
        provider: input.provider,
        amount: input.amount,
        serviceFee: input.serviceFee,
        referenceNumber,
      })
    );
  });

  return {
    transactionId,
    referenceNumber,
    cashCollected,
  };
}

export async function getRecentPrepaidTransactions(db: SQLiteDatabase, limit = 20) {
  return db.getAllAsync<PrepaidTransaction>(
    `SELECT prepaid_transactions.*, users.full_name as cashier_name
     FROM prepaid_transactions
     INNER JOIN users ON users.id = prepaid_transactions.cashier_id
     ORDER BY prepaid_transactions.created_at DESC
     LIMIT ?`,
    limit
  );
}

export async function getTodayPrepaidSummary(db: SQLiteDatabase) {
  const summary = await db.getFirstAsync<PrepaidSummary>(
    `SELECT
       COALESCE(SUM(amount), 0) as total_amount,
       COALESCE(SUM(service_fee), 0) as service_fees,
       COALESCE(COUNT(*), 0) as transaction_count
     FROM prepaid_transactions
     WHERE status = 'completed'
       AND created_at >= date('now', 'localtime')
       AND created_at < datetime(date('now', 'localtime'), '+1 day')`
  );

  return summary ?? {
    total_amount: 0,
    service_fees: 0,
    transaction_count: 0,
  };
}
