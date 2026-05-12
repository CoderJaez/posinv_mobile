import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { palette, spacing } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  title: string;
  description?: string;
  icon?: IconName;
  loading?: boolean;
  style?: ViewStyle;
};

export function ScreenState({
  title,
  description,
  icon = 'information-circle-outline',
  loading,
  style,
}: Props) {
  return (
    <View style={[styles.state, style]}>
      {loading ? (
        <ActivityIndicator color={palette.primary} />
      ) : (
        <Ionicons name={icon} size={30} color={palette.inkMuted} />
      )}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  state: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 180,
    padding: spacing.lg,
  },
  title: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    maxWidth: 420,
    textAlign: 'center',
  },
});
