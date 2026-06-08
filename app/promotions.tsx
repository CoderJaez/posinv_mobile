import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, radii, spacing } from '@/constants/theme';
import {
  createPromotion,
  deletePromotion,
  getPromotions,
  updatePromotion,
  type PromotionFormInput,
} from '@/lib/database/promotions';
import { getCategories, getProducts } from '@/lib/database/queries';
import type {
  Category,
  ProductListItem,
  PromotionListItem,
  PromotionStatus,
  PromotionType,
} from '@/lib/database/types';
import { formatCurrency, formatLocalDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

type PromoFormValues = {
  name: string;
  discountValue: string;
  startsAt: string;
  endsAt: string;
  ruleJson: string;
};

type TargetScope = 'product' | 'category' | 'basket';

const promoTypes: { label: string; value: PromotionType }[] = [
  { label: 'Bundle', value: 'bundle' },
  { label: 'Time Discount', value: 'time_discount' },
  { label: 'Percent Discount', value: 'percentage_discount' },
  { label: 'Fixed Discount', value: 'fixed_discount' },
];

const statuses: { label: string; value: PromotionStatus }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Inactive', value: 'inactive' },
];

const targetScopes: { label: string; value: TargetScope }[] = [
  { label: 'Product', value: 'product' },
  { label: 'Category', value: 'category' },
  { label: 'Basket', value: 'basket' },
];

function defaultPromoValues(): PromoFormValues {
  return {
    name: '',
    discountValue: '0',
    startsAt: '',
    endsAt: '',
    ruleJson: '{}',
  };
}

function formatPromoType(type: PromotionType) {
  return promoTypes.find((option) => option.value === type)?.label ?? type;
}

function formatTarget(promotion: PromotionListItem) {
  if (promotion.product_name) {
    return promotion.product_name;
  }

  if (promotion.category_name) {
    return promotion.category_name;
  }

  return 'Basket';
}

function formatDiscount(promotion: PromotionListItem) {
  if (promotion.promo_type === 'percentage_discount' || promotion.promo_type === 'time_discount') {
    return `${promotion.discount_value}%`;
  }

  if (promotion.promo_type === 'fixed_discount') {
    return formatCurrency(promotion.discount_value);
  }

  return 'Rule';
}

export default function PromotionsScreen() {
  const db = useSQLiteContext();
  const currentUser = useAppStore((state) => state.currentUser);
  const [promotions, setPromotions] = useState<PromotionListItem[]>([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<PromotionListItem | null>(null);
  const [deletingPromotion, setDeletingPromotion] = useState<PromotionListItem | null>(null);
  const [promoType, setPromoType] = useState<PromotionType>('percentage_discount');
  const [status, setStatus] = useState<PromotionStatus>('active');
  const [targetScope, setTargetScope] = useState<TargetScope>('product');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PromoFormValues>({
    defaultValues: defaultPromoValues(),
  });

  const refresh = useCallback(async () => {
    const [nextPromotions, nextProducts, nextCategories] = await Promise.all([
      getPromotions(db),
      getProducts(db),
      getCategories(db),
    ]);

    setPromotions(nextPromotions);
    setProducts(nextProducts);
    setCategories(nextCategories);
    setSelectedProductId((current) => current ?? nextProducts[0]?.id ?? null);
    setSelectedCategoryId((current) => current ?? nextCategories[0]?.id ?? null);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const metrics = useMemo(
    () => ({
      active: promotions.filter((promotion) => promotion.status === 'active').length,
      scheduled: promotions.filter((promotion) => promotion.status === 'scheduled').length,
      inactive: promotions.filter((promotion) => promotion.status === 'inactive').length,
    }),
    [promotions]
  );

  const openCreate = useCallback(() => {
    setEditingPromotion(null);
    setPromoType('percentage_discount');
    setStatus('active');
    setTargetScope('product');
    setSelectedProductId(products[0]?.id ?? null);
    setSelectedCategoryId(categories[0]?.id ?? null);
    reset(defaultPromoValues());
    setMessage(null);
    setModalVisible(true);
  }, [categories, products, reset]);

  const openEdit = useCallback(
    (promotion: PromotionListItem) => {
      setEditingPromotion(promotion);
      setPromoType(promotion.promo_type);
      setStatus(promotion.status);
      setTargetScope(
        promotion.product_id ? 'product' : promotion.category_id ? 'category' : 'basket'
      );
      setSelectedProductId(promotion.product_id ?? products[0]?.id ?? null);
      setSelectedCategoryId(promotion.category_id ?? categories[0]?.id ?? null);
      reset({
        name: promotion.name,
        discountValue: String(promotion.discount_value),
        startsAt: promotion.starts_at ?? '',
        endsAt: promotion.ends_at ?? '',
        ruleJson: promotion.rule_json ?? '{}',
      });
      setMessage(null);
      setModalVisible(true);
    },
    [categories, products, reset]
  );

  const columns = useMemo<TableColumn<PromotionListItem>[]>(
    () => [
      {
        key: 'name',
        title: 'Promo Name',
        width: 250,
        render: (promotion) => (
          <View>
            <Text style={styles.tableTitle}>{promotion.name}</Text>
            <Text style={styles.tableMeta}>{formatTarget(promotion)}</Text>
          </View>
        ),
      },
      {
        key: 'type',
        title: 'Type',
        width: 160,
        render: (promotion) => (
          <Text style={styles.tableText}>{formatPromoType(promotion.promo_type)}</Text>
        ),
      },
      {
        key: 'value',
        title: 'Discount',
        width: 120,
        render: (promotion) => <Text style={styles.tableText}>{formatDiscount(promotion)}</Text>,
      },
      {
        key: 'period',
        title: 'Period',
        width: 230,
        render: (promotion) => (
          <Text style={styles.tableText}>
            {promotion.starts_at ? formatLocalDateTime(promotion.starts_at) : '-'} to{' '}
            {promotion.ends_at ? formatLocalDateTime(promotion.ends_at) : '-'}
          </Text>
        ),
      },
      {
        key: 'status',
        title: 'Status',
        width: 130,
        render: (promotion) => <Badge status={promotion.status} />,
      },
      {
        key: 'action',
        title: '',
        width: currentUser?.role === 'admin' ? 150 : 80,
        render: (promotion) => (
          <View style={styles.actionRow}>
            <Pressable onPress={() => openEdit(promotion)} style={styles.iconButton}>
              <Ionicons name="create-outline" size={18} color={palette.inkMuted} />
            </Pressable>
            {currentUser?.role === 'admin' ? (
              <Pressable onPress={() => setDeletingPromotion(promotion)} style={styles.iconButton}>
                <Ionicons name="trash-outline" size={18} color={palette.danger} />
              </Pressable>
            ) : null}
          </View>
        ),
      },
    ],
    [currentUser?.role, openEdit]
  );

  async function savePromotion(values: PromoFormValues) {
    if (!currentUser) {
      return;
    }

    const input: PromotionFormInput = {
      name: values.name,
      promoType,
      status,
      productId: targetScope === 'product' ? selectedProductId : null,
      categoryId: targetScope === 'category' ? selectedCategoryId : null,
      discountValue: Number(values.discountValue || 0),
      startsAt: values.startsAt || null,
      endsAt: values.endsAt || null,
      ruleJson: values.ruleJson,
      userId: currentUser.id,
    };

    try {
      if (editingPromotion) {
        await updatePromotion(db, editingPromotion.id, input);
        setMessage('Promotion updated.');
      } else {
        await createPromotion(db, input);
        setMessage('Promotion created.');
      }

      setModalVisible(false);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save promotion.');
    }
  }

  async function confirmDeletePromotion() {
    if (!currentUser || currentUser.role !== 'admin' || !deletingPromotion) {
      return;
    }

    try {
      await deletePromotion(db, {
        promotionId: deletingPromotion.id,
        userId: currentUser.id,
      });
      setDeletingPromotion(null);
      setMessage('Promotion deleted.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete promotion.');
    }
  }

  return (
    <AppShell
      title="Promotions"
      subtitle="Local promo definitions for products and categories"
      actions={<Button title="Create Promo" icon="add" onPress={openCreate} />}>
      <RequireRole roles={['supervisor', 'admin']}>
        <View style={styles.metricGrid}>
          <MetricCard label="Active" value={metrics.active} tone="active" />
          <MetricCard label="Scheduled" value={metrics.scheduled} tone="scheduled" />
          <MetricCard label="Inactive" value={metrics.inactive} tone="inactive" />
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Card padded={false}>
          <View style={styles.tableHeader}>
            <Text style={styles.sectionTitle}>Promotion Rules</Text>
            <Text style={styles.mutedText}>{promotions.length} total</Text>
          </View>
          <Table
            columns={columns}
            data={promotions}
            emptyLabel="No promotions yet."
            keyExtractor={(promotion) => String(promotion.id)}
          />
        </Card>

        <Modal
          visible={modalVisible}
          title={editingPromotion ? 'Edit Promo' : 'Create Promo'}
          onClose={() => setModalVisible(false)}
          contentStyle={styles.modal}
          footer={
            <View style={styles.modalFooter}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setModalVisible(false)}
                style={styles.footerButton}
              />
              <Button
                title={editingPromotion ? 'Save Promo' : 'Create Promo'}
                icon="save-outline"
                loading={isSubmitting}
                onPress={handleSubmit(savePromotion)}
                style={styles.footerButton}
              />
            </View>
          }>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.form}>
              <Controller
                control={control}
                name="name"
                rules={{ required: 'Promotion name is required.' }}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Promo Name"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />

              <Selector
                label="Promo Type"
                options={promoTypes}
                value={promoType}
                onChange={setPromoType}
              />

              <Selector
                label="Status"
                options={statuses}
                value={status}
                onChange={setStatus}
              />

              <Selector
                label="Apply To"
                options={targetScopes}
                value={targetScope}
                onChange={setTargetScope}
              />

              {targetScope === 'product' ? (
                <ChipList
                  label="Product"
                  items={products.map((product) => ({ id: product.id, label: product.name }))}
                  selectedId={selectedProductId}
                  onSelect={setSelectedProductId}
                />
              ) : null}

              {targetScope === 'category' ? (
                <ChipList
                  label="Category"
                  items={categories.map((category) => ({ id: category.id, label: category.name }))}
                  selectedId={selectedCategoryId}
                  onSelect={setSelectedCategoryId}
                />
              ) : null}

              <View style={styles.inlineFields}>
                <Controller
                  control={control}
                  name="discountValue"
                  rules={{ validate: (value) => Number(value) >= 0 || 'Discount cannot be negative.' }}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Discount Value"
                      keyboardType="decimal-pad"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      containerStyle={styles.inlineInput}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="startsAt"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Starts At"
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      containerStyle={styles.inlineInput}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="endsAt"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Ends At"
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      containerStyle={styles.inlineInput}
                    />
                  )}
                />
              </View>

              <Controller
                control={control}
                name="ruleJson"
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Rule JSON"
                    multiline
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    style={styles.ruleInput}
                  />
                )}
              />

              {Object.values(errors)[0]?.message ? (
                <Text style={styles.errorText}>{Object.values(errors)[0]?.message}</Text>
              ) : null}
              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
          </ScrollView>
        </Modal>

        <Modal
          visible={deletingPromotion != null}
          title="Delete Promotion"
          onClose={() => setDeletingPromotion(null)}
          footer={
            <View style={styles.modalFooter}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setDeletingPromotion(null)}
                style={styles.footerButton}
              />
              <Button
                title="Delete"
                icon="trash-outline"
                variant="danger"
                onPress={confirmDeletePromotion}
                style={styles.footerButton}
              />
            </View>
          }>
          <Text style={styles.deleteText}>
            Delete {deletingPromotion?.name ?? 'this promotion'}? Active checkout discounts stop
            applying immediately after deletion.
          </Text>
        </Modal>
      </RequireRole>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: PromotionStatus;
}) {
  return (
    <Card style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Badge status={tone} />
    </Card>
  );
}

function Selector<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.blockLabel}>{label}</Text>
      <View style={styles.pillRow}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.pill, value === option.value && styles.pillActive]}>
            <Text style={[styles.pillText, value === option.value && styles.pillTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ChipList({
  label,
  items,
  selectedId,
  onSelect,
}: {
  label: string;
  items: { id: number; label: string }[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.blockLabel}>{label}</Text>
      <View style={styles.chipGrid}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelect(item.id)}
            style={[styles.chip, selectedId === item.id && styles.chipActive]}>
            <Text
              numberOfLines={1}
              style={[styles.chipText, selectedId === item.id && styles.chipTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricCard: {
    flexBasis: 170,
    flexGrow: 1,
    gap: spacing.xs,
  },
  metricLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  metricValue: {
    color: palette.primary,
    fontSize: 24,
    fontWeight: '900',
  },
  tableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  mutedText: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tableTitle: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  tableMeta: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tableText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  iconButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  modal: {
    maxHeight: '90%',
    maxWidth: 860,
  },
  form: {
    gap: spacing.md,
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  blockLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  pillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  pillText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  pillTextActive: {
    color: palette.surface,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    width: 160,
  },
  chipActive: {
    borderColor: palette.primary,
    borderWidth: 2,
  },
  chipText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  chipTextActive: {
    color: palette.primaryDark,
  },
  inlineFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  inlineInput: {
    flexBasis: 220,
    flexGrow: 1,
  },
  ruleInput: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  footerButton: {
    minWidth: 150,
  },
  message: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  deleteText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
});
