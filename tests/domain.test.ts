import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildReportInsights, summarizeSalesForReport } from '../lib/domain/reports';
import { calculateCashChange, calculateSaleTotals } from '../lib/domain/sales';
import { calculateNewStock, planBatchDeductions } from '../lib/domain/stock';

describe('sales calculations', () => {
  it('calculates subtotal, discount, total, and cash change', () => {
    const totals = calculateSaleTotals([
      { quantity: 2, unitPrice: 25 },
      { quantity: 1, unitPrice: 18, discountAmount: 3 },
    ]);

    assert.deepEqual(totals, {
      subtotal: 68,
      discountTotal: 3,
      total: 65,
    });
    assert.equal(calculateCashChange(totals.total, 100), 35);
  });

  it('rejects underpaid cash payments', () => {
    assert.throws(() => calculateCashChange(98, 90), /below total/);
  });
});

describe('stock deduction', () => {
  it('deducts from earliest expiry batches first and leaves unbatched remainder', () => {
    const plan = planBatchDeductions(12, [
      { id: 3, quantity: 5, expiryDate: null },
      { id: 2, quantity: 6, expiryDate: '2026-05-01' },
      { id: 1, quantity: 4, expiryDate: '2026-04-01' },
    ]);

    assert.deepEqual(plan.deductions, [
      { batchId: 1, quantity: 4 },
      { batchId: 2, quantity: 6 },
      { batchId: 3, quantity: 2 },
    ]);
    assert.equal(plan.remaining, 0);
  });

  it('prevents stock from becoming negative', () => {
    assert.equal(calculateNewStock(10, -4), 6);
    assert.throws(() => calculateNewStock(3, -4), /negative/);
  });
});

describe('report summaries', () => {
  it('summarizes completed sales, returns, voids, discounts, and basket average', () => {
    const summary = summarizeSalesForReport([
      {
        status: 'completed',
        total: 100,
        netSales: 95,
        discountTotal: 5,
        itemQuantity: 4,
      },
      {
        status: 'completed',
        total: 50,
        netSales: 50,
        discountTotal: 0,
        itemQuantity: 2,
      },
      {
        status: 'refunded',
        total: 20,
        netSales: 0,
        discountTotal: 0,
        itemQuantity: 1,
      },
      {
        status: 'voided',
        total: 30,
        netSales: 0,
        discountTotal: 0,
        itemQuantity: 1,
      },
    ]);

    assert.deepEqual(summary, {
      total_sales: 150,
      total_transactions: 2,
      average_basket: 75,
      items_sold: 6,
      discounts: 5,
      returns: 20,
      cancelled_transactions: 1,
      net_sales: 145,
    });
  });

  it('builds actionable report insights from report data', () => {
    const insights = buildReportInsights(
      {
        summary: {
          total_sales: 200,
          total_transactions: 4,
          average_basket: 50,
          discounts: 5,
          returns: 0,
          cancelled_transactions: 1,
          net_sales: 195,
        },
        hourlySales: [
          { label: '9AM', total_sales: 40, transaction_count: 1 },
          { label: '10AM', total_sales: 160, transaction_count: 3 },
        ],
        topProducts: [{ product_name: 'Coke 500ml', quantity_sold: 6, total_sales: 150 }],
        paymentBreakdown: [{ method: 'cash', amount: 200, transaction_count: 4 }],
      },
      (value) => `PHP ${value.toFixed(2)}`
    );

    assert.equal(insights.length, 5);
    assert.match(insights[0], /Net sales are PHP 195.00/);
    assert.match(insights[1], /10AM/);
    assert.match(insights[2], /Coke 500ml/);
  });
});
