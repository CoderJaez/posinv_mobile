export type SaleCalculationItem = {
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
};

export type SaleTotals = {
  subtotal: number;
  discountTotal: number;
  total: number;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateSaleTotals(items: SaleCalculationItem[]): SaleTotals {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountTotal = items.reduce((sum, item) => sum + (item.discountAmount ?? 0), 0);
  const total = Math.max(0, subtotal - discountTotal);

  return {
    subtotal: roundCurrency(subtotal),
    discountTotal: roundCurrency(discountTotal),
    total: roundCurrency(total),
  };
}

export function calculateCashChange(total: number, cashReceived: number) {
  const change = roundCurrency(cashReceived - total);

  if (change < 0) {
    throw new Error('Cash received is below total.');
  }

  return change;
}
