import type { SQLiteDatabase } from 'expo-sqlite';

import type { PrintJob } from './types';

export async function createPrintJob(
  db: SQLiteDatabase,
  input: {
    saleId?: number | null;
    receiptNumber?: string | null;
    printerName?: string | null;
    printerAddress?: string | null;
    connectionType?: 'bluetooth' | 'system';
    payloadText: string;
    createdBy?: number | null;
  }
) {
  const result = await db.runAsync(
    `INSERT INTO print_jobs
      (sale_id, receipt_number, printer_name, printer_address, connection_type, status, payload_text, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.saleId ?? null,
    input.receiptNumber ?? null,
    input.printerName ?? null,
    input.printerAddress ?? null,
    input.connectionType ?? 'bluetooth',
    'queued',
    input.payloadText,
    input.createdBy ?? null
  );

  return result.lastInsertRowId;
}

export async function markPrintJobSent(db: SQLiteDatabase, printJobId: number) {
  await db.runAsync(
    `UPDATE print_jobs
     SET status = 'sent',
         printed_at = CURRENT_TIMESTAMP,
         error_message = NULL
     WHERE id = ?`,
    printJobId
  );
}

export async function markPrintJobFailed(
  db: SQLiteDatabase,
  printJobId: number,
  errorMessage: string
) {
  await db.runAsync(
    `UPDATE print_jobs
     SET status = 'failed',
         error_message = ?
     WHERE id = ?`,
    errorMessage,
    printJobId
  );
}

export async function getRecentPrintJobs(db: SQLiteDatabase, limit = 20) {
  return db.getAllAsync<PrintJob>(
    `SELECT *
     FROM print_jobs
     ORDER BY created_at DESC
     LIMIT ?`,
    limit
  );
}
