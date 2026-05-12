import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { ComponentProps } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, radii, spacing } from '@/constants/theme';
import { runDatabaseIntegrityCheck, type DatabaseHealthCheck } from '@/lib/database/health';
import { getDatabaseSummary } from '@/lib/database/queries';
import { getAuditLogs, getSettingsMap, saveSettings } from '@/lib/database/settings';
import type { AuditLogItem, DatabaseCount, PaymentMethod } from '@/lib/database/types';
import { formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

type IconName = ComponentProps<typeof Ionicons>['name'];
type SettingsSection =
  | 'general'
  | 'payments'
  | 'receipt'
  | 'hardware'
  | 'users'
  | 'backup'
  | 'branches'
  | 'logs'
  | 'about';

type GeneralForm = {
  storeName: string;
  currency: string;
};

type ReceiptForm = {
  receiptHeader: string;
  receiptFooter: string;
};

type BranchForm = {
  branchName: string;
  branchCode: string;
};

type PaymentSettings = Record<PaymentMethod, boolean>;

const sections: { key: SettingsSection; label: string; icon: IconName }[] = [
  { key: 'general', label: 'General', icon: 'settings-outline' },
  { key: 'payments', label: 'Payment Methods', icon: 'card-outline' },
  { key: 'receipt', label: 'Receipt Settings', icon: 'receipt-outline' },
  { key: 'hardware', label: 'Hardware Setup', icon: 'desktop-outline' },
  { key: 'users', label: 'Users & Roles', icon: 'people-outline' },
  { key: 'backup', label: 'Backup & Sync', icon: 'cloud-upload-outline' },
  { key: 'branches', label: 'Branches', icon: 'business-outline' },
  { key: 'logs', label: 'System Logs', icon: 'document-text-outline' },
  { key: 'about', label: 'About System', icon: 'information-circle-outline' },
];

const paymentLabels: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'card', label: 'Card' },
  { key: 'gcash', label: 'GCash' },
  { key: 'maya', label: 'Maya' },
  { key: 'grabpay', label: 'GrabPay' },
];

const defaultPayments: PaymentSettings = {
  cash: true,
  card: true,
  gcash: true,
  maya: true,
  grabpay: true,
};

const logColumns: TableColumn<AuditLogItem>[] = [
  {
    key: 'date',
    title: 'Date',
    width: 170,
    render: (log) => <Text style={styles.tableText}>{formatDateTime(log.created_at)}</Text>,
  },
  { key: 'action', title: 'Action', accessor: 'action', width: 220 },
  { key: 'entity', title: 'Entity', accessor: 'entity_type', width: 150 },
  { key: 'user', title: 'User', accessor: 'user_name', width: 170 },
  {
    key: 'metadata',
    title: 'Metadata',
    width: 260,
    render: (log) => (
      <Text style={styles.tableText} numberOfLines={1}>
        {log.metadata_json ?? '-'}
      </Text>
    ),
  },
];

function parsePaymentSettings(value?: string): PaymentSettings {
  if (!value) {
    return defaultPayments;
  }

  try {
    return { ...defaultPayments, ...JSON.parse(value) };
  } catch {
    return defaultPayments;
  }
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const currentUser = useAppStore((state) => state.currentUser);
  const [selectedSection, setSelectedSection] = useState<SettingsSection>('general');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPayments);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [healthCheck, setHealthCheck] = useState<DatabaseHealthCheck | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const generalForm = useForm<GeneralForm>({
    defaultValues: {
      storeName: '',
      currency: 'PHP',
    },
  });
  const receiptForm = useForm<ReceiptForm>({
    defaultValues: {
      receiptHeader: '',
      receiptFooter: '',
    },
  });
  const branchForm = useForm<BranchForm>({
    defaultValues: {
      branchName: '',
      branchCode: '',
    },
  });

  const refresh = useCallback(async () => {
    const [nextSettings, nextLogs, dbSummary] = await Promise.all([
      getSettingsMap(db),
      getAuditLogs(db, 50),
      getDatabaseSummary(db),
    ]);
    setSettings(nextSettings);
    setLogs(nextLogs);
    setSummary(dbSummary as Record<keyof typeof dbSummary, DatabaseCount['count']>);
    setPaymentSettings(parsePaymentSettings(nextSettings.payment_methods));
    generalForm.reset({
      storeName: nextSettings.store_name ?? 'StoreMate Convenience Store',
      currency: nextSettings.currency ?? 'PHP',
    });
    receiptForm.reset({
      receiptHeader: nextSettings.receipt_header ?? 'StoreMate Convenience Store',
      receiptFooter: nextSettings.receipt_footer ?? 'Thank you for shopping with us.',
    });
    branchForm.reset({
      branchName: nextSettings.branch_name ?? 'Main Branch',
      branchCode: nextSettings.branch_code ?? 'MAIN',
    });
  }, [branchForm, db, generalForm, receiptForm]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const hardwareRows = useMemo(
    () => [
      {
        label: 'Receipt Printer',
        value: settings.hardware_printer ?? 'Not configured',
        icon: 'print-outline' as IconName,
      },
      {
        label: 'Barcode Scanner',
        value: settings.hardware_scanner ?? 'Keyboard wedge scanner',
        icon: 'barcode-outline' as IconName,
      },
      {
        label: 'Cash Drawer',
        value: 'Manual drawer tracking',
        icon: 'file-tray-outline' as IconName,
      },
    ],
    [settings]
  );

  async function persist(values: Record<string, string>, successMessage: string) {
    if (!currentUser) {
      return;
    }

    await saveSettings(db, { userId: currentUser.id, values });
    setMessage(successMessage);
    await refresh();
  }

  async function saveGeneral(values: GeneralForm) {
    await persist(
      {
        store_name: values.storeName,
        currency: values.currency,
      },
      'General settings saved.'
    );
  }

  async function saveReceipt(values: ReceiptForm) {
    await persist(
      {
        receipt_header: values.receiptHeader,
        receipt_footer: values.receiptFooter,
      },
      'Receipt settings saved.'
    );
  }

  async function saveBranch(values: BranchForm) {
    await persist(
      {
        branch_name: values.branchName,
        branch_code: values.branchCode,
      },
      'Branch settings saved.'
    );
  }

  async function savePayments() {
    await persist(
      {
        payment_methods: JSON.stringify(paymentSettings),
      },
      'Payment method settings saved.'
    );
  }

  async function checkDatabaseHealth() {
    setCheckingHealth(true);
    setMessage(null);

    try {
      const result = await runDatabaseIntegrityCheck(db);
      setHealthCheck(result);
      setMessage(result.integrityOk ? 'Database integrity check passed.' : 'Database check found issues.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Database integrity check failed.');
    } finally {
      setCheckingHealth(false);
    }
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Local preferences and offline system configuration"
      actions={
        <Button
          title="System Logs"
          variant="secondary"
          icon="document-text-outline"
          onPress={() => setSelectedSection('logs')}
        />
      }>
      <RequireRole roles={['admin']}>
        <View style={styles.layout}>
          <View style={styles.grid}>
            {sections.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => {
                  setSelectedSection(item.key);
                  setMessage(null);
                }}
                style={[
                  styles.settingCard,
                  selectedSection === item.key && styles.settingCardActive,
                ]}>
                <Ionicons
                  name={item.icon}
                  size={26}
                  color={selectedSection === item.key ? palette.primary : palette.ink}
                />
                <Text
                  style={[
                    styles.settingLabel,
                    selectedSection === item.key && styles.settingLabelActive,
                  ]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.panel}>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            {selectedSection === 'general' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>General Settings</Text>
                <Controller
                  control={generalForm.control}
                  name="storeName"
                  rules={{ required: 'Store name is required.' }}
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Store Name"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                <Controller
                  control={generalForm.control}
                  name="currency"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Currency"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                <Button
                  title="Save General"
                  icon="save-outline"
                  onPress={generalForm.handleSubmit(saveGeneral)}
                />
              </Card>
            ) : null}

            {selectedSection === 'payments' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>Payment Methods</Text>
                <Text style={styles.helperText}>
                  These settings are local configuration flags for the available checkout payment
                  methods.
                </Text>
                <View style={styles.toggleList}>
                  {paymentLabels.map((payment) => (
                    <Pressable
                      key={payment.key}
                      onPress={() =>
                        setPaymentSettings((current) => ({
                          ...current,
                          [payment.key]: !current[payment.key],
                        }))
                      }
                      style={styles.toggleRow}>
                      <Text style={styles.toggleLabel}>{payment.label}</Text>
                      <Badge
                        status={paymentSettings[payment.key] ? 'active' : 'inactive'}
                        label={paymentSettings[payment.key] ? 'Enabled' : 'Disabled'}
                      />
                    </Pressable>
                  ))}
                </View>
                <Button title="Save Payment Methods" icon="save-outline" onPress={savePayments} />
              </Card>
            ) : null}

            {selectedSection === 'receipt' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>Receipt Settings</Text>
                <Controller
                  control={receiptForm.control}
                  name="receiptHeader"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Receipt Header"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                <Controller
                  control={receiptForm.control}
                  name="receiptFooter"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Receipt Footer"
                      multiline
                      onBlur={onBlur}
                      onChangeText={onChange}
                      style={styles.multilineInput}
                      value={value}
                    />
                  )}
                />
                <Button
                  title="Save Receipt"
                  icon="save-outline"
                  onPress={receiptForm.handleSubmit(saveReceipt)}
                />
              </Card>
            ) : null}

            {selectedSection === 'hardware' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>Hardware Setup</Text>
                <Text style={styles.helperText}>
                  Hardware integrations are placeholders in this offline-only version.
                </Text>
                {hardwareRows.map((row) => (
                  <View key={row.label} style={styles.hardwareRow}>
                    <Ionicons name={row.icon} size={22} color={palette.inkMuted} />
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{row.label}</Text>
                      <Text style={styles.rowMeta}>{row.value}</Text>
                    </View>
                    <Badge status="inactive" label="Placeholder" />
                  </View>
                ))}
              </Card>
            ) : null}

            {selectedSection === 'users' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>Users & Roles</Text>
                <Text style={styles.helperText}>
                  User and shift administration lives in the dedicated users screen.
                </Text>
                <Button
                  title="Open Users"
                  icon="people-outline"
                  onPress={() => router.push('/users' as never)}
                />
              </Card>
            ) : null}

            {selectedSection === 'backup' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>Backup & Sync</Text>
                <Text style={styles.helperText}>
                  Sync is intentionally disabled for this version. Future backup/export workflows
                  can be added without changing the local SQLite data model.
                </Text>
                <View style={styles.hardwareRow}>
                  <Ionicons name="cloud-offline-outline" size={22} color={palette.inkMuted} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>Current Mode</Text>
                    <Text style={styles.rowMeta}>{settings.backup_sync_status ?? 'Offline-only mode'}</Text>
                  </View>
                  <Badge status="inactive" label="No Sync" />
                </View>
              </Card>
            ) : null}

            {selectedSection === 'branches' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>Branch Settings</Text>
                <Controller
                  control={branchForm.control}
                  name="branchName"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Branch Name"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                <Controller
                  control={branchForm.control}
                  name="branchCode"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Branch Code"
                      autoCapitalize="characters"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                <Button
                  title="Save Branch"
                  icon="save-outline"
                  onPress={branchForm.handleSubmit(saveBranch)}
                />
              </Card>
            ) : null}

            {selectedSection === 'logs' ? (
              <Card padded={false}>
                <View style={styles.tableHeader}>
                  <Text style={styles.sectionTitle}>System Logs</Text>
                  <Text style={styles.rowMeta}>{logs.length} latest</Text>
                </View>
                <Table
                  columns={logColumns}
                  data={logs}
                  emptyLabel="No audit logs recorded."
                  keyExtractor={(log) => String(log.id)}
                />
              </Card>
            ) : null}

            {selectedSection === 'about' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>About System</Text>
                <View style={styles.aboutGrid}>
                  <AboutMetric label="Version" value="1.0.0" />
                  <AboutMetric label="Products" value={String(summary.products ?? 0)} />
                  <AboutMetric label="Users" value={String(summary.users ?? 0)} />
                  <AboutMetric label="Suppliers" value={String(summary.suppliers ?? 0)} />
                  <AboutMetric label="Categories" value={String(summary.categories ?? 0)} />
                </View>
                <Text style={styles.helperText}>
                  StoreMate POS runs fully offline on the tablet with SQLite persistence.
                </Text>
                <View style={styles.hardwareRow}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={palette.inkMuted} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>SQLite Integrity</Text>
                    <Text style={styles.rowMeta}>
                      {healthCheck
                        ? `${healthCheck.integrityMessages.join(', ')} | FK issues: ${healthCheck.foreignKeyViolations}`
                        : 'Not checked this session'}
                    </Text>
                  </View>
                  {healthCheck ? (
                    <Badge
                      status={healthCheck.integrityOk ? 'active' : 'critical'}
                      label={healthCheck.integrityOk ? 'OK' : 'Issue'}
                    />
                  ) : null}
                </View>
                <Button
                  title="Run Integrity Check"
                  icon="shield-checkmark-outline"
                  loading={checkingHealth}
                  onPress={checkDatabaseHealth}
                />
              </Card>
            ) : null}
          </View>
        </View>
      </RequireRole>
    </AppShell>
  );
}

function AboutMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.aboutMetric}>
      <Text style={styles.aboutLabel}>{label}</Text>
      <Text style={styles.aboutValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    maxWidth: 520,
  },
  settingCard: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 118,
    padding: spacing.sm,
    width: 150,
  },
  settingCardActive: {
    borderColor: palette.primary,
    borderWidth: 2,
  },
  settingLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingLabelActive: {
    color: palette.primaryDark,
  },
  panel: {
    flex: 1,
    gap: spacing.md,
    minWidth: 360,
  },
  formCard: {
    gap: spacing.md,
    maxWidth: 720,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  helperText: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  multilineInput: {
    minHeight: 82,
    textAlignVertical: 'top',
  },
  toggleList: {
    gap: spacing.xs,
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
  },
  toggleLabel: {
    color: palette.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  hardwareRow: {
    alignItems: 'center',
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  rowMeta: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  tableText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  aboutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  aboutMetric: {
    backgroundColor: palette.canvas,
    borderRadius: radii.sm,
    flexBasis: 120,
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  aboutLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  aboutValue: {
    color: palette.primary,
    fontSize: 20,
    fontWeight: '900',
  },
  message: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
});
