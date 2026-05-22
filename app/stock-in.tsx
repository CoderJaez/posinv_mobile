import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { RequireRole } from "@/components/auth/RequireRole";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { palette, radii, spacing } from "@/constants/theme";
import {
  getRecentDeliveries,
  getSuppliers,
  saveDelivery,
  type DeliveryItemInput,
} from "@/lib/database/inventory";
import { getCategories, getProducts } from "@/lib/database/queries";
import type {
  Category,
  DeliveryListItem,
  ProductListItem,
  Supplier,
} from "@/lib/database/types";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";

type DeliveryHeaderForm = {
  invoiceNumber: string;
  deliveryDate: string;
};

type DeliveryItemForm = {
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  unitCost: string;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function StockInScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const currentShift = useAppStore((state) => state.currentShift);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(
    null,
  );
  const [activeCategory, setActiveCategory] = useState("All");

  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null,
  );
  const [items, setItems] = useState<DeliveryItemInput[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const headerForm = useForm<DeliveryHeaderForm>({
    defaultValues: {
      invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      deliveryDate: todayDate(),
    },
  });
  const itemForm = useForm<DeliveryItemForm>({
    defaultValues: {
      batchNumber: "",
      expiryDate: "",
      quantity: "",
      unitCost: "",
    },
  });

  const refresh = useCallback(async () => {
    const [nextSuppliers, nextProducts, nextCategories, nextDeliveries] =
      await Promise.all([
        getSuppliers(db),
        getProducts(db),
        getCategories(db),
        getRecentDeliveries(db, 6),
      ]);
    setSuppliers(nextSuppliers);
    setProducts(nextProducts);
    setCategories(nextCategories);
    setDeliveries(nextDeliveries);
    setSelectedSupplierId(
      (previous) => previous ?? nextSuppliers[0]?.id ?? null,
    );
    setSelectedProductId((previous) => previous ?? nextProducts[0]?.id ?? null);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        activeCategory === "All" || product.category_name === activeCategory;

      return matchesCategory;
    });
  }, [activeCategory, products]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );
  const total = items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );

  function addItem(values: DeliveryItemForm) {
    if (!selectedProductId || !selectedProduct) {
      setMessage("Select a product.");
      return;
    }

    const quantity = Number(values.quantity);
    const unitCost = Number(values.unitCost);

    if (quantity <= 0 || unitCost < 0) {
      setMessage("Quantity must be positive and unit cost cannot be negative.");
      return;
    }

    setItems((currentItems) => [
      ...currentItems,
      {
        productId: selectedProductId,
        batchNumber:
          values.batchNumber.trim() || `B${Date.now().toString().slice(-6)}`,
        expiryDate: values.expiryDate || null,
        quantity,
        unitCost,
      },
    ]);
    setMessage(null);
    itemForm.reset({
      batchNumber: "",
      expiryDate: "",
      quantity: "",
      unitCost: String(selectedProduct.regular_price),
    });
  }

  async function saveCurrentDelivery(values: DeliveryHeaderForm) {
    if (!currentUser || !selectedSupplierId) {
      return;
    }

    try {
      const deliveryId = await saveDelivery(db, {
        supplierId: selectedSupplierId,
        invoiceNumber: values.invoiceNumber,
        deliveryDate: values.deliveryDate,
        createdBy: currentUser.id,
        shiftId: currentShift?.id ?? null,
        items,
      });
      setMessage(`Delivery #${deliveryId} saved.`);
      setItems([]);
      headerForm.reset({
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        deliveryDate: todayDate(),
      });
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save delivery.",
      );
    }
  }

  return (
    <AppShell
      title="Stock In (Delivery)"
      subtitle="Record supplier deliveries and automatically increase stock"
      actions={
        <>
          <Button
            title="Suppliers"
            variant="secondary"
            icon="cube-outline"
            onPress={() => router.push("/suppliers" as never)}
          />
          <Button
            title="Save Delivery"
            icon="save-outline"
            onPress={headerForm.handleSubmit(saveCurrentDelivery)}
          />
        </>
      }
    >
      <RequireRole roles={["supervisor", "admin"]}>
        <View style={styles.grid}>
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Delivery Header</Text>
            <Text style={styles.blockLabel}>Supplier</Text>
            <View style={styles.pillRow}>
              {suppliers.map((supplier) => (
                <Pressable
                  key={supplier.id}
                  onPress={() => setSelectedSupplierId(supplier.id)}
                  style={[
                    styles.pill,
                    selectedSupplierId === supplier.id && styles.pillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      selectedSupplierId === supplier.id &&
                        styles.pillTextActive,
                    ]}
                  >
                    {supplier.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Controller
              control={headerForm.control}
              name="invoiceNumber"
              rules={{ required: "Invoice number is required." }}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Invoice #"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <Controller
              control={headerForm.control}
              name="deliveryDate"
              rules={{ required: "Delivery date is required." }}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Delivery Date"
                  placeholder="YYYY-MM-DD"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />

            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Grand Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
            </View>
          </Card>

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Add Product</Text>

            <View>
              <View style={styles.pillRow}>
                {["All", ...categories.map((category) => category.name)].map(
                  (category) => (
                    <Pressable
                      key={category}
                      onPress={() => setActiveCategory(category)}
                      style={[
                        styles.categoryPill,
                        activeCategory === category &&
                          styles.categoryPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.categoryText,
                          activeCategory === category &&
                            styles.categoryTextActive,
                        ]}
                      >
                        {category}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>
            </View>
            <Text style={styles.blockLabel}>Product</Text>
            <View style={styles.productList}>
              {visibleProducts.map((product) => (
                <Pressable
                  key={product.id}
                  onPress={() => {
                    setSelectedProductId(product.id);
                    itemForm.setValue(
                      "unitCost",
                      String(product.regular_price),
                    );
                  }}
                  style={[
                    styles.productChip,
                    selectedProductId === product.id &&
                      styles.productChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.productChipText,
                      selectedProductId === product.id &&
                        styles.productChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {product.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Controller
              control={itemForm.control}
              name="batchNumber"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Batch Number"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <Controller
              control={itemForm.control}
              name="expiryDate"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Expiry Date"
                  placeholder="YYYY-MM-DD"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
            <View style={styles.inlineFields}>
              <Controller
                control={itemForm.control}
                name="quantity"
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Quantity"
                    keyboardType="number-pad"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    containerStyle={styles.inlineInput}
                  />
                )}
              />
              <Controller
                control={itemForm.control}
                name="unitCost"
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Unit Cost"
                    keyboardType="decimal-pad"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    containerStyle={styles.inlineInput}
                  />
                )}
              />
            </View>
            <Button
              fullWidth
              icon="add"
              title="Add Product"
              onPress={itemForm.handleSubmit(addItem)}
            />
          </Card>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Card style={styles.itemsCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Delivery Items</Text>
            <Text style={styles.mutedText}>Total items: {items.length}</Text>
          </View>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons
                name="clipboard-outline"
                size={32}
                color={palette.inkMuted}
              />
              <Text style={styles.mutedText}>No products added yet.</Text>
            </View>
          ) : (
            items.map((item, index) => {
              const product = products.find(
                (entry) => entry.id === item.productId,
              );

              return (
                <View key={`${item.productId}-${index}`} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>
                      {product?.name ?? "Product"}
                    </Text>
                    <Text style={styles.mutedText}>
                      Batch {item.batchNumber} · Expiry {item.expiryDate || "-"}
                    </Text>
                  </View>
                  <Text style={styles.itemQty}>{item.quantity}</Text>
                  <Text style={styles.itemAmount}>
                    {formatCurrency(item.quantity * item.unitCost)}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setItems((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    style={styles.removeButton}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={palette.danger}
                    />
                  </Pressable>
                </View>
              );
            })
          )}
        </Card>

        <Card style={styles.itemsCard}>
          <Text style={styles.sectionTitle}>Recent Deliveries</Text>
          {deliveries.map((delivery) => (
            <View key={delivery.id} style={styles.deliveryRow}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemName}>{delivery.supplier_name}</Text>
                <Text style={styles.mutedText}>
                  {delivery.invoice_number} ·{" "}
                  {formatDateTime(delivery.created_at)}
                </Text>
              </View>
              <Text style={styles.itemAmount}>
                {formatCurrency(delivery.total_amount)}
              </Text>
            </View>
          ))}
        </Card>
      </RequireRole>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  formCard: {
    flexBasis: 380,
    flexGrow: 1,
    gap: spacing.md,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  blockLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  pill: {
    alignItems: "center",
    borderColor: palette.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  pillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  pillText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  pillTextActive: {
    color: palette.surface,
  },
  productList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  productChip: {
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.sm,
    width: 150,
  },
  productChipActive: {
    borderColor: palette.primary,
    borderWidth: 2,
  },
  productChipText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  productChipTextActive: {
    color: palette.primaryDark,
  },
  inlineFields: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inlineInput: {
    flex: 1,
  },
  totalBox: {
    backgroundColor: palette.successSoft,
    borderRadius: 8,
    padding: spacing.md,
  },
  totalLabel: {
    color: palette.primaryDark,
    fontSize: 12,
    fontWeight: "900",
  },
  totalValue: {
    color: palette.primaryDark,
    fontSize: 24,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  message: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: "800",
  },
  itemsCard: {
    gap: spacing.md,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  empty: {
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 120,
  },
  mutedText: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  itemRow: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 58,
    paddingVertical: spacing.sm,
  },
  deliveryRow: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 54,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  itemQty: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "900",
    minWidth: 54,
    textAlign: "right",
  },
  itemAmount: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "900",
    minWidth: 100,
    textAlign: "right",
  },
  removeButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  categoryPill: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  categoryPillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  categoryText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  categoryTextActive: {
    color: palette.surface,
  },
});
