export type ReportSaleSnapshot = {
  status: 'completed' | 'voided' | 'refunded';
  total: number;
  netSales: number;
  discountTotal: number;
  itemQuantity: number;
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
