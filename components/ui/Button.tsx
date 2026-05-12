import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { palette, radii, spacing } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';
type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  rightIcon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  children?: ReactNode;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  rightIcon,
  disabled,
  loading,
  fullWidth,
  style,
  textStyle,
}: Props) {
  const colors = variantStyles[variant];
  const isInactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isInactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: isInactive ? 0.55 : pressed ? 0.88 : 1,
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={18} color={colors.text} /> : null}
          <Text style={[styles.label, { color: colors.text }, textStyle]} numberOfLines={1}>
            {title}
          </Text>
          {rightIcon ? <Ionicons name={rightIcon} size={18} color={colors.text} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const variantStyles = {
  primary: {
    background: palette.primary,
    border: palette.primary,
    text: palette.surface,
  },
  secondary: {
    background: palette.muted,
    border: palette.border,
    text: palette.ink,
  },
  danger: {
    background: palette.danger,
    border: palette.danger,
    text: palette.surface,
  },
  ghost: {
    background: 'transparent',
    border: 'transparent',
    text: palette.inkMuted,
  },
  outline: {
    background: palette.surface,
    border: palette.borderStrong,
    text: palette.primaryDark,
  },
};

const sizeStyles = StyleSheet.create({
  sm: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  md: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  lg: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
});
