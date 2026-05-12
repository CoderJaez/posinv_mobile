import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { Shift, UserListItem } from '@/lib/database/types';

const SESSION_KEY = 'storemate.session.v1';

type StoredSession = {
  userId: number;
  shiftId: number | null;
};

type AppState = {
  currentUser: UserListItem | null;
  currentShift: Shift | null;
  hydrated: boolean;
  sidebarCollapsed: boolean;
  hydrateSession: (session: { user: UserListItem | null; shift: Shift | null }) => void;
  setSession: (user: UserListItem, shift?: Shift | null) => Promise<void>;
  setCurrentShift: (shift: Shift | null) => Promise<void>;
  clearSession: () => Promise<void>;
  toggleSidebar: () => void;
};

export async function getStoredSession() {
  const value = await AsyncStorage.getItem(SESSION_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as StoredSession;
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
}

async function persistSession(userId: number, shiftId: number | null) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ userId, shiftId }));
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: null,
  currentShift: null,
  hydrated: false,
  sidebarCollapsed: false,
  hydrateSession: ({ user, shift }) =>
    set({
      currentUser: user,
      currentShift: shift,
      hydrated: true,
    }),
  setSession: async (user, shift = null) => {
    await persistSession(user.id, shift?.id ?? null);
    set({ currentUser: user, currentShift: shift, hydrated: true });
  },
  setCurrentShift: async (shift) => {
    const user = get().currentUser;

    if (user) {
      await persistSession(user.id, shift?.id ?? null);
    }

    set({ currentShift: shift });
  },
  clearSession: async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    set({ currentUser: null, currentShift: null, hydrated: true });
  },
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
