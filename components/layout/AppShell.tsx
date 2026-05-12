import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, spacing } from '@/constants/theme';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  scroll?: boolean;
}>;

export function AppShell({ title, subtitle, actions, children, scroll = true }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const contentPadding = compact ? spacing.sm : spacing.lg;

  const content = (
    <View style={[styles.content, { padding: contentPadding }]}>
      <Header title={title} subtitle={subtitle} actions={actions} />
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <Sidebar />
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
        ) : (
          content
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: palette.canvas,
    flex: 1,
  },
  root: {
    backgroundColor: palette.canvas,
    flex: 1,
    flexDirection: 'row',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
  },
});
