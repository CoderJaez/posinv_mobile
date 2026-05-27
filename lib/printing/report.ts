import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type {
  HourlySalesPoint,
  PaymentBreakdown,
  ReportRange,
  ReportSummary,
  SalesReportRow,
  TopSellingProduct,
} from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';

export type ReportPdfData = {
  title: string;
  range: ReportRange;
  rangeLabel: string;
  generatedAt: Date;
  summary: ReportSummary;
  insights: string[];
  hourlySales: HourlySalesPoint[];
  topProducts: TopSellingProduct[];
  paymentBreakdown: PaymentBreakdown[];
  salesRows: SalesReportRow[];
};

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatGeneratedAt(value: Date) {
  return value.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function metric(label: string, value: string) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>`;
}

function tableSection(title: string, rows: string, emptyLabel: string) {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${
        rows
          ? `<table>${rows}</table>`
          : `<p class="empty">${escapeHtml(emptyLabel)}</p>`
      }
    </section>`;
}

export function buildReportPdfHtml(data: ReportPdfData) {
  const hourlyRows = data.hourlySales
    .filter((point) => point.total_sales > 0 || point.transaction_count > 0)
    .map(
      (point) => `
        <tr>
          <td>${escapeHtml(point.label)}</td>
          <td>${escapeHtml(point.transaction_count)}</td>
          <td class="right">${escapeHtml(formatCurrency(point.total_sales))}</td>
        </tr>`
    )
    .join('');
  const productRows = data.topProducts
    .map(
      (product, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(product.product_name)}</td>
          <td class="right">${escapeHtml(product.quantity_sold)}</td>
          <td class="right">${escapeHtml(formatCurrency(product.total_sales))}</td>
        </tr>`
    )
    .join('');
  const paymentRows = data.paymentBreakdown
    .map(
      (payment) => `
        <tr>
          <td>${escapeHtml(payment.method.toUpperCase())}</td>
          <td class="right">${escapeHtml(payment.transaction_count)}</td>
          <td class="right">${escapeHtml(formatCurrency(payment.amount))}</td>
        </tr>`
    )
    .join('');
  const saleRows = data.salesRows
    .map(
      (sale) => `
        <tr>
          <td>${escapeHtml(sale.receipt_number)}</td>
          <td>${escapeHtml(formatDateTime(sale.completed_at))}</td>
          <td>${escapeHtml(sale.cashier_name ?? sale.cashier_id)}</td>
          <td class="right">${escapeHtml(sale.item_count)}</td>
          <td>${escapeHtml(sale.payment_methods ?? '-')}</td>
          <td>${escapeHtml(sale.status)}</td>
          <td class="right">${escapeHtml(formatCurrency(sale.discount_total))}</td>
          <td class="right">${escapeHtml(formatCurrency(sale.net_sales))}</td>
        </tr>`
    )
    .join('');
  const insights = data.insights
    .map((insight) => `<li>${escapeHtml(insight)}</li>`)
    .join('');

  return `
    <html>
      <head>
        <style>
          @page { margin: 32px; }
          body {
            color: #102332;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 12px;
            margin: 0;
          }
          header {
            border-bottom: 2px solid #009B55;
            margin-bottom: 20px;
            padding-bottom: 14px;
          }
          h1 {
            font-size: 24px;
            margin: 0 0 6px;
          }
          h2 {
            font-size: 15px;
            margin: 0 0 10px;
          }
          .meta {
            color: #5F6C75;
            display: flex;
            gap: 16px;
          }
          .metrics {
            display: grid;
            gap: 10px;
            grid-template-columns: repeat(4, 1fr);
            margin-bottom: 18px;
          }
          .metric {
            border: 1px solid #DDE6EB;
            border-radius: 8px;
            padding: 10px;
          }
          .metric span {
            color: #5F6C75;
            display: block;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
          }
          .metric strong {
            color: #007F45;
            display: block;
            font-size: 16px;
            margin-top: 4px;
          }
          section {
            break-inside: avoid;
            margin-bottom: 18px;
          }
          ul {
            margin: 0;
            padding-left: 18px;
          }
          li {
            margin-bottom: 6px;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            border-bottom: 1px solid #DDE6EB;
            padding: 7px 6px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #F5F8FA;
            color: #5F6C75;
            font-size: 10px;
            text-transform: uppercase;
          }
          .right {
            text-align: right;
            white-space: nowrap;
          }
          .empty {
            color: #5F6C75;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(data.title)}</h1>
          <div class="meta">
            <span>${escapeHtml(data.range.toUpperCase())}: ${escapeHtml(data.rangeLabel)}</span>
            <span>Generated ${escapeHtml(formatGeneratedAt(data.generatedAt))}</span>
          </div>
        </header>

        <div class="metrics">
          ${metric('Total Sales', formatCurrency(data.summary.total_sales))}
          ${metric('Transactions', data.summary.total_transactions.toLocaleString())}
          ${metric('Average Basket', formatCurrency(data.summary.average_basket))}
          ${metric('Net Sales', formatCurrency(data.summary.net_sales))}
          ${metric('Items Sold', data.summary.items_sold.toLocaleString())}
          ${metric('Discounts', formatCurrency(data.summary.discounts))}
          ${metric('Returns', formatCurrency(data.summary.returns))}
          ${metric('Cancelled', data.summary.cancelled_transactions.toLocaleString())}
        </div>

        <section>
          <h2>Analytics Insights</h2>
          <ul>${insights}</ul>
        </section>

        ${tableSection(
          'Hourly Sales',
          hourlyRows
            ? `<thead><tr><th>Hour</th><th>Transactions</th><th class="right">Sales</th></tr></thead><tbody>${hourlyRows}</tbody>`
            : '',
          'No hourly sales in this range.'
        )}

        ${tableSection(
          'Top Selling Items',
          productRows
            ? `<thead><tr><th>#</th><th>Product</th><th class="right">Qty</th><th class="right">Sales</th></tr></thead><tbody>${productRows}</tbody>`
            : '',
          'No top selling items in this range.'
        )}

        ${tableSection(
          'Payment Breakdown',
          paymentRows
            ? `<thead><tr><th>Method</th><th class="right">Transactions</th><th class="right">Amount</th></tr></thead><tbody>${paymentRows}</tbody>`
            : '',
          'No payments recorded in this range.'
        )}

        ${tableSection(
          'Sales Details',
          saleRows
            ? `<thead><tr><th>Receipt</th><th>Completed</th><th>Cashier</th><th class="right">Items</th><th>Payment</th><th>Status</th><th class="right">Discount</th><th class="right">Net Sales</th></tr></thead><tbody>${saleRows}</tbody>`
            : '',
          'No sales rows in this range.'
        )}
      </body>
    </html>`;
}

export async function exportReportPdf(data: ReportPdfData) {
  const file = await Print.printToFileAsync({
    html: buildReportPdfHtml(data),
    base64: false,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `${data.title} PDF`,
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });

    return 'Report PDF generated and share sheet opened.';
  }

  return `Report PDF generated at ${file.uri}`;
}
