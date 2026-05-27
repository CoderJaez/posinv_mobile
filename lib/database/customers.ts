import type { SQLiteDatabase } from 'expo-sqlite';

import type { Customer, CustomerStatus, CustomerSummary } from './types';

export type CustomerInput = {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  loyaltyPoints?: number | null;
  notes?: string | null;
  status?: CustomerStatus;
  lastVisitAt?: string | null;
};

function cleanText(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePoints(value?: number | null) {
  if (!Number.isFinite(value ?? 0)) {
    return 0;
  }

  return Math.max(0, Math.floor(value ?? 0));
}

function validateCustomer(input: CustomerInput) {
  if (!input.fullName.trim()) {
    throw new Error('Customer name is required.');
  }
}

export async function getCustomerSummary(db: SQLiteDatabase) {
  const summary = await db.getFirstAsync<CustomerSummary>(
    `SELECT
       COUNT(*) as total_customers,
       COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active_customers,
       COALESCE(SUM(CASE WHEN loyalty_points > 0 THEN 1 ELSE 0 END), 0) as loyalty_members,
       COALESCE(SUM(loyalty_points), 0) as total_loyalty_points,
       COALESCE(SUM(CASE WHEN last_visit_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) as recent_visits
     FROM customers`
  );

  return (
    summary ?? {
      total_customers: 0,
      active_customers: 0,
      loyalty_members: 0,
      total_loyalty_points: 0,
      recent_visits: 0,
    }
  );
}

export async function getCustomers(db: SQLiteDatabase, search = '') {
  const term = `%${search.trim()}%`;

  return db.getAllAsync<Customer>(
    `SELECT
       id,
       full_name,
       phone,
       email,
       address,
       loyalty_points,
       notes,
       status,
       last_visit_at,
       created_at,
       updated_at
     FROM customers
     WHERE
       ? = '%%'
       OR full_name LIKE ?
       OR phone LIKE ?
       OR email LIKE ?
       OR address LIKE ?
       OR notes LIKE ?
     ORDER BY
       CASE status WHEN 'active' THEN 0 ELSE 1 END,
       CASE WHEN last_visit_at IS NULL THEN 1 ELSE 0 END,
       last_visit_at DESC,
       full_name ASC`,
    term,
    term,
    term,
    term,
    term,
    term
  );
}

export async function createCustomer(db: SQLiteDatabase, input: CustomerInput, userId: number) {
  validateCustomer(input);
  let customerId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO customers
        (full_name, phone, email, address, loyalty_points, notes, status, last_visit_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.fullName.trim(),
      cleanText(input.phone),
      cleanText(input.email),
      cleanText(input.address),
      normalizePoints(input.loyaltyPoints),
      cleanText(input.notes),
      input.status ?? 'active',
      cleanText(input.lastVisitAt)
    );

    customerId = result.lastInsertRowId;

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      'customer_created',
      'customer',
      customerId,
      JSON.stringify({ name: input.fullName.trim(), phone: cleanText(input.phone) })
    );
  });

  return customerId;
}

export async function updateCustomer(
  db: SQLiteDatabase,
  customerId: number,
  input: CustomerInput,
  userId: number
) {
  validateCustomer(input);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE customers
       SET full_name = ?,
           phone = ?,
           email = ?,
           address = ?,
           loyalty_points = ?,
           notes = ?,
           status = ?,
           last_visit_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      input.fullName.trim(),
      cleanText(input.phone),
      cleanText(input.email),
      cleanText(input.address),
      normalizePoints(input.loyaltyPoints),
      cleanText(input.notes),
      input.status ?? 'active',
      cleanText(input.lastVisitAt),
      customerId
    );

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      'customer_updated',
      'customer',
      customerId,
      JSON.stringify({ name: input.fullName.trim(), phone: cleanText(input.phone) })
    );
  });
}

export async function setCustomerStatus(
  db: SQLiteDatabase,
  customerId: number,
  status: CustomerStatus,
  userId: number
) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE customers
       SET status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      status,
      customerId
    );

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      status === 'active' ? 'customer_reactivated' : 'customer_deactivated',
      'customer',
      customerId,
      JSON.stringify({ status })
    );
  });
}
