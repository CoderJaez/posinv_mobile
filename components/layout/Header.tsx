import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '@/constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function Header({ title, subtitle, actions }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.titleGroup}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 58,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
    marginTop: 2,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
