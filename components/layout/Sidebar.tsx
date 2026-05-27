import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import type { ComponentProps } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { palette, radii, spacing } from "@/constants/theme";
import { useAppStore } from "@/lib/store/app-store";
import { FlatList } from "react-native-gesture-handler";

type IconName = ComponentProps<typeof Ionicons>["name"];

const navItems: { label: string; href: string; icon: IconName }[] = [
  { label: "POS", href: "/", icon: "storefront-outline" },
  { label: "Held Orders", href: "/hold-transactions", icon: "archive-outline" },
  { label: "Shift Summary", href: "/shift-summary", icon: "wallet-outline" },
  { label: "Inventory", href: "/inventory", icon: "file-tray-stacked-outline" },
  { label: "Reports", href: "/reports", icon: "bar-chart-outline" },
  { label: "Customers", href: "/customers", icon: "people-outline" },
  { label: "Suppliers", href: "/suppliers", icon: "cube-outline" },
  { label: "Promotions", href: "/promotions", icon: "pricetag-outline" },
  { label: "Users & Shifts", href: "/users", icon: "person-circle-outline" },
  { label: "Prepaid", href: "/prepaid", icon: "card-outline" },
  { label: "Settings", href: "/settings", icon: "settings-outline" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentShift = useAppStore((state) => state.currentShift);
  const currentUser = useAppStore((state) => state.currentUser);
  const clearSession = useAppStore((state) => state.clearSession);
  const { width } = useWindowDimensions();
  const compact = width < 860;
  const sidebarWidth = compact ? 78 : 208;

  return (
    <View style={[styles.sidebar, { width: sidebarWidth }]}>
      <View style={styles.brand}>
        <View style={styles.logoMark}>
          <Image
            source={require("../../assets/images/akini-icon.png")}
            style={{ width: 22, height: 22 }}
          />
        </View>
        {!compact ? (
          <View style={styles.brandTextGroup}>
            <Text style={styles.brandTitle}>Akini POS</Text>
            <Text style={styles.brandSubtitle}>Smart POS System</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.nav}>
        <FlatList
          data={navItems}
          keyExtractor={(item) => item.href}
          renderItem={({ item }) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(item.href as never)}
                style={({ pressed }) => [
                  styles.navItem,
                  compact && styles.navItemCompact,
                  active && styles.navItemActive,
                  pressed && styles.navItemPressed,
                ]}
              >
                <Ionicons name={item.icon} size={20} color={palette.surface} />
                {!compact ? (
                  <Text style={styles.navText}>{item.label}</Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>

      <View style={styles.onlineCard}>
        <View style={styles.onlineRow}>
          <View style={styles.onlineDot} />
          {!compact ? (
            <Text style={styles.onlineText}>Offline Ready</Text>
          ) : null}
        </View>
        {!compact ? (
          <>
            <Text style={styles.syncLabel}>
              {currentUser?.full_name ?? "No user"}
            </Text>
            <Text style={styles.syncText}>
              {currentShift ? `Shift #${currentShift.id}` : "No active shift"}
            </Text>
            <Pressable
              onPress={async () => {
                await clearSession();
                router.replace("/login" as never);
              }}
              style={styles.logoutButton}
            >
              <Ionicons
                name="log-out-outline"
                size={16}
                color={palette.surface}
              />
              <Text style={styles.logoutText}>Logout</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    backgroundColor: palette.sidebar,
    borderRightColor: "#0C344C",
    borderRightWidth: 1,
    gap: spacing.lg,
    padding: spacing.md,
  },
  brand: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 56,
  },
  logoMark: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: radii.sm,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  brandTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  brandTitle: {
    color: palette.surface,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0,
  },
  brandSubtitle: {
    color: "#B8C7D1",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0,
  },
  nav: {
    flex: 1,
    gap: spacing.xs,
  },
  navItem: {
    alignItems: "center",
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  navItemCompact: {
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  navItemActive: {
    backgroundColor: palette.primary,
  },
  navItemPressed: {
    opacity: 0.8,
  },
  navText: {
    color: palette.surface,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0,
  },
  onlineCard: {
    backgroundColor: palette.sidebarSurface,
    borderColor: "#16445C",
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.xxs,
    minHeight: 78,
    padding: spacing.sm,
  },
  onlineRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  onlineDot: {
    backgroundColor: palette.primary,
    borderRadius: radii.pill,
    height: 9,
    width: 9,
  },
  onlineText: {
    color: palette.surface,
    fontSize: 12,
    fontWeight: "800",
  },
  syncLabel: {
    color: "#B8C7D1",
    fontSize: 10,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  syncText: {
    color: palette.surface,
    fontSize: 11,
    fontWeight: "700",
  },
  logoutButton: {
    alignItems: "center",
    borderColor: "#24566D",
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.xs,
  },
  logoutText: {
    color: palette.surface,
    fontSize: 11,
    fontWeight: "800",
  },
});
