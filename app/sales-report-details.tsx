import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table, type TableColumn } from '@/components/ui/Table';
import { palette, spacing } from '@/constants/theme';
import { getReportSummary, getSalesReportRows } from '@/lib/database/reports';
import type { ReportRange, ReportSummary, SalesReportRow } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';

const ranges: ReportRange[] = ['daily', 'weekly', 'monthly'];

const emptySummary: ReportSummary = {
  total_sales: 0,
  total_transactions: 0,
  average_basket: 0,
  items_sold: 0,
  discounts: 0,
  returns: 0,
  cancelled_transactions: 0,
  net_sales: 0,
};

const saleColumns: TableColumn<SalesReportRow>[] = [
  { key: 'receipt', title: 'Receipt', accessor: 'receipt_number', width: 160 },
  {
    key: 'date',
    title: 'Completed',
    width: 170,
    render: (sale) => <Text style={styles.tableText}>{formatDateTime(sale.completed_at)}</Text>,
  },
  { key: 'cashier', title: 'Cashier', accessor: 'cashier_name', width: 160 },
  { key: 'items', title: 'Items', accessor: 'item_count', width: 80, align: 'right' },
  { key: 'payments', title: 'Payment', accessor: 'payment_methods', width: 130 },
  { key: 'status', title: 'Status', accessor: 'status', width: 120 },
  {
    key: 'discounts',
    title: 'Discount',
    width: 120,
    align: 'right',
    render: (sale) => <Text style={styles.tableText}>{formatCurrency(sale.discount_total)}</Text>,
  },
  {
    key: 'net',
    title: 'Net Sales',
    width: 120,
    align: 'right',
    render: (sale) => <Text style={styles.tableText}>{formatCurrency(sale.net_sales)}</Text>,
  },
];

export default function SalesReportDetailsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams<{ range?: string }>();
  const [range, setRange] = useState<ReportRange>(
    ranges.includes(params.range as ReportRange) ? (params.range as ReportRange) : 'daily'
  );
  const [rangeLabel, setRangeLabel] = useState('');
  const [summary, setSummary] = useState<ReportSummary>(emptySummary);
  const [rows, setRows] = useState<SalesReportRow[]>([]);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [summaryResult, reportRows] = await Promise.all([
        getReportSummary(db, range),
        getSalesReportRows(db, range, 100),
      ]);

      if (mounted) {
        setRangeLabel(summaryResult.bounds.label);
        setSummary(summaryResult.summary);
        setRows(reportRows);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [db, range]);

  return (
    <AppShell
      title="Sales Report Details"
      subtitle={rangeLabel || 'Local sales details'}
      actions={<Button title="Back" variant="secondary" icon="arrow-back" onPress={() => router.back()} />}>
      <RequireRole roles={['supervisor', 'admin']}>
        <View style={styles.tabs}>
          {ranges.map((option) => (
            <Button
              key={option}
              title={option}
              variant={range === option ? 'primary' : 'secondary'}
              onPress={() => setRange(option)}
            />
          ))}
        </View>

        <Card style={styles.summaryCard}>
          <ReportLine label="Total Sales" value={formatCurrency(summary.total_sales)} />
          <ReportLine label="Total Transactions" value={summary.total_transactions.toLocaleString()} />
          <ReportLine
            label="Cancelled Transactions"
            value={summary.cancelled_transactions.toLocaleString()}
          />
          <ReportLine label="Discounts" value={formatCurrency(summary.discounts)} />
          <ReportLine label="Returns" value={formatCurrency(summary.returns)} />
          <ReportLine label="Net Sales" value={formatCurrency(summary.net_sales)} emphasized />
        </Card>

        <Card padded={false}>
          <View style={styles.tableHeader}>
            <Text style={styles.sectionTitle}>Sales</Text>
            <Text style={styles.mutedText}>{rows.length} rows</Text>
          </View>
          <Table
            columns={saleColumns}
            data={rows}
            emptyLabel="No sales found for this range."
            keyExtractor={(sale) => String(sale.id)}
          />
        </Card>

        {exportMessage ? <Text style={styles.exportMessage}>{exportMessage}</Text> : null}
        <Button
          title="Export Report"
          icon="download-outline"
          variant="outline"
          onPress={() => setExportMessage('Export placeholder: local file export will be added later.')}
        />
      </RequireRole>
    </AppShell>
  );
}

function ReportLine({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.reportLine}>
      <Text style={styles.reportLabel}>{label}</Text>
      <Text style={[styles.reportValue, emphasized && styles.reportValueEmphasized]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCard: {
    gap: 0,
    maxWidth: 680,
  },
  reportLine: {
    alignItems: 'center',
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
  },
  reportLabel: {
    color: palette.inkMuted,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  reportValue: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  reportValueEmphasized: {
    color: palette.primary,
    fontSize: 16,
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
  tableText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  exportMessage: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
});
