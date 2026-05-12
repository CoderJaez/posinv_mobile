import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, spacing } from '@/constants/theme';
import { formatRole } from '@/lib/auth/roles';
import { getUsers } from '@/lib/database/queries';
import { getRecentShifts } from '@/lib/database/shifts';
import type { Shift, UserListItem } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';

const columns: TableColumn<UserListItem>[] = [
  { key: 'name', title: 'Name', accessor: 'full_name', width: 210 },
  { key: 'username', title: 'Username', accessor: 'username', width: 120 },
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
    title: '',
    width: 70,
    render: () => <Ionicons name="ellipsis-vertical" size={18} color={palette.inkMuted} />,
  },
];

const shiftColumns: TableColumn<Shift>[] = [
  { key: 'id', title: 'Shift', width: 90, render: (shift) => <Text style={styles.tableText}>#{shift.id}</Text> },
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
];

export default function UsersScreen() {
  const db = useSQLiteContext();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    let mounted = true;

    Promise.all([getUsers(db), getRecentShifts(db, 12)]).then(([nextUsers, nextShifts]) => {
      if (mounted) {
        setUsers(nextUsers);
        setShifts(nextShifts);
      }
    });

    return () => {
      mounted = false;
    };
  }, [db]);

  return (
    <AppShell
      title="Users & Shift Management"
      subtitle="PIN users, roles, and local shift records"
      actions={<Button title="Add User" icon="add" />}>
      <RequireRole roles={['supervisor', 'admin']}>
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

        <Card padded={false}>
          <View style={styles.tableHeader}>
            <Text style={styles.sectionTitle}>Users</Text>
          </View>
          <Table columns={columns} data={users} keyExtractor={(user) => String(user.id)} />
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
      </RequireRole>
    </AppShell>
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
});
