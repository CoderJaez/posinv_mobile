import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import type { ComponentProps } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, radii, spacing } from '@/constants/theme';
import {
  createCustomer,
  getCustomerSummary,
  getCustomers,
  setCustomerStatus,
  updateCustomer,
  type CustomerInput,
} from '@/lib/database/customers';
import type { Customer, CustomerStatus, CustomerSummary } from '@/lib/database/types';
import { formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

type CustomerForm = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  loyaltyPoints: string;
  lastVisitAt: string;
  notes: string;
};

type IconName = ComponentProps<typeof Ionicons>['name'];

const emptySummary: CustomerSummary = {
  total_customers: 0,
  active_customers: 0,
  loyalty_members: 0,
  total_loyalty_points: 0,
  recent_visits: 0,
};

const statusOptions: { label: string; value: CustomerStatus }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

function defaultValues(): CustomerForm {
  return {
    fullName: '',
    phone: '',
    email: '',
    address: '',
    loyaltyPoints: '0',
    lastVisitAt: '',
    notes: '',
  };
}

function toCustomerInput(values: CustomerForm, status: CustomerStatus): CustomerInput {
  return {
    fullName: values.fullName,
    phone: values.phone,
    email: values.email,
    address: values.address,
    loyaltyPoints: Number(values.loyaltyPoints || 0),
    lastVisitAt: values.lastVisitAt,
    notes: values.notes,
    status,
  };
}

export default function CustomersScreen() {
  const db = useSQLiteContext();
  const currentUser = useAppStore((state) => state.currentUser);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerSummary>(emptySummary);
  const [search, setSearch] = useState('');
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<CustomerStatus>('active');
  const [message, setMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerForm>({
    defaultValues: defaultValues(),
  });

  const refresh = useCallback(async () => {
    const [nextCustomers, nextSummary] = await Promise.all([
      getCustomers(db, search),
      getCustomerSummary(db),
    ]);
    setCustomers(nextCustomers);
    setSummary(nextSummary);
  }, [db, search]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const activeRate = useMemo(() => {
    if (summary.total_customers === 0) {
      return '0%';
    }

    return `${Math.round((summary.active_customers / summary.total_customers) * 100)}%`;
  }, [summary.active_customers, summary.total_customers]);

  function startEdit(customer: Customer) {
    setEditingCustomerId(customer.id);
    setSelectedStatus(customer.status);
    reset({
      fullName: customer.full_name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      loyaltyPoints: String(customer.loyalty_points),
      lastVisitAt: customer.last_visit_at ?? '',
      notes: customer.notes ?? '',
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditingCustomerId(null);
    setSelectedStatus('active');
    reset(defaultValues());
    setMessage(null);
  }

  async function saveCustomer(values: CustomerForm) {
    if (!currentUser) {
      setMessage('Login is required to save customers.');
      return;
    }

    try {
      const input = toCustomerInput(values, selectedStatus);

      if (editingCustomerId) {
        await updateCustomer(db, editingCustomerId, input, currentUser.id);
        setMessage('Customer updated.');
      } else {
        await createCustomer(db, input, currentUser.id);
        setMessage('Customer added.');
      }

      setEditingCustomerId(null);
      setSelectedStatus('active');
      reset(defaultValues());
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save customer.');
    }
  }

  async function toggleCustomerStatus(customer: Customer) {
    if (!currentUser) {
      setMessage('Login is required to update customers.');
      return;
    }

    const nextStatus: CustomerStatus = customer.status === 'active' ? 'inactive' : 'active';

    try {
      await setCustomerStatus(db, customer.id, nextStatus, currentUser.id);
      setMessage(nextStatus === 'active' ? 'Customer reactivated.' : 'Customer deactivated.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update customer.');
    }
  }

  const customerColumns: TableColumn<Customer>[] = [
    {
      key: 'name',
      title: 'Customer',
      width: 230,
      render: (customer) => (
        <View style={styles.customerCell}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{customer.full_name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.customerCopy}>
            <Text style={styles.tableTitle}>{customer.full_name}</Text>
            <Text style={styles.tableMeta}>{customer.phone ?? 'No phone'}</Text>
          </View>
        </View>
      ),
    },
    { key: 'email', title: 'Email', accessor: 'email', width: 220 },
    { key: 'address', title: 'Address', accessor: 'address', width: 220 },
    {
      key: 'points',
      title: 'Points',
      width: 90,
      align: 'right',
      render: (customer) => (
        <Text style={styles.tableText}>{customer.loyalty_points.toLocaleString()}</Text>
      ),
    },
    {
      key: 'lastVisit',
      title: 'Last Visit',
      width: 160,
      render: (customer) => <Text style={styles.tableText}>{formatDateTime(customer.last_visit_at)}</Text>,
    },
    {
      key: 'status',
      title: 'Status',
      width: 120,
      render: (customer) => (
        <Badge status={customer.status === 'active' ? 'active' : 'inactive'} label={customer.status.toUpperCase()} />
      ),
    },
    {
      key: 'notes',
      title: 'Notes',
      width: 260,
      render: (customer) => <Text style={styles.tableText} numberOfLines={2}>{customer.notes ?? '-'}</Text>,
    },
    {
      key: 'actions',
      title: '',
      width: 220,
      render: (customer) => (
        <View style={styles.rowActions}>
          <Button title="Edit" size="sm" variant="outline" onPress={() => startEdit(customer)} />
          <Button
            title={customer.status === 'active' ? 'Deactivate' : 'Activate'}
            size="sm"
            variant={customer.status === 'active' ? 'danger' : 'secondary'}
            onPress={() => toggleCustomerStatus(customer)}
          />
        </View>
      ),
    },
  ];

  return (
    <AppShell title="Customers" subtitle="Local customer profiles, loyalty notes, and service context">
      <View style={styles.metricGrid}>
        <Metric label="Total Customers" value={summary.total_customers.toLocaleString()} />
        <Metric label="Active Customers" value={summary.active_customers.toLocaleString()} />
        <Metric label="Active Rate" value={activeRate} />
        <Metric label="Loyalty Points" value={summary.total_loyalty_points.toLocaleString()} />
      </View>

      <View style={styles.benefitGrid}>
        <Benefit
          icon="business-outline"
          title="Client Benefits"
          body="Keeps repeat-buyer records, loyalty balances, service notes, and contact references available even offline."
        />
        <Benefit
          icon="people-outline"
          title="Customer Benefits"
          body="Speeds up checkout support, makes promo eligibility easier to verify, and keeps preferences visible to staff."
        />
      </View>

      <View style={styles.grid}>
        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>
            {editingCustomerId ? 'Edit Customer' : 'Add Customer'}
          </Text>

          <Controller
            control={control}
            name="fullName"
            rules={{ required: 'Customer name is required.' }}
            render={({ field: { onBlur, onChange, value } }) => (
              <Input label="Full Name" onBlur={onBlur} onChangeText={onChange} value={value} />
            )}
          />
          {errors.fullName ? <Text style={styles.errorText}>{errors.fullName.message}</Text> : null}

          <Controller
            control={control}
            name="phone"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                keyboardType="phone-pad"
                label="Phone"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          <Controller
            control={control}
            name="email"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                autoCapitalize="none"
                keyboardType="email-address"
                label="Email"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          <Controller
            control={control}
            name="address"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input label="Address" onBlur={onBlur} onChangeText={onChange} value={value} />
            )}
          />
          <Controller
            control={control}
            name="loyaltyPoints"
            rules={{
              validate: (value) =>
                Number(value || 0) >= 0 || 'Loyalty points cannot be negative.',
            }}
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                keyboardType="number-pad"
                label="Loyalty Points"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.loyaltyPoints ? (
            <Text style={styles.errorText}>{errors.loyaltyPoints.message}</Text>
          ) : null}
          <Controller
            control={control}
            name="lastVisitAt"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                label="Last Visit"
                onBlur={onBlur}
                onChangeText={onChange}
                placeholder="YYYY-MM-DD HH:MM:SS"
                value={value}
              />
            )}
          />
          <Controller
            control={control}
            name="notes"
            render={({ field: { onBlur, onChange, value } }) => (
              <Input
                label="Notes"
                multiline
                onBlur={onBlur}
                onChangeText={onChange}
                style={styles.notesInput}
                value={value}
              />
            )}
          />

          <View style={styles.statusGroup}>
            <Text style={styles.smallLabel}>Status</Text>
            <View style={styles.statusOptions}>
              {statusOptions.map((option) => (
                <Button
                  key={option.value}
                  title={option.label}
                  size="sm"
                  variant={selectedStatus === option.value ? 'primary' : 'secondary'}
                  onPress={() => setSelectedStatus(option.value)}
                  style={styles.statusButton}
                />
              ))}
            </View>
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          {editingCustomerId ? (
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
            icon={editingCustomerId ? 'save-outline' : 'add'}
            loading={isSubmitting}
            onPress={handleSubmit(saveCustomer)}
            title={editingCustomerId ? 'Update Customer' : 'Add Customer'}
          />
        </Card>

        <Card padded={false} style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <View style={styles.tableTitleGroup}>
              <Text style={styles.sectionTitle}>Customer List</Text>
              <Text style={styles.tableMeta}>{customers.length} matching records</Text>
            </View>
            <View style={styles.recentBadge}>
              <Ionicons name="time-outline" size={16} color={palette.primaryDark} />
              <Text style={styles.recentText}>{summary.recent_visits} recent visits</Text>
            </View>
          </View>
          <View style={styles.searchWrap}>
            <Input
              icon="search-outline"
              onChangeText={setSearch}
              placeholder="Search name, phone, email, notes..."
              value={search}
            />
          </View>
          <Table
            columns={customerColumns}
            data={customers}
            emptyLabel="No customers found."
            keyExtractor={(customer) => String(customer.id)}
          />
        </Card>
      </View>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </Card>
  );
}

function Benefit({
  icon,
  title,
  body,
}: {
  icon: IconName;
  title: string;
  body: string;
}) {
  return (
    <Card style={styles.benefit}>
      <View style={styles.benefitIcon}>
        <Ionicons name={icon} size={20} color={palette.primaryDark} />
      </View>
      <View style={styles.benefitCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.benefitBody}>{body}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metric: {
    flexBasis: 170,
    flexGrow: 1,
    gap: spacing.xs,
  },
  metricLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  metricValue: {
    color: palette.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  benefitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  benefit: {
    alignItems: 'flex-start',
    flexBasis: 320,
    flexDirection: 'row',
    flexGrow: 1,
    gap: spacing.sm,
  },
  benefitIcon: {
    alignItems: 'center',
    backgroundColor: palette.successSoft,
    borderRadius: radii.sm,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  benefitCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  benefitBody: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  grid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  formCard: {
    flexBasis: 340,
    gap: spacing.md,
    maxWidth: 430,
  },
  tableCard: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  smallLabel: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  statusGroup: {
    gap: spacing.xs,
  },
  statusOptions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statusButton: {
    flex: 1,
  },
  notesInput: {
    minHeight: 72,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  tableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  tableTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  searchWrap: {
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  recentBadge: {
    alignItems: 'center',
    backgroundColor: palette.successSoft,
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  recentText: {
    color: palette.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  customerCell: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: palette.primary,
    borderRadius: radii.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  avatarText: {
    color: palette.surface,
    fontSize: 14,
    fontWeight: '900',
  },
  customerCopy: {
    flex: 1,
    minWidth: 0,
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
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
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
