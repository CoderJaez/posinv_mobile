import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { radii, spacing, statusPalette } from '@/constants/theme';

type BadgeStatus = keyof typeof statusPalette;

type Props = {
  status: BadgeStatus;
  label?: string;
  style?: ViewStyle;
};

export function Badge({ status, label, style }: Props) {
  const colors = statusPalette[status];

  return (
    <View style={[styles.badge, { backgroundColor: colors.background }, style]}>
      <Text style={[styles.text, { color: colors.color }]}>{label ?? colors.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
