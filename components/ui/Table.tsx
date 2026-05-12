import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type ViewStyle,
} from 'react-native';

import { palette, spacing } from '@/constants/theme';

export type TableColumn<T> = {
  key: string;
  title: string;
  accessor?: keyof T;
  width?: DimensionValue;
  flex?: number;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => ReactNode;
};

type Props<T> = {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  emptyLabel?: string;
  style?: ViewStyle;
};

export function Table<T extends object>({
  columns,
  data,
  keyExtractor,
  emptyLabel = 'No records found.',
  style,
}: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style}>
      <View style={styles.table}>
        <View style={styles.headerRow}>
          {columns.map((column) => (
            <View key={column.key} style={[styles.cell, getColumnStyle(column)]}>
              <Text style={[styles.headerText, getTextAlign(column.align)]}>{column.title}</Text>
            </View>
          ))}
        </View>

        {data.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{emptyLabel}</Text>
          </View>
        ) : (
          data.map((row, index) => (
            <View key={keyExtractor(row, index)} style={styles.row}>
              {columns.map((column) => (
                <View key={column.key} style={[styles.cell, getColumnStyle(column)]}>
                  {column.render ? (
                    column.render(row)
                  ) : (
                    <Text style={[styles.bodyText, getTextAlign(column.align)]} numberOfLines={1}>
                      {String(column.accessor ? row[column.accessor] ?? '' : '')}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function getColumnStyle<T>(column: TableColumn<T>) {
  return {
    flex: column.flex,
    width: column.width,
  };
}

function getTextAlign(align: TableColumn<unknown>['align']) {
  return {
    textAlign: align ?? 'left',
  } as const;
}

const styles = StyleSheet.create({
  table: {
    minWidth: 720,
  },
  headerRow: {
    backgroundColor: palette.canvas,
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  row: {
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 48,
  },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  headerText: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  bodyText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  empty: {
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  emptyText: {
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
