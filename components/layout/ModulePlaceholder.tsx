import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '@/constants/theme';
import { Card } from '@/components/ui/Card';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon: IconName;
  title: string;
  description: string;
  items: string[];
};

export function ModulePlaceholder({ icon, title, description, items }: Props) {
  return (
    <Card style={styles.card}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={28} color={palette.primaryDark} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.list}>
        {items.map((item) => (
          <View key={item} style={styles.item}>
            <View style={styles.dot} />
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    gap: spacing.md,
    maxWidth: 760,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: palette.successSoft,
    borderRadius: 8,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  copy: {
    gap: spacing.xs,
  },
  title: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  description: {
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    backgroundColor: palette.primary,
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  itemText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '700',
  },
});
