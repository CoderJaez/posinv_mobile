import type { SQLiteDatabase } from 'expo-sqlite';

import { hashPin, verifyPin } from '@/lib/auth/pin';

import type { AuthUser, UserRole } from './types';

export type UserFormInput = {
  fullName: string;
  username: string;
  role: UserRole;
  status: 'active' | 'inactive';
  pin?: string | null;
  avatarColor: string;
  actorId: number;
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function validateUserInput(input: UserFormInput, creating: boolean) {
  if (!input.fullName.trim()) {
    throw new Error('Full name is required.');
  }

  if (!input.username.trim()) {
    throw new Error('Username is required.');
  }

  if (creating || input.pin) {
    if (!input.pin || !/^\d{4,6}$/.test(input.pin)) {
      throw new Error('PIN must be 4 to 6 digits.');
    }
  }
}

async function ensureActiveAdminRemains(
  db: SQLiteDatabase,
  userId: number,
  nextRole: UserRole,
  nextStatus: 'active' | 'inactive'
) {
  const currentUser = await db.getFirstAsync<{ role: UserRole; status: 'active' | 'inactive' }>(
    'SELECT role, status FROM users WHERE id = ?',
    userId
  );

  if (!currentUser || currentUser.role !== 'admin' || currentUser.status !== 'active') {
    return;
  }

  if (nextRole === 'admin' && nextStatus === 'active') {
    return;
  }

  const otherActiveAdmins = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM users
     WHERE role = 'admin'
       AND status = 'active'
       AND id != ?`,
    userId
  );

  if ((otherActiveAdmins?.count ?? 0) === 0) {
    throw new Error('At least one active admin user is required.');
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes('unique');
}

export async function createUser(db: SQLiteDatabase, input: UserFormInput) {
  validateUserInput(input, true);

  let userId = 0;
  const username = normalizeUsername(input.username);
  const pinHash = await hashPin(input.pin ?? '');

  await db.withTransactionAsync(async () => {
    try {
      const result = await db.runAsync(
        `INSERT INTO users
          (full_name, username, pin_hash, role, status, avatar_color)
         VALUES (?, ?, ?, ?, ?, ?)`,
        input.fullName.trim(),
        username,
        pinHash,
        input.role,
        input.status,
        input.avatarColor
      );

      userId = result.lastInsertRowId;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error('Username is already in use.');
      }

      throw error;
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.actorId,
      'user_created',
      'user',
      userId,
      JSON.stringify({ username, role: input.role, status: input.status })
    );
  });

  return userId;
}

export async function updateUser(
  db: SQLiteDatabase,
  userId: number,
  input: UserFormInput
) {
  validateUserInput(input, false);
  await ensureActiveAdminRemains(db, userId, input.role, input.status);

  const username = normalizeUsername(input.username);
  const nextPinHash = input.pin ? await hashPin(input.pin) : null;

  await db.withTransactionAsync(async () => {
    try {
      if (nextPinHash) {
        await db.runAsync(
          `UPDATE users
           SET full_name = ?,
               username = ?,
               pin_hash = ?,
               role = ?,
               status = ?,
               avatar_color = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          input.fullName.trim(),
          username,
          nextPinHash,
          input.role,
          input.status,
          input.avatarColor,
          userId
        );
      } else {
        await db.runAsync(
          `UPDATE users
           SET full_name = ?,
               username = ?,
               role = ?,
               status = ?,
               avatar_color = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          input.fullName.trim(),
          username,
          input.role,
          input.status,
          input.avatarColor,
          userId
        );
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error('Username is already in use.');
      }

      throw error;
    }

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.actorId,
      'user_updated',
      'user',
      userId,
      JSON.stringify({
        username,
        role: input.role,
        status: input.status,
        pinReset: Boolean(nextPinHash),
      })
    );
  });
}

export async function verifyAdminPin(db: SQLiteDatabase, pin: string) {
  if (!/^\d{4,6}$/.test(pin.trim())) {
    throw new Error('Enter a valid admin PIN.');
  }

  const admins = await db.getAllAsync<AuthUser>(
    `SELECT id, full_name, username, pin_hash, role, status, last_login_at, avatar_color
     FROM users
     WHERE role = 'admin'
       AND status = 'active'
     ORDER BY id ASC`
  );

  for (const admin of admins) {
    if (await verifyPin(pin.trim(), admin.pin_hash)) {
      return admin;
    }
  }

  throw new Error('Admin PIN was not accepted.');
}
