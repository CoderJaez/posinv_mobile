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
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, spacing } from '@/constants/theme';
import {
  createSupplier,
  deleteSupplier,
  getRecentDeliveries,
  getSuppliers,
  updateSupplier,
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
  const [search, setSearch] = useState('');
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
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
      getSuppliers(db, search),
      getRecentDeliveries(db, 10),
    ]);
    setSuppliers(nextSuppliers);
    setDeliveries(nextDeliveries);
  }, [db, search]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  function startEditSupplier(supplier: Supplier) {
    setEditingSupplierId(supplier.id);
    reset({
      name: supplier.name,
      contactName: supplier.contact_name ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      address: supplier.address ?? '',
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingSupplierId(null);
    reset({
      name: '',
      contactName: '',
      phone: '',
      email: '',
      address: '',
    });
    setMessage(null);
  }

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
      if (editingSupplierId) {
        await updateSupplier(db, editingSupplierId, input, currentUser.id);
        setMessage('Supplier updated.');
      } else {
        await createSupplier(db, input, currentUser.id);
        setMessage('Supplier added.');
      }

      setEditingSupplierId(null);
      reset({
        name: '',
        contactName: '',
        phone: '',
        email: '',
        address: '',
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save supplier.');
    }
  }

  async function confirmDeleteSupplier() {
    if (!currentUser || !deletingSupplier) {
      return;
    }

    try {
      await deleteSupplier(db, deletingSupplier.id, currentUser.id);
      if (editingSupplierId === deletingSupplier.id) {
        setEditingSupplierId(null);
        reset({
          name: '',
          contactName: '',
          phone: '',
          email: '',
          address: '',
        });
      }
      setDeletingSupplier(null);
      setMessage('Supplier deleted.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete supplier.');
    }
  }

  const supplierColumns: TableColumn<Supplier>[] = [
    { key: 'name', title: 'Supplier', accessor: 'name', width: 220 },
    { key: 'contact', title: 'Contact', accessor: 'contact_name', width: 160 },
    { key: 'phone', title: 'Phone', accessor: 'phone', width: 140 },
    { key: 'email', title: 'Email', accessor: 'email', width: 210 },
    { key: 'address', title: 'Address', accessor: 'address', width: 220 },
    {
      key: 'actions',
      title: '',
      width: 190,
      render: (supplier) => (
        <View style={styles.rowActions}>
          <Button
            title="Edit"
            size="sm"
            variant="outline"
            onPress={() => startEditSupplier(supplier)}
          />
          <Button
            title="Delete"
            size="sm"
            variant="danger"
            onPress={() => setDeletingSupplier(supplier)}
          />
        </View>
      ),
    },
  ];

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
            <Text style={styles.sectionTitle}>
              {editingSupplierId ? 'Edit Supplier' : 'Add Supplier'}
            </Text>
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
            {editingSupplierId ? (
              <Button
                fullWidth
                icon="close-outline"
                onPress={cancelEdit}
                title="Cancel Edit"
                variant="secondary"
              />
            ) : null}
            <Button
              fullWidth
              icon={editingSupplierId ? 'save-outline' : 'add'}
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
              title={editingSupplierId ? 'Update Supplier' : 'Add Supplier'}
            />
          </Card>

          <View style={styles.tables}>
            <Card padded={false}>
              <View style={styles.tableHeader}>
                <Text style={styles.sectionTitle}>Supplier List</Text>
                <Text style={styles.mutedText}>{suppliers.length} active</Text>
              </View>
              <View style={styles.searchWrap}>
                <Input
                  icon="search-outline"
                  onChangeText={setSearch}
                  placeholder="Search supplier, contact, phone, email..."
                  value={search}
                />
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

        <Modal
          visible={deletingSupplier != null}
          title="Delete Supplier"
          onClose={() => setDeletingSupplier(null)}
          footer={
            <View style={styles.modalFooter}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setDeletingSupplier(null)}
                style={styles.modalButton}
              />
              <Button
                title="Delete"
                variant="danger"
                icon="trash-outline"
                onPress={confirmDeleteSupplier}
                style={styles.modalButton}
              />
            </View>
          }>
          <Text style={styles.modalText}>
            Delete {deletingSupplier?.name ?? 'this supplier'} from active supplier lists? Existing
            deliveries will stay in local history.
          </Text>
        </Modal>
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
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  searchWrap: {
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
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
  tableText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  modalButton: {
    minWidth: 130,
  },
  modalText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
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
