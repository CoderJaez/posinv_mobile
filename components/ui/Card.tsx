import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { palette, radii, shadows, spacing } from '@/constants/theme';

type Props = PropsWithChildren<{
  style?: ViewStyle;
  padded?: boolean;
}>;

export function Card({ children, style, padded = true }: Props) {
  return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.md,
    borderWidth: 1,
    ...shadows.card,
  },
  padded: {
    padding: spacing.md,
  },
});
