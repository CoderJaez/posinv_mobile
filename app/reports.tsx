import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RequireRole } from '@/components/auth/RequireRole';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateInput } from '@/components/ui/date-input';
import { ScreenState } from '@/components/ui/ScreenState';
import { palette, radii, spacing } from '@/constants/theme';
import {
  getHourlySales,
  getPaymentBreakdown,
  getReportSummary,
  getSalesReportRows,
  getTopSellingProducts,
  type ReportDateFilter,
} from '@/lib/database/reports';
import type {
  HourlySalesPoint,
  PaymentBreakdown,
  ReportRange,
  ReportSummary,
  TopSellingProduct,
} from '@/lib/database/types';
import { buildReportInsights } from '@/lib/domain/reports';
import { formatCurrency } from '@/lib/format';
import { exportReportPdf } from '@/lib/printing/report';

const rangeOptions: { label: string; value: ReportRange }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
];

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

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [range, setRange] = useState<ReportRange>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rangeLabel, setRangeLabel] = useState('');
  const [summary, setSummary] = useState<ReportSummary>(emptySummary);
  const [hourlySales, setHourlySales] = useState<HourlySalesPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopSellingProduct[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const dateFilter = useMemo<ReportDateFilter>(
    () => ({
      startDate,
      endDate,
    }),
    [endDate, startDate]
  );

  const loadReports = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [summaryResult, hourly, topSelling, payments] = await Promise.all([
        getReportSummary(db, range, dateFilter),
        getHourlySales(db, range, dateFilter),
        getTopSellingProducts(db, range, 5, dateFilter),
        getPaymentBreakdown(db, range, dateFilter),
      ]);

      setRangeLabel(summaryResult.bounds.label);
      setSummary(summaryResult.summary);
      setHourlySales(hourly);
      setTopProducts(topSelling);
      setPaymentBreakdown(payments);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, db, range]);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports])
  );

  const maxHourlySales = useMemo(
    () => Math.max(1, ...hourlySales.map((point) => point.total_sales)),
    [hourlySales]
  );
  const activeHours = hourlySales.filter(
    (point) => point.total_sales > 0 || point.transaction_count > 0
  );
  const chartPoints = activeHours.length > 0 ? activeHours : hourlySales.filter((_, index) => index % 3 === 0);
  const insights = useMemo(
    () =>
      buildReportInsights(
        {
          summary,
          hourlySales,
          topProducts,
          paymentBreakdown,
        },
        formatCurrency
      ),
    [hourlySales, paymentBreakdown, summary, topProducts]
  );

  async function exportCurrentReport() {
    setExporting(true);
    setExportMessage(null);

    try {
      const [summaryResult, hourly, topSelling, payments, salesRows] = await Promise.all([
        getReportSummary(db, range, dateFilter),
        getHourlySales(db, range, dateFilter),
        getTopSellingProducts(db, range, 10, dateFilter),
        getPaymentBreakdown(db, range, dateFilter),
        getSalesReportRows(db, range, 500, dateFilter),
      ]);
      const reportInsights = buildReportInsights(
        {
          summary: summaryResult.summary,
          hourlySales: hourly,
          topProducts: topSelling,
          paymentBreakdown: payments,
        },
        formatCurrency
      );
      const message = await exportReportPdf({
        title: 'Sales Report',
        range,
        rangeLabel: summaryResult.bounds.label,
        generatedAt: new Date(),
        summary: summaryResult.summary,
        insights: reportInsights,
        hourlySales: hourly,
        topProducts: topSelling,
        paymentBreakdown: payments,
        salesRows,
      });

      setExportMessage(message);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Unable to export report PDF.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell
      title="Reports Dashboard"
      subtitle="Offline analytics from local sales, items, and payments"
      actions={
        <>
          <Button title={rangeLabel || 'Current Range'} variant="secondary" icon="calendar-outline" />
          <Button
            title="Details"
            icon="document-text-outline"
            onPress={() =>
              router.push({
                pathname: '/sales-report-details',
                params: { range, startDate, endDate },
              } as never)
            }
          />
          <Button
            title="Export PDF"
            icon="download-outline"
            variant="outline"
            disabled={loading}
            loading={exporting}
            onPress={exportCurrentReport}
          />
        </>
      }>
      <RequireRole roles={['supervisor', 'admin']}>
        <View style={styles.rangeRow}>
          {rangeOptions.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setRange(option.value)}
              style={[styles.rangePill, range === option.value && styles.rangePillActive]}>
              <Text
                style={[
                  styles.rangeText,
                  range === option.value && styles.rangeTextActive,
                ]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Card style={styles.filterCard}>
          <Text style={styles.sectionTitle}>Date Range Filter</Text>
          <View style={styles.filterRow}>
            <DateInput
              label="Start Date"
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              containerStyle={styles.dateInput}
            />
            <DateInput
              label="End Date"
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              containerStyle={styles.dateInput}
            />
            <Button
              title="Clear Dates"
              icon="close-outline"
              variant="secondary"
              onPress={() => {
                setStartDate('');
                setEndDate('');
              }}
              style={styles.clearButton}
            />
          </View>
          <Text style={styles.mutedText}>
            Leave dates blank to use the selected daily, weekly, or monthly range.
          </Text>
        </Card>
        {exportMessage ? <Text style={styles.exportMessage}>{exportMessage}</Text> : null}

        {loading ? (
          <Card>
            <ScreenState
              loading
              title="Loading reports"
              description="Calculating totals from local sales records."
            />
          </Card>
        ) : loadError ? (
          <Card>
            <ScreenState
              icon="warning-outline"
              title="Reports could not be loaded"
              description={loadError}
            />
          </Card>
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <Metric label="Total Sales" value={formatCurrency(summary.total_sales)} />
              <Metric label="Transactions" value={summary.total_transactions.toLocaleString()} />
              <Metric label="Average Basket" value={formatCurrency(summary.average_basket)} />
              <Metric label="Items Sold" value={summary.items_sold.toLocaleString()} />
            </View>

            <Card style={styles.insightsCard}>
              <Text style={styles.sectionTitle}>Analytics Insights</Text>
              <View style={styles.insightList}>
                {insights.map((insight) => (
                  <View key={insight} style={styles.insightRow}>
                    <View style={styles.insightDot} />
                    <Text style={styles.insightText}>{insight}</Text>
                  </View>
                ))}
              </View>
            </Card>

            <View style={styles.reportGrid}>
              <Card style={styles.chartCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.sectionTitle}>Hourly Sales</Text>
                  <Text style={styles.mutedText}>{rangeLabel}</Text>
                </View>
                <View style={styles.chart}>
                  {chartPoints.map((point) => {
                    const height =
                      point.total_sales > 0
                        ? Math.max(10, (point.total_sales / maxHourlySales) * 150)
                        : 0;

                    return (
                      <View key={point.hour} style={styles.barColumn}>
                        <View style={styles.barTrack}>
                          <View style={[styles.bar, { height }]} />
                        </View>
                        <Text style={styles.barLabel}>{point.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>

              <Card style={styles.topCard}>
                <Text style={styles.sectionTitle}>Top Selling Items</Text>
                <View style={styles.topList}>
                  {topProducts.length === 0 ? (
                    <Text style={styles.emptyText}>No completed sales in this range.</Text>
                  ) : (
                    topProducts.map((item, index) => (
                      <View key={item.product_id} style={styles.topRow}>
                        <Text style={styles.rank}>{index + 1}</Text>
                        <View style={styles.topCopy}>
                          <Text style={styles.topName}>{item.product_name}</Text>
                          <Text style={styles.mutedText}>{formatCurrency(item.total_sales)}</Text>
                        </View>
                        <Text style={styles.topSold}>{item.quantity_sold}</Text>
                      </View>
                    ))
                  )}
                </View>
              </Card>
            </View>

            <View style={styles.reportGrid}>
              <Card style={styles.breakdownCard}>
                <Text style={styles.sectionTitle}>Payment Breakdown</Text>
                <View style={styles.paymentList}>
                  {paymentBreakdown.length === 0 ? (
                    <Text style={styles.emptyText}>No payments recorded.</Text>
                  ) : (
                    paymentBreakdown.map((payment) => (
                      <View key={payment.method} style={styles.paymentRow}>
                        <Text style={styles.paymentMethod}>{payment.method.toUpperCase()}</Text>
                        <Text style={styles.paymentCount}>{payment.transaction_count} txns</Text>
                        <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                      </View>
                    ))
                  )}
                </View>
              </Card>

              <Card style={styles.breakdownCard}>
                <Text style={styles.sectionTitle}>Sales Quality</Text>
                <View style={styles.qualityGrid}>
                  <Metric label="Discounts" value={formatCurrency(summary.discounts)} compact />
                  <Metric label="Returns" value={formatCurrency(summary.returns)} compact />
                  <Metric
                    label="Cancelled"
                    value={summary.cancelled_transactions.toLocaleString()}
                    compact
                  />
                  <Metric label="Net Sales" value={formatCurrency(summary.net_sales)} compact />
                </View>
              </Card>
            </View>
          </>
        )}
      </RequireRole>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <Card style={compact ? styles.compactKpiCard : styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, compact && styles.compactMetricValue]}>{value}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  rangePill: {
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  rangePillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  rangeText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  rangeTextActive: {
    color: palette.surface,
  },
  filterCard: {
    gap: spacing.sm,
  },
  filterRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  dateInput: {
    flexBasis: 180,
    flexGrow: 1,
    maxWidth: 240,
  },
  clearButton: {
    minWidth: 140,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  kpiCard: {
    flexBasis: 180,
    flexGrow: 1,
    gap: spacing.xs,
  },
  compactKpiCard: {
    flexBasis: 150,
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 150,
  },
  kpiLabel: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  kpiValue: {
    color: palette.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  compactMetricValue: {
    fontSize: 18,
  },
  reportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  insightsCard: {
    gap: spacing.sm,
  },
  insightList: {
    gap: spacing.sm,
  },
  insightRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  insightDot: {
    backgroundColor: palette.primary,
    borderRadius: radii.pill,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  insightText: {
    color: palette.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  chartCard: {
    flex: 2,
    minWidth: 420,
  },
  topCard: {
    flex: 1,
    minWidth: 280,
  },
  breakdownCard: {
    flex: 1,
    minWidth: 320,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  mutedText: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  chart: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    height: 190,
    marginTop: spacing.md,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
  },
  barTrack: {
    backgroundColor: palette.canvas,
    borderRadius: radii.sm,
    height: 160,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: '100%',
  },
  bar: {
    backgroundColor: palette.primary,
    borderRadius: radii.sm,
  },
  barLabel: {
    color: palette.inkMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  topList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rank: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '900',
    width: 18,
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  topName: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  topSold: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyText: {
    color: palette.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  paymentList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  paymentRow: {
    alignItems: 'center',
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 42,
  },
  paymentMethod: {
    color: palette.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  paymentCount: {
    color: palette.inkMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  paymentAmount: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
    minWidth: 92,
    textAlign: 'right',
  },
  qualityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  exportMessage: {
    color: palette.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
});
