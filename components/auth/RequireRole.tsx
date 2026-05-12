import type { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/ui/Card';
import { palette, spacing } from '@/constants/theme';
import type { UserRole } from '@/lib/database/types';
import { useAppStore } from '@/lib/store/app-store';

type Props = PropsWithChildren<{
  roles: UserRole[];
}>;

export function RequireRole({ children, roles }: Props) {
  const currentUser = useAppStore((state) => state.currentUser);

  if (!currentUser || !roles.includes(currentUser.role)) {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>Access restricted</Text>
        <Text style={styles.body}>
          This screen requires {roles.join(' or ')} access. Switch to a supervisor or admin user
          to continue.
        </Text>
      </Card>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    maxWidth: 520,
  },
  title: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  body: {
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
});
