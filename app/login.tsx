import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import {
  Controller,
  useForm,
  type ControllerRenderProps,
} from "react-hook-form";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { palette, radii, spacing } from "@/constants/theme";
import { formatRole } from "@/lib/auth/roles";
import { authenticateUser, getLoginUsers } from "@/lib/database/auth";
import { getOpenShiftForUser } from "@/lib/database/shifts";
import type { UserListItem } from "@/lib/database/types";
import { formatDateTime } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";

type LoginForm = {
  pin: string;
};

export default function LoginScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const setSession = useAppStore((state) => state.setSession);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const compact = width < 820;

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<LoginForm>({
    defaultValues: { pin: "" },
  });

  useEffect(() => {
    let mounted = true;

    getLoginUsers(db)
      .then((nextUsers) => {
        if (mounted) {
          setUsers(nextUsers);
          setSelectedUserId(nextUsers[0]?.id ?? null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingUsers(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [db]);

  async function onSubmit(values: LoginForm) {
    if (!selectedUserId) {
      setAuthError("Select a user to continue.");
      return;
    }

    setAuthError(null);
    const result = await authenticateUser(db, selectedUserId, values.pin);

    if (!result.ok) {
      setAuthError(result.message);
      reset({ pin: "" });
      return;
    }

    const openShift = await getOpenShiftForUser(db, result.user.id);
    await setSession(result.user, openShift);
    router.replace((openShift ? "/" : "/shift-start") as never);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.root, compact && styles.rootCompact]}>
        <View style={styles.brandPane}>
          <View style={styles.logo}>
            <Ionicons name="basket-outline" size={36} color={palette.surface} />
          </View>
          <Text style={styles.brandTitle}>StoreMate</Text>
          <Text style={styles.brandCopy}>
            Offline tablet POS and inventory management for convenience stores.
          </Text>
        </View>

        <Card style={styles.loginCard}>
          <Text style={styles.title}>PIN Login</Text>
          <Text style={styles.subtitle}>
            Choose your cashier profile and enter your local PIN.
          </Text>

          {loadingUsers ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={palette.primary} />
              <Text style={styles.loadingText}>Loading local users...</Text>
            </View>
          ) : (
            <View style={styles.userGrid}>
              {users.map((user) => {
                const active = user.id === selectedUserId;

                return (
                  <Pressable
                    key={user.id}
                    onPress={() => {
                      setSelectedUserId(user.id);
                      setAuthError(null);
                      reset({ pin: "" });
                    }}
                    style={[styles.userCard, active && styles.userCardActive]}
                  >
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: user.avatar_color },
                      ]}
                    >
                      <Text style={styles.avatarText}>
                        {user.full_name.charAt(0)}
                      </Text>
                    </View>
                    <View style={styles.userCopy}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {user.full_name}
                      </Text>
                      <Text style={styles.userMeta}>
                        {formatRole(user.role)} |{" "}
                        {formatDateTime(user.last_login_at)}
                      </Text>
                    </View>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={palette.primary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          <Controller
            control={control}
            name="pin"
            rules={{
              minLength: {
                value: 4,
                message: "PIN must be at least 4 digits.",
              },
              maxLength: {
                value: 6,
                message: "PIN must be no more than 6 digits.",
              },
              pattern: {
                value: /^\d+$/,
                message: "PIN must contain only numbers.",
              },
              required: "PIN is required.",
            }}
            render={({ field }) => <PinPad field={field} />}
          />
          {errors.pin ? (
            <Text style={styles.errorText}>{errors.pin.message}</Text>
          ) : null}
          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

          <Button
            fullWidth
            icon="log-in-outline"
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            size="lg"
            title="Login"
          />
        </Card>
      </View>
    </SafeAreaView>
  );
}

function PinPad({ field }: { field: ControllerRenderProps<LoginForm, "pin"> }) {
  const value = field.value ?? "";
  const keys = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "clear",
    "0",
    "back",
  ];

  function pressKey(key: string) {
    if (key === "clear") {
      field.onChange("");
      return;
    }

    if (key === "back") {
      field.onChange(value.slice(0, -1));
      return;
    }

    if (value.length < 6) {
      field.onChange(`${value}${key}`);
    }
  }

  return (
    <View style={styles.pinBlock}>
      <Text style={styles.pinLabel}>PIN</Text>

      <Pressable
        accessibilityRole="button"
        onPress={field.onBlur}
        style={styles.pinDisplay}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <View
            key={index}
            style={[styles.pinDot, index < value.length && styles.pinDotFilled]}
          />
        ))}
      </Pressable>

      <View style={styles.pinGrid}>
        {keys.map((key) => (
          <Pressable
            accessibilityRole="button"
            key={key}
            onPress={() => pressKey(key)}
            style={({ pressed }) => [
              styles.pinKey,
              pressed && styles.pinKeyPressed,
            ]}
          >
            {key === "back" ? (
              <Ionicons
                name="backspace-outline"
                size={22}
                color={palette.ink}
              />
            ) : (
              <Text
                style={[
                  styles.pinKeyText,
                  key === "clear" && styles.pinKeyMuted,
                ]}
              >
                {key === "clear" ? "Clear" : key}
              </Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: palette.canvas,
    flex: 1,
  },
  root: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.xxl,
    justifyContent: "center",
    padding: spacing.xxl,
  },
  rootCompact: {
    alignItems: "stretch",
    flexDirection: "column",
  },
  brandPane: {
    maxWidth: 360,
  },
  logo: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: radii.md,
    height: 72,
    justifyContent: "center",
    marginBottom: spacing.lg,
    width: 72,
  },
  brandTitle: {
    color: palette.ink,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
  },
  brandCopy: {
    color: palette.inkMuted,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    marginTop: spacing.sm,
  },
  loginCard: {
    gap: spacing.xs,
    maxWidth: 560,
    width: "100%",
  },
  title: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0,
  },
  subtitle: {
    color: palette.inkMuted,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
  },
  loadingBlock: {
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 170,
  },
  loadingText: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  userGrid: {
    gap: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  userCard: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 54,
    width: "48%",
    padding: spacing.sm,
  },
  userCardActive: {
    borderColor: palette.primary,
    borderWidth: 2,
  },
  avatar: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  avatarText: {
    color: palette.surface,
    fontSize: 18,
    fontWeight: "900",
  },
  userCopy: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  userMeta: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  errorText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  pinBlock: {
    gap: spacing.xs,
  },
  pinLabel: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
  },
  pinDisplay: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: spacing.md,
  },
  pinDot: {
    backgroundColor: palette.borderStrong,
    borderRadius: radii.pill,
    height: 12,
    width: 12,
  },
  pinDotFilled: {
    backgroundColor: palette.primary,
  },
  pinGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pinKey: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexBasis: "31%",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  pinKeyPressed: {
    backgroundColor: palette.muted,
  },
  pinKeyText: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  pinKeyMuted: {
    color: palette.inkMuted,
    fontSize: 13,
  },
});
