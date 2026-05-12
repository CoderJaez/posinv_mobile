import type { SQLiteDatabase } from 'expo-sqlite';

import { verifyPin } from '@/lib/auth/pin';

import type { AuthUser, UserListItem } from './types';

export async function getLoginUsers(db: SQLiteDatabase) {
  return db.getAllAsync<UserListItem>(
    `SELECT id, full_name, username, role, status, last_login_at, avatar_color
     FROM users
     WHERE status = 'active'
     ORDER BY
       CASE role
         WHEN 'cashier' THEN 1
         WHEN 'supervisor' THEN 2
         ELSE 3
       END,
       full_name ASC`
  );
}

export async function getUserById(db: SQLiteDatabase, userId: number) {
  return db.getFirstAsync<UserListItem>(
    `SELECT id, full_name, username, role, status, last_login_at, avatar_color
     FROM users
     WHERE id = ?`,
    userId
  );
}

export async function authenticateUser(db: SQLiteDatabase, userId: number, pin: string) {
  const user = await db.getFirstAsync<AuthUser>(
    `SELECT id, full_name, username, pin_hash, role, status, last_login_at, avatar_color
     FROM users
     WHERE id = ? AND status = 'active'`,
    userId
  );

  if (!user) {
    return { ok: false as const, message: 'Selected user is inactive or missing.' };
  }

  const validPin = await verifyPin(pin, user.pin_hash);

  if (!validPin) {
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      user.id,
      'pin_login_failed',
      'user',
      user.id,
      JSON.stringify({ username: user.username })
    );

    return { ok: false as const, message: 'Invalid PIN.' };
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', user.id);
    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      user.id,
      'pin_login_success',
      'user',
      user.id,
      JSON.stringify({ username: user.username, role: user.role })
    );
  });

  const { pin_hash: _pinHash, ...safeUser } = user;

  return {
    ok: true as const,
    user: {
      ...safeUser,
      last_login_at: new Date().toISOString(),
    },
  };
}
