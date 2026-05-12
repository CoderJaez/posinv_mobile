import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { palette, spacing } from '@/constants/theme';
import {
  createProduct,
  getProductById,
  updateProduct,
  type ProductFormInput,
} from '@/lib/database/inventory';
import { getCategories } from '@/lib/database/queries';
import type { Category } from '@/lib/database/types';
import { useAppStore } from '@/lib/store/app-store';

type ProductFormValues = {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  unit: string;
  regularPrice: string;
  promoPrice: string;
  unitCost: string;
  currentStock: string;
  reorderLevel: string;
  imageColor: string;
};

export default function ProductFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string }>();
  const currentUser = useAppStore((state) => state.currentUser);
  const productId = Number(params.productId);
  const editing = Number.isFinite(productId) && productId > 0;
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    defaultValues: {
      name: '',
      sku: '',
      barcode: '',
      categoryId: '',
      unit: 'pc',
      regularPrice: '',
      promoPrice: '',
      unitCost: '',
      currentStock: '0',
      reorderLevel: '0',
      imageColor: '#E6F7EE',
    },
  });

  const selectedCategoryId = Number(watch('categoryId'));

  useEffect(() => {
    let mounted = true;

    async function load() {
      const nextCategories = await getCategories(db);
      if (!mounted) {
        return;
      }

      setCategories(nextCategories);
      if (!editing && nextCategories[0]) {
        setValue('categoryId', String(nextCategories[0].id));
      }

      if (editing) {
        const product = await getProductById(db, productId);
        if (product && mounted) {
          setValue('name', product.name);
          setValue('sku', product.sku);
          setValue('barcode', product.barcode ?? '');
          setValue('categoryId', String(product.category_id));
          setValue('unit', product.unit);
          setValue('regularPrice', String(product.regular_price));
          setValue('promoPrice', product.promo_price == null ? '' : String(product.promo_price));
          setValue('unitCost', String(product.unit_cost));
          setValue('currentStock', String(product.current_stock));
          setValue('reorderLevel', String(product.reorder_level));
          setValue('imageColor', product.image_color);
        }
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [db, editing, productId, setValue]);

  const title = useMemo(() => (editing ? 'Edit Product' : 'Add Product'), [editing]);

  async function onSubmit(values: ProductFormValues) {
    if (!currentUser) {
      return;
    }

    const input: ProductFormInput = {
      name: values.name,
      sku: values.sku,
      barcode: values.barcode || null,
      categoryId: Number(values.categoryId),
      unit: values.unit,
      regularPrice: Number(values.regularPrice),
      promoPrice: values.promoPrice ? Number(values.promoPrice) : null,
      unitCost: Number(values.unitCost || 0),
      currentStock: Number(values.currentStock || 0),
      reorderLevel: Number(values.reorderLevel || 0),
      imageColor: values.imageColor || '#E6F7EE',
    };

    try {
      if (editing) {
        await updateProduct(db, productId, input, currentUser.id);
        setMessage('Product updated.');
        router.replace({
          pathname: '/product-details',
          params: { productId: String(productId) },
        } as never);
      } else {
        const nextProductId = await createProduct(db, input, currentUser.id);
        setMessage('Product created.');
        router.replace({
          pathname: '/product-details',
          params: { productId: String(nextProductId) },
        } as never);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save product.');
    }
  }

  return (
    <AppShell
      title={title}
      subtitle="Maintain product master data stored in local SQLite"
      actions={<Button title="Back" variant="secondary" icon="arrow-back" onPress={() => router.back()} />}>
      <RequireRole roles={['supervisor', 'admin']}>
        <Card style={styles.card}>
          <View style={styles.grid}>
            <Controller
              control={control}
              name="name"
              rules={{ required: 'Product name is required.' }}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Product Name"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  containerStyle={styles.input}
                />
              )}
            />
            <Controller
              control={control}
              name="sku"
              rules={{ required: 'SKU is required.' }}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="SKU"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  autoCapitalize="characters"
                  containerStyle={styles.input}
                />
              )}
            />
            <Controller
              control={control}
              name="barcode"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Barcode"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  containerStyle={styles.input}
                />
              )}
            />
            <Controller
              control={control}
              name="unit"
              rules={{ required: 'Unit is required.' }}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Unit"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  containerStyle={styles.input}
                />
              )}
            />
            <Controller
              control={control}
              name="regularPrice"
              rules={{ validate: (value) => Number(value) > 0 || 'Regular price is required.' }}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Regular Price"
                  keyboardType="decimal-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  containerStyle={styles.input}
                />
              )}
            />
            <Controller
              control={control}
              name="promoPrice"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Promo Price"
                  keyboardType="decimal-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  containerStyle={styles.input}
                />
              )}
            />
            <Controller
              control={control}
              name="unitCost"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Unit Cost"
                  keyboardType="decimal-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  containerStyle={styles.input}
                />
              )}
            />
            <Controller
              control={control}
              name="reorderLevel"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input
                  label="Reorder Level"
                  keyboardType="number-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  containerStyle={styles.input}
                />
              )}
            />
            {!editing ? (
              <Controller
                control={control}
                name="currentStock"
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Opening Stock"
                    keyboardType="number-pad"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    containerStyle={styles.input}
                  />
                )}
              />
            ) : null}
          </View>

          <View style={styles.categoryBlock}>
            <Text style={styles.blockLabel}>Category</Text>
            <View style={styles.categoryRow}>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => setValue('categoryId', String(category.id))}
                  style={[
                    styles.categoryPill,
                    selectedCategoryId === category.id && styles.categoryPillActive,
                  ]}>
                  <Text
                    style={[
                      styles.categoryText,
                      selectedCategoryId === category.id && styles.categoryTextActive,
                    ]}>
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {Object.values(errors)[0]?.message ? (
            <Text style={styles.errorText}>{Object.values(errors)[0]?.message}</Text>
          ) : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Button
            fullWidth
            icon="save-outline"
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            size="lg"
            title={editing ? 'Save Product' : 'Create Product'}
          />
        </Card>
      </RequireRole>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    maxWidth: 900,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  input: {
    flexBasis: 250,
    flexGrow: 1,
  },
  categoryBlock: {
    gap: spacing.sm,
  },
  blockLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryPill: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  categoryPillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  categoryText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  categoryTextActive: {
    color: palette.surface,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  message: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
});
