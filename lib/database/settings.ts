import type { SQLiteDatabase } from 'expo-sqlite';

import type { AppSetting, AuditLogItem } from './types';

export async function getSettingsMap(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<AppSetting>(
    `SELECT key, value, updated_at
     FROM app_settings
     ORDER BY key ASC`
  );

  return rows.reduce<Record<string, string>>((settings, row) => {
    settings[row.key] = row.value ?? '';
    return settings;
  }, {});
}

export async function saveSettings(
  db: SQLiteDatabase,
  input: { userId: number; values: Record<string, string> }
) {
  const entries = Object.entries(input.values);

  if (entries.length === 0) {
    return;
  }

  await db.withTransactionAsync(async () => {
    for (const [key, value] of entries) {
      await db.runAsync(
        `INSERT OR REPLACE INTO app_settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        key,
        value
      );
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, metadata_json)
       VALUES (?, ?, ?, ?)`,
      input.userId,
      'settings_updated',
      'app_settings',
      JSON.stringify({ keys: entries.map(([key]) => key) })
    );
  });
}

export async function getAuditLogs(db: SQLiteDatabase, limit = 50) {
  return db.getAllAsync<AuditLogItem>(
    `SELECT
       audit_logs.id,
       audit_logs.user_id,
       users.full_name as user_name,
       audit_logs.action,
       audit_logs.entity_type,
       audit_logs.entity_id,
       audit_logs.metadata_json,
       audit_logs.created_at
     FROM audit_logs
     LEFT JOIN users ON users.id = audit_logs.user_id
     ORDER BY audit_logs.created_at DESC
     LIMIT ?`,
    limit
  );
}
