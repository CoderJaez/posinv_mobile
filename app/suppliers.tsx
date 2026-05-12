import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, spacing } from '@/constants/theme';
import {
  createSupplier,
  getRecentDeliveries,
  getSuppliers,
  type SupplierInput,
} from '@/lib/database/inventory';
import type { DeliveryListItem, Supplier } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

type SupplierForm = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
};

const supplierColumns: TableColumn<Supplier>[] = [
  { key: 'name', title: 'Supplier', accessor: 'name', width: 220 },
  { key: 'contact', title: 'Contact', accessor: 'contact_name', width: 160 },
  { key: 'phone', title: 'Phone', accessor: 'phone', width: 140 },
  { key: 'email', title: 'Email', accessor: 'email', width: 210 },
  { key: 'address', title: 'Address', accessor: 'address', width: 220 },
];

const deliveryColumns: TableColumn<DeliveryListItem>[] = [
  { key: 'supplier', title: 'Supplier', accessor: 'supplier_name', width: 220 },
  { key: 'invoice', title: 'Invoice', accessor: 'invoice_number', width: 140 },
  { key: 'date', title: 'Delivery Date', accessor: 'delivery_date', width: 140 },
  {
    key: 'total',
    title: 'Total',
    width: 120,
    align: 'right',
    render: (delivery) => <Text style={styles.tableText}>{formatCurrency(delivery.total_amount)}</Text>,
  },
  {
    key: 'created',
    title: 'Saved',
    width: 160,
    render: (delivery) => <Text style={styles.tableText}>{formatDateTime(delivery.created_at)}</Text>,
  },
];

export default function SuppliersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryListItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierForm>({
    defaultValues: {
      name: '',
      contactName: '',
      phone: '',
      email: '',
      address: '',
    },
  });

  const refresh = useCallback(async () => {
    const [nextSuppliers, nextDeliveries] = await Promise.all([
      getSuppliers(db),
      getRecentDeliveries(db, 10),
    ]);
    setSuppliers(nextSuppliers);
    setDeliveries(nextDeliveries);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function onSubmit(values: SupplierForm) {
    if (!currentUser) {
      return;
    }

    const input: SupplierInput = {
      name: values.name,
      contactName: values.contactName,
      phone: values.phone,
      email: values.email,
      address: values.address,
    };

    try {
      await createSupplier(db, input, currentUser.id);
      setMessage('Supplier added.');
      reset();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add supplier.');
    }
  }

  return (
    <AppShell
      title="Suppliers"
      subtitle="Supplier list and recent delivery references"
      actions={
        <Button
          title="Stock In"
          icon="clipboard-outline"
          onPress={() => router.push('/stock-in' as never)}
        />
      }>
      <RequireRole roles={['supervisor', 'admin']}>
        <View style={styles.grid}>
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Add Supplier</Text>
            <Controller
              control={control}
              name="name"
              rules={{ required: 'Supplier name is required.' }}
              render={({ field: { onBlur, onChange, value } }) => (
                <Input label="Supplier Name" onBlur={onBlur} onChangeText={onChange} value={value} />
              )}
            />
            {errors.name ? <Text style={styles.errorText}>{errors.name.message}</Text> : null}
            <Controller
              control={control}
              name="contactName"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input label="Contact Person" onBlur={onBlur} onChangeText={onChange} value={value} />
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input label="Phone" onBlur={onBlur} onChangeText={onChange} value={value} />
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input label="Email" onBlur={onBlur} onChangeText={onChange} value={value} />
              )}
            />
            <Controller
              control={control}
              name="address"
              render={({ field: { onBlur, onChange, value } }) => (
                <Input label="Address" onBlur={onBlur} onChangeText={onChange} value={value} />
              )}
            />
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <Button
              fullWidth
              icon="add"
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
              title="Add Supplier"
            />
          </Card>

          <View style={styles.tables}>
            <Card padded={false}>
              <View style={styles.tableHeader}>
                <Text style={styles.sectionTitle}>Supplier List</Text>
              </View>
              <Table
                columns={supplierColumns}
                data={suppliers}
                emptyLabel="No suppliers found."
                keyExtractor={(supplier) => String(supplier.id)}
              />
            </Card>

            <Card padded={false}>
              <View style={styles.tableHeader}>
                <Ionicons name="clipboard-outline" size={18} color={palette.ink} />
                <Text style={styles.sectionTitle}>Recent Deliveries</Text>
              </View>
              <Table
                columns={deliveryColumns}
                data={deliveries}
                emptyLabel="No deliveries saved yet."
                keyExtractor={(delivery) => String(delivery.id)}
              />
            </Card>
          </View>
        </View>
      </RequireRole>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  formCard: {
    flexBasis: 330,
    gap: spacing.md,
    maxWidth: 420,
  },
  tables: {
    flex: 1,
    gap: spacing.md,
    minWidth: 0,
  },
  tableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  tableText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
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
