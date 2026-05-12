import { usePathname, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, spacing } from '@/constants/theme';
import { getUserById } from '@/lib/database/auth';
import { getOpenShiftForUser } from '@/lib/database/shifts';
import { getStoredSession, useAppStore } from '@/lib/store/app-store';

const noShiftRoutes = ['/login', '/shift-start', '/shift-summary'];

export function AuthBootstrap({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const router = useRouter();
  const pathname = usePathname();
  const { currentShift, currentUser, hydrateSession, hydrated } = useAppStore();

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      const storedSession = await getStoredSession();

      if (!storedSession) {
        if (mounted) {
          hydrateSession({ user: null, shift: null });
        }
        return;
      }

      const user = await getUserById(db, storedSession.userId);
      const shift = user ? await getOpenShiftForUser(db, user.id) : null;

      if (mounted) {
        hydrateSession({ user, shift });
      }
    }

    hydrate();

    return () => {
      mounted = false;
    };
  }, [db, hydrateSession]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!currentUser && pathname !== '/login') {
      router.replace('/login' as never);
      return;
    }

    if (currentUser && pathname === '/login') {
      router.replace((currentShift ? '/' : '/shift-start') as never);
      return;
    }

    if (currentUser && !currentShift && !noShiftRoutes.includes(pathname)) {
      router.replace('/shift-start' as never);
      return;
    }

    if (currentUser && currentShift && pathname === '/shift-start') {
      router.replace('/' as never);
    }
  }, [currentShift, currentUser, hydrated, pathname, router]);

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <ActivityIndicator color={palette.primary} size="large" />
        <Text style={styles.loadingText}>Opening local register...</Text>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingRoot: {
    alignItems: 'center',
    backgroundColor: palette.canvas,
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  loadingText: {
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: '700',
  },
});
