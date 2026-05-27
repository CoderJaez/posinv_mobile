import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  backupDatabaseAsync,
  deserializeDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';

import { initializeDatabase } from './index';

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getBackupDirectory() {
  const directory = new Directory(Paths.document, 'database-backups');

  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }

  return directory;
}

function fileNameFromUri(uri: string) {
  return decodeURIComponent(uri.split('/').pop() || 'database-backup.db');
}

async function writeDatabaseBackup(
  db: SQLiteDatabase,
  prefix: string,
  userId?: number | null,
  audit = true
) {
  if (audit) {
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, metadata_json)
       VALUES (?, ?, ?, ?)`,
      userId ?? null,
      'database_exported',
      'database',
      JSON.stringify({ prefix })
    );
  }

  const bytes = await db.serializeAsync();
  const file = new File(getBackupDirectory(), `${prefix}-${timestampForFile()}.db`);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);

  return file;
}

export async function exportDatabaseBackup(
  db: SQLiteDatabase,
  input: { userId?: number | null; share?: boolean } = {}
) {
  const file = await writeDatabaseBackup(db, 'storemate-pos-backup', input.userId, true);
  let shared = false;

  if (input.share) {
    const available = await Sharing.isAvailableAsync();

    if (available) {
      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Export StoreMate POS database backup',
        mimeType: 'application/octet-stream',
        UTI: 'public.database',
      });
      shared = true;
    }
  }

  return {
    uri: file.uri,
    name: fileNameFromUri(file.uri),
    size: file.size,
    shared,
  };
}

export async function importDatabaseBackup(
  db: SQLiteDatabase,
  input: { userId?: number | null } = {}
) {
  const picked = await File.pickFileAsync(undefined, 'application/octet-stream');
  const pickedFile = Array.isArray(picked) ? picked[0] : picked;

  if (!pickedFile) {
    throw new Error('No backup file selected.');
  }

  const safetyBackup = await writeDatabaseBackup(db, 'storemate-pos-before-import', input.userId, false);
  const importedDb = await deserializeDatabaseAsync(await pickedFile.bytes());

  try {
    const integrity = await importedDb.getFirstAsync<{ integrity_check: string }>(
      'PRAGMA integrity_check'
    );

    if (integrity?.integrity_check !== 'ok') {
      throw new Error('Selected backup failed SQLite integrity check.');
    }

    await backupDatabaseAsync({
      sourceDatabase: importedDb,
      destDatabase: db,
    });
    await initializeDatabase(db);

    const restoredUser = input.userId
      ? await db.getFirstAsync<{ id: number }>('SELECT id FROM users WHERE id = ?', input.userId)
      : null;

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, metadata_json)
       VALUES (?, ?, ?, ?)`,
      restoredUser?.id ?? null,
      'database_imported',
      'database',
      JSON.stringify({ sourceName: fileNameFromUri(pickedFile.uri), safetyBackupUri: safetyBackup.uri })
    );

    return {
      sourceName: fileNameFromUri(pickedFile.uri),
      safetyBackupUri: safetyBackup.uri,
    };
  } finally {
    await importedDb.closeAsync();
  }
}
