import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, radii, spacing } from '@/constants/theme';
import { formatRole } from '@/lib/auth/roles';
import { getUsers } from '@/lib/database/queries';
import { getRecentShifts } from '@/lib/database/shifts';
import type { Shift, UserListItem, UserRole } from '@/lib/database/types';
import { createUser, updateUser, type UserFormInput } from '@/lib/database/users';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

type UserFormValues = {
  fullName: string;
  username: string;
  pin: string;
};

const roleOptions: { label: string; value: UserRole }[] = [
  { label: 'Cashier', value: 'cashier' },
  { label: 'Supervisor', value: 'supervisor' },
  { label: 'Admin', value: 'admin' },
];

const statusOptions: { label: string; value: UserListItem['status'] }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

const avatarColors = ['#0EA5E9', '#F97316', '#8B5CF6', '#009B55', '#E43838', '#102332'];

function defaultValues(): UserFormValues {
  return {
    fullName: '',
    username: '',
    pin: '',
  };
}

export default function UsersScreen() {
  const db = useSQLiteContext();
  const currentUser = useAppStore((state) => state.currentUser);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('cashier');
  const [selectedStatus, setSelectedStatus] = useState<UserListItem['status']>('active');
  const [selectedColor, setSelectedColor] = useState(avatarColors[0]);
  const [message, setMessage] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    defaultValues: defaultValues(),
  });
  const canManageUsers = currentUser?.role === 'admin';

  const refresh = useCallback(async () => {
    const [nextUsers, nextShifts] = await Promise.all([getUsers(db), getRecentShifts(db, 12)]);
    setUsers(nextUsers);
    setShifts(nextShifts);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const userColumns: TableColumn<UserListItem>[] = [
      {
        key: 'name',
        title: 'Name',
        width: 230,
        render: (user) => (
          <View style={styles.userCell}>
            <View style={[styles.avatarDot, { backgroundColor: user.avatar_color }]} />
            <View style={styles.userCopy}>
              <Text style={styles.tableTitle}>{user.full_name}</Text>
              <Text style={styles.tableMeta}>@{user.username}</Text>
            </View>
          </View>
        ),
      },
      {
        key: 'role',
        title: 'Role',
        width: 130,
        render: (user) => <Text style={styles.tableText}>{formatRole(user.role)}</Text>,
      },
      {
        key: 'status',
        title: 'Status',
        width: 120,
        render: (user) => <Badge status={user.status === 'active' ? 'active' : 'inactive'} />,
      },
      {
        key: 'lastLogin',
        title: 'Last Login',
        width: 190,
        render: (user) => <Text style={styles.tableText}>{formatDateTime(user.last_login_at)}</Text>,
      },
      {
        key: 'action',
        title: 'Action',
        width: 100,
        align: 'center',
        render: (user) => (
          <Pressable onPress={() => openEdit(user)} style={styles.iconButton}>
            <Ionicons name="create-outline" size={18} color={palette.primaryDark} />
          </Pressable>
        ),
      },
  ];

  const shiftColumns = useMemo<TableColumn<Shift>[]>(
    () => [
      {
        key: 'id',
        title: 'Shift',
        width: 90,
        render: (shift) => <Text style={styles.tableText}>#{shift.id}</Text>,
      },
      { key: 'cashier', title: 'Cashier', accessor: 'user_name', width: 190 },
      {
        key: 'status',
        title: 'Status',
        width: 110,
        render: (shift) => (
          <Badge status={shift.status === 'open' ? 'active' : 'inactive'} label={shift.status.toUpperCase()} />
        ),
      },
      {
        key: 'opening',
        title: 'Opening',
        width: 120,
        align: 'right',
        render: (shift) => <Text style={styles.tableText}>{formatCurrency(shift.opening_balance)}</Text>,
      },
      {
        key: 'expected',
        title: 'Expected',
        width: 120,
        align: 'right',
        render: (shift) => <Text style={styles.tableText}>{formatCurrency(shift.expected_cash)}</Text>,
      },
      {
        key: 'started',
        title: 'Started',
        width: 150,
        render: (shift) => <Text style={styles.tableText}>{formatDateTime(shift.started_at)}</Text>,
      },
      {
        key: 'ended',
        title: 'Ended',
        width: 150,
        render: (shift) => <Text style={styles.tableText}>{formatDateTime(shift.ended_at)}</Text>,
      },
    ],
    []
  );

  function openCreate() {
    setEditingUser(null);
    setSelectedRole('cashier');
    setSelectedStatus('active');
    setSelectedColor(avatarColors[0]);
    reset(defaultValues());
    setMessage(null);
    setModalVisible(true);
  }

  function openEdit(user: UserListItem) {
    setEditingUser(user);
    setSelectedRole(user.role);
    setSelectedStatus(user.status);
    setSelectedColor(user.avatar_color);
    reset({
      fullName: user.full_name,
      username: user.username,
      pin: '',
    });
    setMessage(null);
    setModalVisible(true);
  }

  async function saveUser(values: UserFormValues) {
    if (!currentUser) {
      return;
    }

    const input: UserFormInput = {
      fullName: values.fullName,
      username: values.username,
      pin: values.pin || null,
      role: selectedRole,
      status: selectedStatus,
      avatarColor: selectedColor,
      actorId: currentUser.id,
    };

    try {
      if (editingUser) {
        await updateUser(db, editingUser.id, input);
        setMessage('User updated.');
      } else {
        await createUser(db, input);
        setMessage('User created.');
      }

      setModalVisible(false);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save user.');
    }
  }

  return (
    <AppShell
      title="User Management"
      subtitle="Admin-only local PIN users, roles, and shift records"
      actions={canManageUsers ? <Button title="Add User" icon="add" onPress={openCreate} /> : null}>
      <RequireRole roles={['admin']}>
        <View style={styles.grid}>
          <Card style={styles.metric}>
            <Text style={styles.metricLabel}>Active Users</Text>
            <Text style={styles.metricValue}>{users.filter((user) => user.status === 'active').length}</Text>
          </Card>
          <Card style={styles.metric}>
            <Text style={styles.metricLabel}>Open Shifts</Text>
            <Text style={styles.metricValue}>{shifts.filter((shift) => shift.status === 'open').length}</Text>
          </Card>
          <Card style={styles.metric}>
            <Text style={styles.metricLabel}>Admins</Text>
            <Text style={styles.metricValue}>{users.filter((user) => user.role === 'admin').length}</Text>
          </Card>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Card padded={false}>
          <View style={styles.tableHeader}>
            <View>
              <Text style={styles.sectionTitle}>Users</Text>
              <Text style={styles.tableMeta}>Create users, assign roles, deactivate access, or reset PINs.</Text>
            </View>
          </View>
          <Table columns={userColumns} data={users} keyExtractor={(user) => String(user.id)} />
        </Card>

        <Card padded={false}>
          <View style={styles.tableHeader}>
            <Text style={styles.sectionTitle}>Recent Shifts</Text>
          </View>
          <Table
            columns={shiftColumns}
            data={shifts}
            emptyLabel="No shifts have been started yet."
            keyExtractor={(shift) => String(shift.id)}
          />
        </Card>

        <Modal
          visible={modalVisible}
          title={editingUser ? 'Edit User' : 'Add User'}
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
                title={editingUser ? 'Save User' : 'Create User'}
                icon="save-outline"
                loading={isSubmitting}
                onPress={handleSubmit(saveUser)}
                style={styles.footerButton}
              />
            </View>
          }>
          <View style={styles.form}>
            <View style={styles.formGrid}>
              <Controller
                control={control}
                name="fullName"
                rules={{ required: 'Full name is required.' }}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    label="Full Name"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    containerStyle={styles.formInput}
                  />
                )}
              />
              <Controller
                control={control}
                name="username"
                rules={{ required: 'Username is required.' }}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    autoCapitalize="none"
                    label="Username"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    containerStyle={styles.formInput}
                  />
                )}
              />
              <Controller
                control={control}
                name="pin"
                rules={{
                  validate: (value) =>
                    Boolean(editingUser) ||
                    /^\d{4,6}$/.test(value) ||
                    'PIN must be 4 to 6 digits.',
                }}
                render={({ field: { onBlur, onChange, value } }) => (
                  <Input
                    keyboardType="number-pad"
                    label={editingUser ? 'Reset PIN' : 'PIN'}
                    maxLength={6}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    placeholder={editingUser ? 'Leave blank to keep PIN' : '4 to 6 digits'}
                    secureTextEntry
                    value={value}
                    containerStyle={styles.formInput}
                  />
                )}
              />
            </View>

            <Selector
              label="Role"
              options={roleOptions}
              value={selectedRole}
              onChange={setSelectedRole}
            />

            <Selector
              label="Status"
              options={statusOptions}
              value={selectedStatus}
              onChange={setSelectedStatus}
            />

            <View style={styles.fieldBlock}>
              <Text style={styles.blockLabel}>Avatar Color</Text>
              <View style={styles.colorRow}>
                {avatarColors.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      selectedColor === color && styles.colorSwatchActive,
                    ]}
                  />
                ))}
              </View>
            </View>

            {Object.values(errors)[0]?.message ? (
              <Text style={styles.errorText}>{Object.values(errors)[0]?.message}</Text>
            ) : null}
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>
        </Modal>
      </RequireRole>
    </AppShell>
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

const styles = StyleSheet.create({
  grid: {
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
    fontWeight: '900',
  },
  metricValue: {
    color: palette.primary,
    fontSize: 24,
    fontWeight: '900',
  },
  tableHeader: {
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
  userCell: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  avatarDot: {
    borderRadius: radii.pill,
    height: 30,
    width: 30,
  },
  userCopy: {
    flex: 1,
    minWidth: 0,
  },
  iconButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  modal: {
    maxWidth: 760,
  },
  form: {
    gap: spacing.md,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  formInput: {
    flexBasis: 210,
    flexGrow: 1,
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
    borderRadius: radii.pill,
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
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorSwatch: {
    borderColor: palette.border,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: 38,
    width: 38,
  },
  colorSwatchActive: {
    borderColor: palette.ink,
    transform: [{ scale: 1.08 }],
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  footerButton: {
    minWidth: 140,
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
});
