import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  HourlySalesPoint,
  PaymentBreakdown,
  ReportRange,
  ReportSummary,
  SalesReportRow,
  TopSellingProduct,
} from './types';

type RangeBounds = {
  start: string;
  end: string;
  label: string;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function toSqlDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatRangeLabel(range: ReportRange, start: Date, end: Date) {
  if (range === 'daily') {
    return start.toLocaleDateString(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  }

  if (range === 'weekly') {
    const endInclusive = addDays(end, -1);
    return `${start.toLocaleDateString(undefined, {
      month: 'short',
      day: '2-digit',
    })} - ${endInclusive.toLocaleDateString(undefined, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    })}`;
  }

  return start.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function getReportRangeBounds(
  range: ReportRange,
  referenceDate = new Date()
): RangeBounds {
  let start = startOfDay(referenceDate);
  let end: Date;

  if (range === 'daily') {
    end = addDays(start, 1);
  } else if (range === 'weekly') {
    const day = start.getDay();
    start = addDays(start, -day);
    end = addDays(start, 7);
  } else {
    start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    end = addMonths(start, 1);
  }

  return {
    start: toSqlDateTime(start),
    end: toSqlDateTime(end),
    label: formatRangeLabel(range, start, end),
  };
}

export async function getReportSummary(db: SQLiteDatabase, range: ReportRange) {
  const bounds = getReportRangeBounds(range);
  const summary = await db.getFirstAsync<ReportSummary>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END), 0) as total_sales,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as total_transactions,
       COALESCE(AVG(CASE WHEN status = 'completed' THEN total END), 0) as average_basket,
       COALESCE((
         SELECT SUM(sale_items.quantity)
         FROM sale_items
         INNER JOIN sales sale_filter ON sale_filter.id = sale_items.sale_id
         WHERE sale_filter.completed_at >= ?
           AND sale_filter.completed_at < ?
           AND sale_filter.status = 'completed'
       ), 0) as items_sold,
       COALESCE(SUM(discount_total), 0) as discounts,
       COALESCE((
         SELECT SUM(ABS(sale_adjustments.amount_delta))
         FROM sale_adjustments
         INNER JOIN sales adjustment_sale ON adjustment_sale.id = sale_adjustments.sale_id
         WHERE adjustment_sale.completed_at >= ?
           AND adjustment_sale.completed_at < ?
           AND sale_adjustments.amount_delta < 0
       ), 0) +
       COALESCE(SUM(CASE WHEN status = 'refunded' THEN total ELSE 0 END), 0) as returns,
       COALESCE(SUM(CASE WHEN status = 'voided' THEN 1 ELSE 0 END), 0) as cancelled_transactions,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN net_sales ELSE 0 END), 0) as net_sales
     FROM sales
     WHERE completed_at >= ?
       AND completed_at < ?`,
    bounds.start,
    bounds.end,
    bounds.start,
    bounds.end,
    bounds.start,
    bounds.end
  );

  return {
    bounds,
    summary: summary ?? {
      total_sales: 0,
      total_transactions: 0,
      average_basket: 0,
      items_sold: 0,
      discounts: 0,
      returns: 0,
      cancelled_transactions: 0,
      net_sales: 0,
    },
  };
}

export async function getHourlySales(db: SQLiteDatabase, range: ReportRange) {
  const bounds = getReportRangeBounds(range);
  const rows = await db.getAllAsync<{
    hour: string;
    total_sales: number;
    transaction_count: number;
  }>(
    `SELECT
       strftime('%H', completed_at) as hour,
       COALESCE(SUM(total), 0) as total_sales,
       COUNT(*) as transaction_count
     FROM sales
     WHERE completed_at >= ?
       AND completed_at < ?
       AND status = 'completed'
     GROUP BY strftime('%H', completed_at)
     ORDER BY hour ASC`,
    bounds.start,
    bounds.end
  );

  const lookup = new Map(rows.map((row) => [Number(row.hour), row]));

  return Array.from({ length: 24 }, (_, hour): HourlySalesPoint => {
    const row = lookup.get(hour);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;

    return {
      hour,
      label: `${displayHour}${suffix}`,
      total_sales: row?.total_sales ?? 0,
      transaction_count: row?.transaction_count ?? 0,
    };
  });
}

export async function getTopSellingProducts(db: SQLiteDatabase, range: ReportRange, limit = 5) {
  const bounds = getReportRangeBounds(range);

  return db.getAllAsync<TopSellingProduct>(
    `SELECT
       sale_items.product_id,
       sale_items.product_name,
       SUM(sale_items.quantity) as quantity_sold,
       SUM(sale_items.line_total) as total_sales
     FROM sale_items
     INNER JOIN sales ON sales.id = sale_items.sale_id
     WHERE sales.completed_at >= ?
       AND sales.completed_at < ?
       AND sales.status = 'completed'
     GROUP BY sale_items.product_id, sale_items.product_name
     ORDER BY quantity_sold DESC, total_sales DESC
     LIMIT ?`,
    bounds.start,
    bounds.end,
    limit
  );
}

export async function getPaymentBreakdown(db: SQLiteDatabase, range: ReportRange) {
  const bounds = getReportRangeBounds(range);

  return db.getAllAsync<PaymentBreakdown>(
    `SELECT
       payments.method,
       SUM(sales.total) as amount,
       COUNT(*) as transaction_count
     FROM payments
     INNER JOIN sales ON sales.id = payments.sale_id
     WHERE sales.completed_at >= ?
       AND sales.completed_at < ?
       AND sales.status = 'completed'
     GROUP BY payments.method
     ORDER BY amount DESC`,
    bounds.start,
    bounds.end
  );
}

export async function getSalesReportRows(db: SQLiteDatabase, range: ReportRange, limit = 50) {
  const bounds = getReportRangeBounds(range);

  return db.getAllAsync<SalesReportRow>(
    `SELECT
       sales.*,
       users.full_name as cashier_name,
       COALESCE(item_totals.item_count, 0) as item_count,
       COALESCE(adjustment_totals.adjustment_count, 0) as adjustment_count,
       GROUP_CONCAT(DISTINCT payments.method) as payment_methods
     FROM sales
     INNER JOIN users ON users.id = sales.cashier_id
     LEFT JOIN (
       SELECT sale_id, SUM(quantity) as item_count
       FROM sale_items
       GROUP BY sale_id
     ) item_totals ON item_totals.sale_id = sales.id
     LEFT JOIN (
       SELECT sale_id, COUNT(*) as adjustment_count
       FROM sale_adjustments
       GROUP BY sale_id
     ) adjustment_totals ON adjustment_totals.sale_id = sales.id
     LEFT JOIN payments ON payments.sale_id = sales.id
     WHERE sales.completed_at >= ?
       AND sales.completed_at < ?
     GROUP BY sales.id
     ORDER BY sales.completed_at DESC
     LIMIT ?`,
    bounds.start,
    bounds.end,
    limit
  );
}
