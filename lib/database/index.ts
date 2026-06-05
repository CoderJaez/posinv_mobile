import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DATABASE_VERSION,
  customerModuleMigrationSql,
  phase2MigrationSql,
  phase6MigrationSql,
  productImageMigrationSql,
  saleVoidAndAutoPrintMigrationSql,
  salesAdjustmentsAndPrintMigrationSql,
  schemaSql,
} from './schema';
import { seedDatabase } from './seed';

export const DATABASE_NAME = 'storemate_pos.db';

async function columnExists(db: SQLiteDatabase, tableName: string, columnName: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);

  return columns.some((column) => column.name === columnName);
}

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = version?.user_version ?? 0;

  if (currentVersion < 1) {
    await db.execAsync(schemaSql);
    await db.execAsync('PRAGMA user_version = 1;');
  }

  if (currentVersion < 2) {
    await db.execAsync(phase2MigrationSql);
    await db.execAsync('PRAGMA user_version = 2;');
  }

  await seedDatabase(db);

  if (currentVersion < 3) {
    await db.execAsync(phase6MigrationSql);
    await db.execAsync('PRAGMA user_version = 3;');
  }

  if (currentVersion > 0 && currentVersion < 4) {
    await db.execAsync(productImageMigrationSql);
  }

  if (currentVersion < 4) {
    await db.execAsync('PRAGMA user_version = 4;');
  }

  if (currentVersion > 0 && currentVersion < 5) {
    await db.execAsync(salesAdjustmentsAndPrintMigrationSql);
  }

  if (currentVersion < 5) {
    await db.execAsync('PRAGMA user_version = 5;');
  }

  if (currentVersion < 6) {
    await db.execAsync(customerModuleMigrationSql);
    await db.execAsync('PRAGMA user_version = 6;');
  }

  if (currentVersion < 7) {
    if (!(await columnExists(db, 'sales', 'void_reason'))) {
      await db.execAsync('ALTER TABLE sales ADD COLUMN void_reason TEXT;');
    }

    await db.execAsync(saleVoidAndAutoPrintMigrationSql);
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  }
}
