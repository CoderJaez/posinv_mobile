import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { palette, spacing } from '@/constants/theme';
import { adjustProductStock, getProductById } from '@/lib/database/inventory';
import type { ProductDetails } from '@/lib/database/types';
import { useAppStore } from '@/lib/store/app-store';

type AdjustStockForm = {
  quantityDelta: string;
  reason: string;
  batchNumber: string;
  expiryDate: string;
  unitCost: string;
};

export default function AdjustStockScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string }>();
  const currentUser = useAppStore((state) => state.currentUser);
  const currentShift = useAppStore((state) => state.currentShift);
  const productId = Number(params.productId);
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdjustStockForm>({
    defaultValues: {
      quantityDelta: '',
      reason: '',
      batchNumber: '',
      expiryDate: '',
      unitCost: '',
    },
  });

  useEffect(() => {
    if (Number.isFinite(productId)) {
      getProductById(db, productId).then(setProduct);
    }
  }, [db, productId]);

  async function onSubmit(values: AdjustStockForm) {
    if (!currentUser || !product) {
      return;
    }

    try {
      await adjustProductStock(db, {
        productId: product.id,
        userId: currentUser.id,
        shiftId: currentShift?.id ?? null,
        quantityDelta: Number(values.quantityDelta),
        reason: values.reason,
        batchNumber: values.batchNumber || null,
        expiryDate: values.expiryDate || null,
        unitCost: values.unitCost ? Number(values.unitCost) : null,
      });
      router.replace({
        pathname: '/product-details',
        params: { productId: String(product.id) },
      } as never);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to adjust stock.');
    }
  }

  return (
    <AppShell
      title="Adjust Stock"
      subtitle={product ? `${product.name} · Current stock ${product.current_stock}` : 'Loading product'}
      actions={<Button title="Back" variant="secondary" icon="arrow-back" onPress={() => router.back()} />}>
      <RequireRole roles={['supervisor', 'admin']}>
        <Card style={styles.card}>
          <Text style={styles.helpText}>
            Use a positive quantity to add stock or a negative quantity to deduct stock. Negative
            adjustments deduct from batches using earliest-expiry-first.
          </Text>

          <Controller
            control={control}
            name="quantityDelta"
            rules={{ validate: (value) => Number(value) !== 0 || 'Quantity adjustment is required.' }}
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                label="Quantity Adjustment"
                placeholder="Example: 10 or -2"
                keyboardType="numbers-and-punctuation"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.quantityDelta ? <Text style={styles.errorText}>{errors.quantityDelta.message}</Text> : null}

          <Controller
            control={control}
            name="reason"
            rules={{ required: 'Reason is required.' }}
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                label="Reason"
                placeholder="Damage, physical count, correction, etc."
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.reason ? <Text style={styles.errorText}>{errors.reason.message}</Text> : null}

          <Controller
            control={control}
            name="batchNumber"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                label="Batch Number"
                placeholder="Required only when adding a specific batch"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          <Controller
            control={control}
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
              />
            )}
          />

          {message ? <Text style={styles.errorText}>{message}</Text> : null}

          <Button
            fullWidth
            icon="swap-vertical-outline"
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            size="lg"
            title="Save Adjustment"
          />
        </Card>
      </RequireRole>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    maxWidth: 560,
  },
  helpText: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '800',
  },
});
