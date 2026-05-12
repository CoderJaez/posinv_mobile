import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { palette, radii, spacing } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = TextInputProps & {
  label?: string;
  icon?: IconName;
  containerStyle?: ViewStyle;
};

export function Input({ label, icon, containerStyle, style, ...inputProps }: Props) {
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.field}>
        {icon ? <Ionicons name={icon} size={18} color={palette.inkMuted} /> : null}
        <TextInput
          placeholderTextColor="#8B98A2"
          style={[styles.input, style]}
          {...inputProps}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  field: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 46,
    paddingHorizontal: spacing.sm,
  },
  input: {
    color: palette.ink,
    flex: 1,
    fontSize: 14,
    minWidth: 0,
    paddingVertical: 0,
  },
});
