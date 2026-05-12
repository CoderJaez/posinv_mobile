import type { SQLiteDatabase } from 'expo-sqlite';

export type DatabaseHealthCheck = {
  integrityOk: boolean;
  integrityMessages: string[];
  foreignKeyViolations: number;
  checkedAt: string;
};

type IntegrityRow = {
  integrity_check: string;
};

type ForeignKeyRow = {
  table: string;
  rowid: number;
  parent: string;
  fkid: number;
};

export async function runDatabaseIntegrityCheck(db: SQLiteDatabase): Promise<DatabaseHealthCheck> {
  const [integrityRows, foreignKeyRows] = await Promise.all([
    db.getAllAsync<IntegrityRow>('PRAGMA integrity_check'),
    db.getAllAsync<ForeignKeyRow>('PRAGMA foreign_key_check'),
  ]);
  const integrityMessages = integrityRows.map((row) => row.integrity_check);
  const integrityOk =
    integrityMessages.length === 1 &&
    integrityMessages[0]?.toLowerCase() === 'ok' &&
    foreignKeyRows.length === 0;

  return {
    integrityOk,
    integrityMessages,
    foreignKeyViolations: foreignKeyRows.length,
    checkedAt: new Date().toISOString(),
  };
}
