import type { SQLiteDatabase } from 'expo-sqlite';

import {
  DATABASE_VERSION,
  phase2MigrationSql,
  phase6MigrationSql,
  productImageMigrationSql,
  salesAdjustmentsAndPrintMigrationSql,
  schemaSql,
} from './schema';
import { seedDatabase } from './seed';

export const DATABASE_NAME = 'storemate_pos.db';

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
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  }
}
