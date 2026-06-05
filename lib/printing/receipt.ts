import * as Print from 'expo-print';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  createPrintJob,
  markPrintJobFailed,
  markPrintJobSent,
} from '@/lib/database/printing';
import { getSaleById, getSaleItems } from '@/lib/database/sales';
import { getSettingsMap } from '@/lib/database/settings';
import type { SaleItemRecord, SaleRecord } from '@/lib/database/types';
import { formatCurrency, formatDateTime } from '@/lib/format';

function receiptLine(label: string, value: string) {
  return `${label.padEnd(18, ' ')}${value.padStart(12, ' ')}`;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPaperWidth(settings: Record<string, string>) {
  const width = settings.printer_paper_width || '58mm';

  return /^\d+(\.\d+)?(mm|px|in)$/i.test(width) ? width : '58mm';
}

function getConfiguredPrinterName(settings: Record<string, string>) {
  return (
    settings.printer_name ||
    (settings.hardware_printer && settings.hardware_printer !== 'Not configured'
      ? settings.hardware_printer
      : null)
  );
}

function isAutoPrintEnabled(settings: Record<string, string>) {
  return settings.receipt_auto_print !== 'false' && Boolean(getConfiguredPrinterName(settings));
}

export function buildReceiptText(sale: SaleRecord, items: SaleItemRecord[], settings: Record<string, string>) {
  const lines = [
    settings.receipt_header || settings.store_name || 'StoreMate Convenience Store',
    settings.branch_name ? `Branch: ${settings.branch_name}` : '',
    `Receipt: ${sale.receipt_number}`,
    `Date: ${formatDateTime(sale.completed_at)}`,
    `Cashier: ${sale.cashier_name ?? sale.cashier_id}`,
    ''.padEnd(32, '-'),
    ...items
      .filter((item) => item.quantity > 0)
      .flatMap((item) => [
        item.product_name,
        `${item.quantity} x ${formatCurrency(item.unit_price)} = ${formatCurrency(item.line_total)}`,
      ]),
    ''.padEnd(32, '-'),
    receiptLine('Subtotal', formatCurrency(sale.subtotal)),
    receiptLine('Discount', formatCurrency(sale.discount_total)),
    receiptLine('TOTAL', formatCurrency(sale.total)),
    settings.receipt_footer || 'Thank you for shopping with us.',
  ];

  return lines.filter(Boolean).join('\n');
}

export function buildReceiptHtml(sale: SaleRecord, items: SaleItemRecord[], settings: Record<string, string>) {
  const paperWidth = getPaperWidth(settings);
  const rows = items
    .filter((item) => item.quantity > 0)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.product_name)}<br /><span>${item.quantity} x ${escapeHtml(formatCurrency(item.unit_price))}</span></td>
          <td>${escapeHtml(formatCurrency(item.line_total))}</td>
        </tr>`
    )
    .join('');

  return `
    <html>
      <head>
        <style>
          @page { margin: 0; size: ${paperWidth} auto; }
          body { font-family: monospace; font-size: 12px; margin: 0; max-width: ${paperWidth}; padding: 16px; width: ${paperWidth}; }
          h1 { font-size: 16px; margin: 0 0 4px; text-align: center; }
          .meta { text-align: center; margin-bottom: 12px; }
          table { border-collapse: collapse; width: 100%; }
          td { border-bottom: 1px dashed #999; padding: 6px 0; vertical-align: top; }
          td:last-child { text-align: right; white-space: nowrap; }
          span { color: #555; }
          .totals { margin-top: 12px; }
          .line { display: flex; justify-content: space-between; margin: 4px 0; }
          .total { font-size: 15px; font-weight: bold; }
          .footer { margin-top: 16px; text-align: center; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(settings.receipt_header || settings.store_name || 'StoreMate Convenience Store')}</h1>
        <div class="meta">
          ${settings.branch_name ? `<div>${escapeHtml(settings.branch_name)}</div>` : ''}
          <div>${escapeHtml(sale.receipt_number)}</div>
          <div>${escapeHtml(formatDateTime(sale.completed_at))}</div>
        </div>
        <table>${rows}</table>
        <div class="totals">
          <div class="line"><span>Subtotal</span><strong>${escapeHtml(formatCurrency(sale.subtotal))}</strong></div>
          <div class="line"><span>Discount</span><strong>${escapeHtml(formatCurrency(sale.discount_total))}</strong></div>
          <div class="line total"><span>Total</span><strong>${escapeHtml(formatCurrency(sale.total))}</strong></div>
        </div>
        <div class="footer">${escapeHtml(settings.receipt_footer || 'Thank you for shopping with us.')}</div>
      </body>
    </html>`;
}

export async function printReceiptForSale(
  db: SQLiteDatabase,
  input: { saleId: number; userId?: number | null }
) {
  const [sale, items, settings] = await Promise.all([
    getSaleById(db, input.saleId),
    getSaleItems(db, input.saleId),
    getSettingsMap(db),
  ]);

  if (!sale) {
    throw new Error('Sale not found.');
  }

  return sendReceiptToPrinter(db, {
    sale,
    items,
    settings,
    userId: input.userId ?? null,
  });
}

export async function autoPrintReceiptForSale(
  db: SQLiteDatabase,
  input: { saleId: number; userId?: number | null }
) {
  const [sale, items, settings] = await Promise.all([
    getSaleById(db, input.saleId),
    getSaleItems(db, input.saleId),
    getSettingsMap(db),
  ]);

  if (!sale) {
    throw new Error('Sale not found.');
  }

  if (!isAutoPrintEnabled(settings)) {
    return {
      status: 'skipped' as const,
      message: 'Auto print skipped. Configure receipt printer and enable auto print in Settings.',
    };
  }

  const printJobId = await sendReceiptToPrinter(db, {
    sale,
    items,
    settings,
    userId: input.userId ?? null,
  });

  return {
    status: 'sent' as const,
    printJobId,
    message: 'Receipt sent to configured printer.',
  };
}

async function sendReceiptToPrinter(
  db: SQLiteDatabase,
  input: {
    sale: SaleRecord;
    items: SaleItemRecord[];
    settings: Record<string, string>;
    userId?: number | null;
  }
) {
  const { sale, items, settings } = input;
  const configuredPrinterName = getConfiguredPrinterName(settings);
  const payloadText = buildReceiptText(sale, items, settings);
  const printJobId = await createPrintJob(db, {
    saleId: sale.id,
    receiptNumber: sale.receipt_number,
    printerName: configuredPrinterName,
    printerAddress: settings.printer_address || null,
    connectionType: settings.printer_connection_type === 'system' ? 'system' : 'bluetooth',
    payloadText,
    createdBy: input.userId ?? null,
  });

  try {
    await Print.printAsync({
      html: buildReceiptHtml(sale, items, settings),
    });
    await markPrintJobSent(db, printJobId);
    return printJobId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Print failed.';
    await markPrintJobFailed(db, printJobId, message);
    throw new Error(message);
  }
}
