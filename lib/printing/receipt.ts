import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
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

// ─── Native Module ────────────────────────────────────────────────────────────

interface ThermalPrinterModuleType {
  printBluetooth: (
    macAddress: string,
    payload: string,
    autoCut: boolean,
    openCashbox: boolean,
    mmFeedPaper: number,
    printerDpi: number,
    printerWidthMM: number,
    printerNbrCharactersPerLine: number
  ) => Promise<void>;
  getBluetoothDeviceList: () => Promise<BluetoothPrinter[]>;
}

const ThermalPrinterModule: ThermalPrinterModuleType | null =
  NativeModules.ThermalPrinterModule ?? null;

type BluetoothPrinter = {
  deviceName: string;
  macAddress: string;
};

function getThermalPrinterModule() {
  if (!ThermalPrinterModule) {
    throw new Error(
      '[Printing] Native module not found.\n' +
        'Run `npx expo prebuild` then rebuild with `npx expo run:android`. ' +
        'This module does not work inside Expo Go.'
    );
  }

  return ThermalPrinterModule;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function getPaperWidthMM(settings: Record<string, string>): number {
  const raw = settings.printer_paper_width || '58mm';
  const match = raw.match(/^(\d+(\.\d+)?)\s*mm$/i);
  return match ? parseFloat(match[1]) : 58;
}

function getConfiguredPrinterName(settings: Record<string, string>) {
  return (
    settings.printer_name ||
    (settings.hardware_printer && settings.hardware_printer !== 'Not configured'
      ? settings.hardware_printer
      : null)
  );
}

function normalizeMacAddress(value?: string | null) {
  return String(value ?? '')
    .trim()
    .replace(/[^a-fA-F0-9]/g, '')
    .toLowerCase();
}

function normalizeDeviceName(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function formatBluetoothDevices(devices: BluetoothPrinter[]) {
  if (devices.length === 0) {
    return 'No paired Bluetooth printers were returned by Android.';
  }

  return devices
    .map((device) => `${device.deviceName || 'Unnamed'} (${device.macAddress})`)
    .join(', ');
}

function isCompleteMacAddress(value?: string | null) {
  return normalizeMacAddress(value).length === 12;
}

function isAutoPrintEnabled(settings: Record<string, string>) {
  return (
    settings.receipt_auto_print !== 'false' &&
    Boolean(getConfiguredPrinterName(settings))
  );
}

// ─── Permissions ──────────────────────────────────────────────────────────────

async function ensureBluetoothPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const apiLevel =
    typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(Platform.Version, 10);

  const permissions =
    apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const results = await PermissionsAndroid.requestMultiple(permissions);
  const denied = Object.entries(results).filter(
    ([, status]) => status !== PermissionsAndroid.RESULTS.GRANTED
  );

  if (denied.length > 0) {
    const names = denied.map(([perm]) => perm.split('.').pop()).join(', ');
    throw new Error(
      `Bluetooth permissions denied: ${names}.\n` +
        'Go to Settings → App → Permissions and enable Bluetooth & Location.'
    );
  }
}

// ─── Error Mapping ────────────────────────────────────────────────────────────

/**
 * Maps raw native Bluetooth errors to clear, actionable messages.
 * The native module throws plain string messages — we normalise them here.
 */
async function resolveBluetoothPrinter(settings: Record<string, string>) {
  const module = getThermalPrinterModule();
  await ensureBluetoothPermissions();

  const configuredAddress = settings.printer_address?.trim();
  const configuredAddressKey = normalizeMacAddress(configuredAddress);
  const addressIsMac = isCompleteMacAddress(configuredAddress);
  const configuredName = getConfiguredPrinterName(settings);
  const configuredNameKeys = [configuredName, addressIsMac ? null : configuredAddress]
    .map((value) => normalizeDeviceName(value))
    .filter(Boolean);
  const devices = await module.getBluetoothDeviceList();

  if (configuredAddressKey && addressIsMac) {
    const match = devices.find(
      (device) => normalizeMacAddress(device.macAddress) === configuredAddressKey
    );

    if (match) {
      return match;
    }

    throw new Error(
      `Configured printer address ${configuredAddress} was not found in paired Bluetooth devices. ` +
        `Paired devices: ${formatBluetoothDevices(devices)}`
    );
  }

  if (configuredNameKeys.length > 0) {
    const match = devices.find((device) => {
      const deviceNameKey = normalizeDeviceName(device.deviceName);

      return configuredNameKeys.some(
        (nameKey) => deviceNameKey === nameKey || deviceNameKey.includes(nameKey)
      );
    });

    if (match) {
      return match;
    }

    throw new Error(
      `Configured printer name/address was not found in paired Bluetooth devices. ` +
        `Paired devices: ${formatBluetoothDevices(devices)}`
    );
  }

  throw new Error('No Bluetooth printer name or address configured in Settings.');
}

function mapPrintError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const msg = raw.toLowerCase();

  if (msg.includes('bluetooth is not enabled') || msg.includes('bt is not enabled')) {
    return 'Bluetooth is turned off. Enable Bluetooth on this device and try again.';
  }
  if (
    msg.includes('unable to connect') ||
    msg.includes('connection failed') ||
    msg.includes('could not connect') ||
    msg.includes('econnrefused')
  ) {
    return (
      'Could not connect to the printer.\n' +
      'Make sure the printer is powered on, in range, and not already connected to another device.'
    );
  }
  if (msg.includes('socket') || msg.includes('broken pipe')) {
    return (
      'The printer connection dropped mid-print.\n' +
      'Power cycle the printer and try again.'
    );
  }
  if (msg.includes('permission')) {
    return 'Bluetooth permission denied. Go to Settings → App → Permissions and allow Bluetooth.';
  }
  if (msg.includes('device not found') || msg.includes('no such device')) {
    return (
      'Printer not found. The device is paired but unreachable — ' +
      'make sure the printer is powered on and within Bluetooth range.'
    );
  }

  return raw || 'Bluetooth print failed.';
}

// ─── Receipt Builders ─────────────────────────────────────────────────────────

/** Plain-text payload — stored in the DB print job record for auditing. */
export function buildReceiptText(
  sale: SaleRecord,
  items: SaleItemRecord[],
  settings: Record<string, string>
) {
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

/**
 * Thermal-printer payload using react-native-thermal-printer format tags.
 *   [L] left  [C] center  [R] right  <b>bold</b>  <u>underline</u>
 */
export function buildReceiptPayload(
  sale: SaleRecord,
  items: SaleItemRecord[],
  settings: Record<string, string>
): string {
  const storeName = escapeHtml(
    settings.receipt_header || settings.store_name || 'StoreMate Convenience Store'
  );
  const footer = escapeHtml(
    settings.receipt_footer || 'Thank you for shopping with us.'
  );
  const widthMM = getPaperWidthMM(settings);
  const divider = '-'.repeat(widthMM >= 80 ? 48 : 32);

  const itemLines = items
    .filter((item) => item.quantity > 0)
    .map(
      (item) =>
        `[L]${escapeHtml(item.product_name)}\n` +
        `[L]  ${item.quantity} x ${escapeHtml(formatCurrency(item.unit_price))}` +
        `[R]${escapeHtml(formatCurrency(item.line_total))}\n`
    )
    .join('');

  return [
    `[C]<b>${storeName}</b>\n`,
    settings.branch_name ? `[C]${escapeHtml(settings.branch_name)}\n` : '',
    `[C]${escapeHtml(sale.receipt_number)}\n`,
    `[C]${escapeHtml(formatDateTime(sale.completed_at))}\n`,
    `[L]Cashier: ${escapeHtml(sale.cashier_name ?? String(sale.cashier_id))}\n`,
    `[C]${divider}\n`,
    itemLines,
    `[C]${divider}\n`,
    `[L]Subtotal[R]${escapeHtml(formatCurrency(sale.subtotal))}\n`,
    `[L]Discount[R]${escapeHtml(formatCurrency(sale.discount_total))}\n`,
    `[L]<b>TOTAL[R]${escapeHtml(formatCurrency(sale.total))}</b>\n`,
    `[C]${divider}\n`,
    `[C]${footer}\n`,
    '\n\n\n', // feed lines so the receipt clears the cutter
  ]
    .filter(Boolean)
    .join('');
}

// ─── Core Send ────────────────────────────────────────────────────────────────

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

  const targetPrinter = await resolveBluetoothPrinter(settings);
  const widthMM = getPaperWidthMM(settings);
  const configuredPrinterName = getConfiguredPrinterName(settings);
  const payloadText = buildReceiptText(sale, items, settings);
  const payloadThermal = buildReceiptPayload(sale, items, settings);

  const printJobId = await createPrintJob(db, {
    saleId: sale.id,
    receiptNumber: sale.receipt_number,
    printerName: configuredPrinterName || targetPrinter.deviceName,
    printerAddress: targetPrinter.macAddress,
    connectionType: 'bluetooth',
    payloadText,
    createdBy: input.userId ?? null,
  });

  // 5. Print — pass MAC directly; the library opens its own RFCOMM socket
  try {
    const module = getThermalPrinterModule();

    await module.printBluetooth(
      targetPrinter.macAddress,
      payloadThermal,
      true,
      false,
      Number(settings.printer_feed_mm ?? 20),
      Number(settings.printer_dpi ?? 203),
      widthMM,
      widthMM >= 80 ? 48 : 32
    );

    await markPrintJobSent(db, printJobId);
    return printJobId;
  } catch (error) {
    const message = mapPrintError(error);
    await markPrintJobFailed(db, printJobId, message);
    throw new Error(message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Manually triggers a receipt print for a completed sale.
 */
export async function printReceiptForSale(
  db: SQLiteDatabase,
  input: { saleId: number; userId?: number | null }
) {
  const [sale, items, settings] = await Promise.all([
    getSaleById(db, input.saleId),
    getSaleItems(db, input.saleId),
    getSettingsMap(db),
  ]);

  if (!sale) throw new Error('Sale not found.');

  return sendReceiptToPrinter(db, { sale, items, settings, userId: input.userId ?? null });
}

/**
 * Auto-prints after a sale completes. Silently skips if auto-print is
 * disabled or no printer is configured.
 */
export async function autoPrintReceiptForSale(
  db: SQLiteDatabase,
  input: { saleId: number; userId?: number | null }
) {
  const [sale, items, settings] = await Promise.all([
    getSaleById(db, input.saleId),
    getSaleItems(db, input.saleId),
    getSettingsMap(db),
  ]);

  if (!sale) throw new Error('Sale not found.');

  if (!isAutoPrintEnabled(settings)) {
    return {
      status: 'skipped' as const,
      message:
        'Auto print skipped. Configure receipt printer and enable auto print in Settings.',
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
    message: 'Receipt sent to Bluetooth printer.',
  };
}
