import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

import { palette, radii, spacing } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
  icon?: IconName;
  containerStyle?: ViewStyle;
};

function parseDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function DateInput({
  label,
  value,
  onChangeText,
  placeholder = 'YYYY-MM-DD',
  minimumDate,
  maximumDate,
  disabled,
  icon = 'calendar-outline',
  containerStyle,
}: Props) {
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const selectedDate = useMemo(() => parseDate(value) ?? new Date(), [value]);
  const displayValue = value || placeholder;

  function commitDate(date: Date) {
    onChangeText(formatDate(date));
  }

  function openPicker() {
    if (disabled) {
      return;
    }

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: selectedDate,
        mode: 'date',
        display: 'calendar',
        minimumDate,
        maximumDate,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) {
            commitDate(date);
          }
        },
      });
      return;
    }

    setShowIOSPicker((visible) => !visible);
  }

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.field,
          disabled && styles.fieldDisabled,
          pressed && !disabled && styles.fieldPressed,
        ]}>
        <Ionicons name={icon} size={18} color={palette.inkMuted} />
        {Platform.OS === 'web' ? (
          <TextInput
            editable={!disabled}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#8B98A2"
            style={styles.webInput}
            value={value}
          />
        ) : (
          <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
            {displayValue}
          </Text>
        )}
        {value ? (
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onChangeText('')}
            style={styles.clearButton}>
            <Ionicons name="close-circle" size={18} color={palette.inkMuted} />
          </Pressable>
        ) : null}
      </Pressable>
      {Platform.OS === 'ios' && showIOSPicker ? (
        <DateTimePicker
          display="inline"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          mode="date"
          onChange={(_, date) => {
            if (date) {
              commitDate(date);
            }
          }}
          value={selectedDate}
        />
      ) : null}
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
  fieldPressed: {
    borderColor: palette.primary,
  },
  fieldDisabled: {
    backgroundColor: palette.muted,
    opacity: 0.65,
  },
  value: {
    color: palette.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 0,
  },
  placeholder: {
    color: '#8B98A2',
    fontWeight: '500',
  },
  clearButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  webInput: {
    color: palette.ink,
    flex: 1,
    fontSize: 14,
    minWidth: 0,
    paddingVertical: 0,
  },
});
