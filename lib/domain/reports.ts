export type ReportSaleSnapshot = {
  status: 'completed' | 'voided' | 'refunded';
  total: number;
  netSales: number;
  discountTotal: number;
  itemQuantity: number;
};

export type ReportInsightInput = {
  summary: {
    total_sales: number;
    total_transactions: number;
    average_basket: number;
    discounts: number;
    returns: number;
    cancelled_transactions: number;
    net_sales: number;
  };
  hourlySales: {
    label: string;
    total_sales: number;
    transaction_count: number;
  }[];
  topProducts: {
    product_name: string;
    quantity_sold: number;
    total_sales: number;
  }[];
  paymentBreakdown: {
    method: string;
    amount: number;
    transaction_count: number;
  }[];
};

export function summarizeSalesForReport(sales: ReportSaleSnapshot[]) {
  const completedSales = sales.filter((sale) => sale.status === 'completed');
  const totalSales = completedSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalTransactions = completedSales.length;
  const itemsSold = completedSales.reduce((sum, sale) => sum + sale.itemQuantity, 0);
  const discounts = sales.reduce((sum, sale) => sum + sale.discountTotal, 0);
  const returns = sales
    .filter((sale) => sale.status === 'refunded')
    .reduce((sum, sale) => sum + sale.total, 0);
  const cancelledTransactions = sales.filter((sale) => sale.status === 'voided').length;
  const netSales = completedSales.reduce((sum, sale) => sum + sale.netSales, 0);

  return {
    total_sales: totalSales,
    total_transactions: totalTransactions,
    average_basket: totalTransactions === 0 ? 0 : totalSales / totalTransactions,
    items_sold: itemsSold,
    discounts,
    returns,
    cancelled_transactions: cancelledTransactions,
    net_sales: netSales,
  };
}

export function buildReportInsights(
  input: ReportInsightInput,
  formatAmount: (value: number) => string = (value) => value.toFixed(2)
) {
  const { summary, hourlySales, topProducts, paymentBreakdown } = input;

  if (summary.total_transactions === 0) {
    return ['No completed sales were recorded for this range yet.'];
  }

  const insights = [
    `Net sales are ${formatAmount(summary.net_sales)} from ${summary.total_transactions.toLocaleString()} transactions with an average basket of ${formatAmount(summary.average_basket)}.`,
  ];
  const peakHour = hourlySales.reduce(
    (best, point) => (point.total_sales > best.total_sales ? point : best),
    hourlySales[0] ?? { label: '-', total_sales: 0, transaction_count: 0 }
  );

  if (peakHour.total_sales > 0) {
    insights.push(
      `Peak sales window is ${peakHour.label} with ${formatAmount(peakHour.total_sales)} across ${peakHour.transaction_count.toLocaleString()} transactions.`
    );
  }

  const topProduct = topProducts[0];

  if (topProduct && summary.total_sales > 0) {
    const contribution = (topProduct.total_sales / summary.total_sales) * 100;
    insights.push(
      `${topProduct.product_name} is the top item, contributing ${contribution.toFixed(1)}% of gross sales from ${topProduct.quantity_sold.toLocaleString()} units.`
    );
  }

  const totalCollected = paymentBreakdown.reduce((sum, payment) => sum + payment.amount, 0);
  const leadingPayment = paymentBreakdown[0];

  if (leadingPayment && totalCollected > 0) {
    const share = (leadingPayment.amount / totalCollected) * 100;
    insights.push(
      `${leadingPayment.method.toUpperCase()} leads payment mix at ${share.toFixed(1)}% of collected payments.`
    );
  }

  if (summary.returns > 0 || summary.cancelled_transactions > 0 || summary.discounts > 0) {
    insights.push(
      `Sales quality shows ${formatAmount(summary.discounts)} discounts, ${formatAmount(summary.returns)} returns, and ${summary.cancelled_transactions.toLocaleString()} cancelled transactions.`
    );
  } else {
    insights.push('No discounts, returns, or cancelled transactions were recorded in this range.');
  }

  return insights;
}
