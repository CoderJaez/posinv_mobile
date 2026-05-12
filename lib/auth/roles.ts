import type { UserRole } from '@/lib/database/types';

const roleRank: Record<UserRole, number> = {
  cashier: 1,
  supervisor: 2,
  admin: 3,
};

export function hasRole(currentRole: UserRole | undefined, allowedRoles: UserRole[]) {
  if (!currentRole) {
    return false;
  }

  return allowedRoles.includes(currentRole);
}

export function hasMinimumRole(currentRole: UserRole | undefined, minimumRole: UserRole) {
  if (!currentRole) {
    return false;
  }

  return roleRank[currentRole] >= roleRank[minimumRole];
}

export function formatRole(role: UserRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
