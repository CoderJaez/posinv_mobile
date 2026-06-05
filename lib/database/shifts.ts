import type { SQLiteDatabase } from 'expo-sqlite';

import type { CashDrawerMovementType, Shift, ShiftSummary } from './types';

export async function getOpenShiftForUser(db: SQLiteDatabase, userId: number) {
  return db.getFirstAsync<Shift>(
    `SELECT shifts.*, users.full_name as user_name
     FROM shifts
     INNER JOIN users ON users.id = shifts.user_id
     WHERE shifts.user_id = ? AND shifts.status = 'open'
     ORDER BY shifts.started_at DESC
     LIMIT 1`,
    userId
  );
}

export async function getRecentShifts(db: SQLiteDatabase, limit = 10) {
  return db.getAllAsync<Shift>(
    `SELECT shifts.*, users.full_name as user_name
     FROM shifts
     INNER JOIN users ON users.id = shifts.user_id
     ORDER BY shifts.started_at DESC
     LIMIT ?`,
    limit
  );
}

export async function startShift(
  db: SQLiteDatabase,
  input: { userId: number; openingBalance: number; notes?: string }
) {
  let shiftId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO shifts (user_id, opening_balance, expected_cash, notes)
       VALUES (?, ?, ?, ?)`,
      input.userId,
      input.openingBalance,
      input.openingBalance,
      input.notes?.trim() || null
    );

    shiftId = result.lastInsertRowId;

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.userId,
      'shift_started',
      'shift',
      shiftId,
      JSON.stringify({ openingBalance: input.openingBalance })
    );
  });

  return shiftId;
}

export async function addCashDrawerMovement(
  db: SQLiteDatabase,
  input: {
    shiftId: number;
    userId: number;
    movementType: CashDrawerMovementType;
    amount: number;
    reason: string;
  }
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cash_drawer_movements (shift_id, user_id, movement_type, amount, reason)
       VALUES (?, ?, ?, ?, ?)`,
      input.shiftId,
      input.userId,
      input.movementType,
      input.amount,
      input.reason.trim()
    );

    const cashInDelta = input.movementType === 'cash_in' ? input.amount : 0;
    const cashOutDelta = input.movementType === 'cash_out' ? input.amount : 0;

    await db.runAsync(
      `UPDATE shifts
       SET cash_in_total = cash_in_total + ?,
           cash_out_total = cash_out_total + ?,
           expected_cash = expected_cash + ? - ?
       WHERE id = ?`,
      cashInDelta,
      cashOutDelta,
      cashInDelta,
      cashOutDelta,
      input.shiftId
    );

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.userId,
      input.movementType,
      'shift',
      input.shiftId,
      JSON.stringify({ amount: input.amount, reason: input.reason })
    );
  });
}

export async function getShiftSummary(db: SQLiteDatabase, shiftId: number) {
  const shift = await db.getFirstAsync<ShiftSummary>(
    `SELECT
       shifts.*,
       users.full_name as cashier_name,
       users.role as cashier_role,
       COALESCE((
         SELECT SUM(sales.total)
         FROM payments
         INNER JOIN sales ON sales.id = payments.sale_id
         WHERE sales.shift_id = shifts.id
           AND payments.method = 'cash'
           AND sales.status = 'completed'
       ), 0) as cash_sales_total
     FROM shifts
     INNER JOIN users ON users.id = shifts.user_id
     WHERE shifts.id = ?`,
    shiftId
  );

  if (!shift) {
    return null;
  }

  const cashMovements = await db.getAllAsync<ShiftSummary['cash_movements'][number]>(
    `SELECT id, shift_id, user_id, movement_type, amount, reason, created_at
     FROM cash_drawer_movements
     WHERE shift_id = ?
     ORDER BY created_at DESC`,
    shiftId
  );

  return {
    ...shift,
    cash_movements: cashMovements,
  };
}

export async function endShift(
  db: SQLiteDatabase,
  input: { shiftId: number; userId: number; actualCash: number; notes?: string }
) {
  const summary = await getShiftSummary(db, input.shiftId);

  if (!summary) {
    throw new Error('Shift not found.');
  }

  const expectedCash =
    summary.opening_balance +
    (summary.cash_sales_total ?? 0) +
    summary.cash_in_total -
    summary.cash_out_total;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE shifts
       SET status = 'closed',
           expected_cash = ?,
           actual_cash = ?,
           ended_at = CURRENT_TIMESTAMP,
           notes = COALESCE(?, notes)
       WHERE id = ?`,
      expectedCash,
      input.actualCash,
      input.notes?.trim() || null,
      input.shiftId
    );

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.userId,
      'shift_ended',
      'shift',
      input.shiftId,
      JSON.stringify({
        expectedCash,
        actualCash: input.actualCash,
        variance: input.actualCash - expectedCash,
      })
    );
  });
}
