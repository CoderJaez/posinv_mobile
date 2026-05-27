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
import { Modal } from '@/components/ui/Modal';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, radii, spacing } from '@/constants/theme';
import { exportDatabaseBackup, importDatabaseBackup } from '@/lib/database/backup';
import {
  createCategory,
  deleteCategory,
  deleteProduct,
  getCategoryManagementItems,
  getProductManagementItems,
  updateCategory,
  type CategoryInput,
} from '@/lib/database/inventory';
import { getRecentPrintJobs } from '@/lib/database/printing';
import { runDatabaseIntegrityCheck, type DatabaseHealthCheck } from '@/lib/database/health';
import { getDatabaseSummary } from '@/lib/database/queries';
import { getAuditLogs, getSettingsMap, saveSettings } from '@/lib/database/settings';
import type {
  AuditLogItem,
  CategoryManagementItem,
  DatabaseCount,
  PaymentMethod,
  PrintJob,
  ProductListItem,
} from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { useAppStore } from '@/lib/store/app-store';

type IconName = ComponentProps<typeof Ionicons>['name'];
type SettingsSection =
  | 'general'
  | 'payments'
  | 'receipt'
  | 'hardware'
  | 'categories'
  | 'products'
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

type CategoryForm = {
  name: string;
  sortOrder: string;
};

type PrinterForm = {
  printerName: string;
  printerAddress: string;
  paperWidth: string;
  connectionType: 'bluetooth' | 'system';
};

type PaymentSettings = Record<PaymentMethod, boolean>;

const sections: { key: SettingsSection; label: string; icon: IconName }[] = [
  { key: 'general', label: 'General', icon: 'settings-outline' },
  { key: 'payments', label: 'Payment Methods', icon: 'card-outline' },
  { key: 'receipt', label: 'Receipt Settings', icon: 'receipt-outline' },
  { key: 'hardware', label: 'Hardware Setup', icon: 'desktop-outline' },
  { key: 'categories', label: 'Categories', icon: 'pricetags-outline' },
  { key: 'products', label: 'Products', icon: 'cube-outline' },
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

const printJobColumns: TableColumn<PrintJob>[] = [
  { key: 'receipt', title: 'Receipt', accessor: 'receipt_number', width: 160 },
  { key: 'printer', title: 'Printer', accessor: 'printer_name', width: 170 },
  { key: 'address', title: 'Address', accessor: 'printer_address', width: 170 },
  {
    key: 'status',
    title: 'Status',
    width: 110,
    render: (job) => (
      <Badge
        status={job.status === 'sent' ? 'active' : job.status === 'failed' ? 'critical' : 'inactive'}
        label={job.status.toUpperCase()}
      />
    ),
  },
  {
    key: 'date',
    title: 'Created',
    width: 170,
    render: (job) => <Text style={styles.tableText}>{formatDateTime(job.created_at)}</Text>,
  },
  {
    key: 'error',
    title: 'Error',
    accessor: 'error_message',
    width: 220,
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
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [categories, setCategories] = useState<CategoryManagementItem[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [deletingProduct, setDeletingProduct] = useState<ProductListItem | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
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
  const categoryForm = useForm<CategoryForm>({
    defaultValues: {
      name: '',
      sortOrder: '0',
    },
  });
  const printerForm = useForm<PrinterForm>({
    defaultValues: {
      printerName: '',
      printerAddress: '',
      paperWidth: '58mm',
      connectionType: 'bluetooth',
    },
  });

  const refresh = useCallback(async () => {
    const [nextSettings, nextLogs, nextPrintJobs, nextCategories, nextProducts, dbSummary] = await Promise.all([
      getSettingsMap(db),
      getAuditLogs(db, 50),
      getRecentPrintJobs(db, 15),
      getCategoryManagementItems(db),
      getProductManagementItems(db),
      getDatabaseSummary(db),
    ]);
    setSettings(nextSettings);
    setLogs(nextLogs);
    setPrintJobs(nextPrintJobs);
    setCategories(nextCategories);
    setProducts(nextProducts);
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
    printerForm.reset({
      printerName: nextSettings.printer_name ?? '',
      printerAddress: nextSettings.printer_address ?? '',
      paperWidth: nextSettings.printer_paper_width ?? '58mm',
      connectionType: nextSettings.printer_connection_type === 'system' ? 'system' : 'bluetooth',
    });
  }, [branchForm, db, generalForm, printerForm, receiptForm]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const hardwareRows = useMemo(
    () => [
      {
        label: 'Receipt Printer',
        value:
          settings.printer_name || settings.hardware_printer
            ? `${settings.printer_name || settings.hardware_printer} (${settings.printer_connection_type ?? 'bluetooth'})`
            : 'Not configured',
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

  const filteredCategories = useMemo(() => {
    const normalizedSearch = categorySearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return categories;
    }

    return categories.filter((category) =>
      category.name.toLowerCase().includes(normalizedSearch)
    );
  }, [categories, categorySearch]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = productSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return products;
    }

    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.sku.toLowerCase().includes(normalizedSearch) ||
        product.category_name.toLowerCase().includes(normalizedSearch) ||
        product.barcode?.toLowerCase().includes(normalizedSearch)
    );
  }, [productSearch, products]);

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

  function startEditCategory(category: CategoryManagementItem) {
    setEditingCategoryId(category.id);
    categoryForm.reset({
      name: category.name,
      sortOrder: String(category.sort_order),
    });
    setMessage(null);
  }

  function cancelCategoryEdit() {
    setEditingCategoryId(null);
    categoryForm.reset({
      name: '',
      sortOrder: '0',
    });
    setMessage(null);
  }

  async function saveCategory(values: CategoryForm) {
    if (!currentUser) {
      return;
    }

    const input: CategoryInput = {
      name: values.name,
      sortOrder: Number(values.sortOrder || 0),
    };

    try {
      if (editingCategoryId) {
        await updateCategory(db, editingCategoryId, input, currentUser.id);
        setMessage('Category updated.');
      } else {
        await createCategory(db, input, currentUser.id);
        setMessage('Category added.');
      }

      setEditingCategoryId(null);
      categoryForm.reset({
        name: '',
        sortOrder: '0',
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save category.');
    }
  }

  async function removeCategory(category: CategoryManagementItem) {
    if (!currentUser) {
      return;
    }

    try {
      await deleteCategory(db, category.id, currentUser.id);
      if (editingCategoryId === category.id) {
        setEditingCategoryId(null);
        categoryForm.reset({
          name: '',
          sortOrder: '0',
        });
      }
      setMessage('Category deleted.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete category.');
    }
  }

  async function confirmDeleteProduct() {
    if (!currentUser || !deletingProduct) {
      return;
    }

    try {
      await deleteProduct(db, deletingProduct.id, currentUser.id);
      setDeletingProduct(null);
      setMessage('Product deleted.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete product.');
    }
  }

  async function savePayments() {
    await persist(
      {
        payment_methods: JSON.stringify(paymentSettings),
      },
      'Payment method settings saved.'
    );
  }

  async function savePrinter(values: PrinterForm) {
    await persist(
      {
        printer_connection_type: values.connectionType,
        printer_name: values.printerName,
        printer_address: values.printerAddress,
        printer_paper_width: values.paperWidth,
        hardware_printer: values.printerName || 'Not configured',
      },
      'Printer settings saved.'
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

  async function exportBackup() {
    setExportingBackup(true);
    setMessage(null);

    try {
      const result = await exportDatabaseBackup(db, {
        userId: currentUser?.id ?? null,
        share: true,
      });
      setMessage(
        result.shared
          ? `Database backup exported: ${result.name}`
          : `Database backup saved locally: ${result.uri}`
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Database export failed.');
    } finally {
      setExportingBackup(false);
    }
  }

  async function importBackup() {
    setImportingBackup(true);
    setMessage(null);

    try {
      const result = await importDatabaseBackup(db, {
        userId: currentUser?.id ?? null,
      });
      setMessage(
        `Database backup imported from ${result.sourceName}. Safety copy saved at ${result.safetyBackupUri}.`
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Database import failed.');
    } finally {
      setImportingBackup(false);
    }
  }

  const categoryColumns: TableColumn<CategoryManagementItem>[] = [
    { key: 'name', title: 'Category', accessor: 'name', width: 220 },
    { key: 'sort', title: 'Sort', accessor: 'sort_order', width: 80, align: 'right' },
    { key: 'products', title: 'Products', accessor: 'product_count', width: 100, align: 'right' },
    {
      key: 'status',
      title: 'Status',
      width: 110,
      render: (category) => (
        <Badge
          status={category.is_active ? 'active' : 'inactive'}
          label={category.is_active ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      key: 'actions',
      title: '',
      width: 190,
      render: (category) => (
        <View style={styles.rowActions}>
          <Button
            title="Edit"
            size="sm"
            variant="outline"
            onPress={() => startEditCategory(category)}
          />
          <Button
            title="Delete"
            size="sm"
            variant="danger"
            disabled={category.product_count > 0}
            onPress={() => removeCategory(category)}
          />
        </View>
      ),
    },
  ];

  const productColumns: TableColumn<ProductListItem>[] = [
    { key: 'name', title: 'Product', accessor: 'name', width: 220 },
    { key: 'sku', title: 'SKU', accessor: 'sku', width: 110 },
    { key: 'category', title: 'Category', accessor: 'category_name', width: 140 },
    {
      key: 'price',
      title: 'Price',
      width: 110,
      align: 'right',
      render: (product) => (
        <Text style={styles.tableText}>
          {formatCurrency(product.promo_price ?? product.regular_price)}
        </Text>
      ),
    },
    { key: 'stock', title: 'Stock', accessor: 'current_stock', width: 90, align: 'right' },
    {
      key: 'actions',
      title: '',
      width: 180,
      render: (product) => (
        <View style={styles.rowActions}>
          <Button
            title="Edit"
            size="sm"
            variant="outline"
            onPress={() =>
              router.push({
                pathname: '/product-form',
                params: { productId: String(product.id) },
              } as never)
            }
          />
          <Button
            title="Delete"
            size="sm"
            variant="danger"
            disabled={product.current_stock !== 0}
            onPress={() => setDeletingProduct(product)}
          />
        </View>
      ),
    },
  ];

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
                  Configure the receipt printer profile used for receipt print jobs. Direct
                  Bluetooth ESC/POS discovery requires a development build/native adapter; this
                  screen stores the printer profile and logs print attempts locally.
                </Text>
                {hardwareRows.map((row) => (
                  <View key={row.label} style={styles.hardwareRow}>
                    <Ionicons name={row.icon} size={22} color={palette.inkMuted} />
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{row.label}</Text>
                      <Text style={styles.rowMeta}>{row.value}</Text>
                    </View>
                    {row.label === 'Receipt Printer' ? (
                      <Badge
                        status={settings.printer_name ? 'active' : 'inactive'}
                        label={settings.printer_name ? 'Configured' : 'Not Set'}
                      />
                    ) : (
                      <Badge status="inactive" label="Placeholder" />
                    )}
                  </View>
                ))}
                <Controller
                  control={printerForm.control}
                  name="connectionType"
                  render={({ field: { onChange, value } }) => (
                    <View style={styles.connectionGroup}>
                      <Text style={styles.fieldLabel}>Connection Mode</Text>
                      <View style={styles.connectionRow}>
                        {[
                          { key: 'bluetooth', label: 'Bluetooth' },
                          { key: 'system', label: 'System Print' },
                        ].map((option) => (
                          <Pressable
                            key={option.key}
                            onPress={() => onChange(option.key)}
                            style={[
                              styles.connectionOption,
                              value === option.key && styles.connectionOptionActive,
                            ]}>
                            <Text
                              style={[
                                styles.connectionText,
                                value === option.key && styles.connectionTextActive,
                              ]}>
                              {option.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                />
                <Controller
                  control={printerForm.control}
                  name="printerName"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Bluetooth Printer Name"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      placeholder="POS-58BT"
                      value={value}
                    />
                  )}
                />
                <Controller
                  control={printerForm.control}
                  name="printerAddress"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Bluetooth MAC / Device Address"
                      autoCapitalize="characters"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      placeholder="00:11:22:33:44:55"
                      value={value}
                    />
                  )}
                />
                <Controller
                  control={printerForm.control}
                  name="paperWidth"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <Input
                      label="Paper Width"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                    />
                  )}
                />
                <Button
                  title="Save Printer"
                  icon="save-outline"
                  onPress={printerForm.handleSubmit(savePrinter)}
                />
                <View style={styles.tableHeaderCompact}>
                  <Text style={styles.sectionTitle}>Recent Print Jobs</Text>
                  <Text style={styles.rowMeta}>{printJobs.length} latest</Text>
                </View>
                <Table
                  columns={printJobColumns}
                  data={printJobs}
                  emptyLabel="No receipt print jobs yet."
                  keyExtractor={(job) => String(job.id)}
                />
              </Card>
            ) : null}

            {selectedSection === 'categories' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>Category Management</Text>
                <Text style={styles.helperText}>
                  Manage active product categories used by POS filters, inventory, stock-in, and
                  promotions. Categories with products must be reassigned before deletion.
                </Text>
                <Input
                  label="Search Categories"
                  icon="search-outline"
                  value={categorySearch}
                  onChangeText={setCategorySearch}
                  placeholder="Search category name..."
                />
                <View style={styles.inlineForm}>
                  <Controller
                    control={categoryForm.control}
                    name="name"
                    rules={{ required: 'Category name is required.' }}
                    render={({ field: { onBlur, onChange, value } }) => (
                      <Input
                        label="Category Name"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                        containerStyle={styles.inlineFormMain}
                      />
                    )}
                  />
                  <Controller
                    control={categoryForm.control}
                    name="sortOrder"
                    render={({ field: { onBlur, onChange, value } }) => (
                      <Input
                        label="Sort Order"
                        keyboardType="number-pad"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                        containerStyle={styles.inlineFormSort}
                      />
                    )}
                  />
                </View>
                {categoryForm.formState.errors.name ? (
                  <Text style={styles.errorText}>{categoryForm.formState.errors.name.message}</Text>
                ) : null}
                <View style={styles.formActions}>
                  {editingCategoryId ? (
                    <Button
                      title="Cancel"
                      variant="secondary"
                      icon="close-outline"
                      onPress={cancelCategoryEdit}
                      style={styles.formActionButton}
                    />
                  ) : null}
                  <Button
                    title={editingCategoryId ? 'Update Category' : 'Add Category'}
                    icon={editingCategoryId ? 'save-outline' : 'add'}
                    onPress={categoryForm.handleSubmit(saveCategory)}
                    style={styles.formActionButton}
                  />
                </View>
                <Table
                  columns={categoryColumns}
                  data={filteredCategories}
                  emptyLabel="No categories found."
                  keyExtractor={(category) => String(category.id)}
                />
              </Card>
            ) : null}

            {selectedSection === 'products' ? (
              <Card style={styles.formCard}>
                <Text style={styles.sectionTitle}>Product Management</Text>
                <Text style={styles.helperText}>
                  Delete is available only for active products with zero current stock and no
                  remaining batch quantity.
                </Text>
                <Input
                  label="Search Products"
                  icon="search-outline"
                  value={productSearch}
                  onChangeText={setProductSearch}
                  placeholder="Search product, SKU, barcode, category..."
                />
                <Table
                  columns={productColumns}
                  data={filteredProducts}
                  emptyLabel="No products found."
                  keyExtractor={(product) => String(product.id)}
                />
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
                  Sync remains disabled for this version. Export creates a full local SQLite backup
                  file. Import restores a selected SQLite backup and saves a safety copy first.
                </Text>
                <View style={styles.hardwareRow}>
                  <Ionicons name="cloud-offline-outline" size={22} color={palette.inkMuted} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>Current Mode</Text>
                    <Text style={styles.rowMeta}>{settings.backup_sync_status ?? 'Offline-only mode'}</Text>
                  </View>
                  <Badge status="inactive" label="No Sync" />
                </View>
                <View style={styles.backupActions}>
                  <Button
                    title="Export Database"
                    icon="download-outline"
                    loading={exportingBackup}
                    onPress={exportBackup}
                    style={styles.backupButton}
                  />
                  <Button
                    title="Import Database"
                    icon="cloud-upload-outline"
                    variant="outline"
                    loading={importingBackup}
                    onPress={importBackup}
                    style={styles.backupButton}
                  />
                </View>
                <Text style={styles.helperText}>
                  App updates keep this database in place as long as the app package ID stays the
                  same and the app is updated over the existing install.
                </Text>
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

        <Modal
          visible={deletingProduct != null}
          title="Delete Product"
          onClose={() => setDeletingProduct(null)}
          footer={
            <View style={styles.modalFooter}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setDeletingProduct(null)}
                style={styles.modalButton}
              />
              <Button
                title="Delete"
                variant="danger"
                icon="trash-outline"
                onPress={confirmDeleteProduct}
                style={styles.modalButton}
              />
            </View>
          }>
          <Text style={styles.modalText}>
            Delete {deletingProduct?.name ?? 'this product'} from active product lists? This is
            allowed only when stock and batch quantities are zero.
          </Text>
        </Modal>
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
  inlineForm: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inlineFormMain: {
    flexBasis: 260,
    flexGrow: 1,
  },
  inlineFormSort: {
    flexBasis: 140,
  },
  formActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  formActionButton: {
    minWidth: 150,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  backupActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  backupButton: {
    minWidth: 180,
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
  tableHeaderCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  fieldLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  connectionGroup: {
    gap: spacing.xs,
  },
  connectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  connectionOption: {
    alignItems: 'center',
    borderColor: palette.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  connectionOptionActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  connectionText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  connectionTextActive: {
    color: palette.surface,
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
  errorText: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '800',
  },
});
