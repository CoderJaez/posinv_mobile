import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { DATABASE_NAME, initializeDatabase } from "@/lib/database";

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#F5F8FA",
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navigationTheme}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={initializeDatabase}>
          <AuthBootstrap>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="shift-start" />
              <Stack.Screen name="shift-summary" />
              <Stack.Screen name="index" />
              <Stack.Screen name="payment" />
              <Stack.Screen name="cash-payment" />
              <Stack.Screen name="payment-success" />
              <Stack.Screen name="hold-transactions" />
              <Stack.Screen name="inventory" />
              <Stack.Screen name="product-details" />
              <Stack.Screen name="product-form" />
              <Stack.Screen name="adjust-stock" />
              <Stack.Screen name="reports" />
              <Stack.Screen name="sales-report-details" />
              <Stack.Screen name="stock-in" />
              <Stack.Screen name="customers" />
              <Stack.Screen name="suppliers" />
              <Stack.Screen name="promotions" />
              <Stack.Screen name="prepaid" />
              <Stack.Screen name="users" />
              <Stack.Screen name="settings" />
            </Stack>
            <StatusBar style="dark" />
          </AuthBootstrap>
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
