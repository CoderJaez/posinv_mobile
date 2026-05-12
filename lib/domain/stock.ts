export type StockBatchSnapshot = {
  id: number;
  quantity: number;
  expiryDate: string | null;
};

export type StockDeduction = {
  batchId: number;
  quantity: number;
};

export function sortBatchesForDeduction(batches: StockBatchSnapshot[]) {
  return [...batches].sort((left, right) => {
    if (!left.expiryDate && right.expiryDate) {
      return 1;
    }

    if (left.expiryDate && !right.expiryDate) {
      return -1;
    }

    if (left.expiryDate && right.expiryDate && left.expiryDate !== right.expiryDate) {
      return left.expiryDate.localeCompare(right.expiryDate);
    }

    return left.id - right.id;
  });
}

export function planBatchDeductions(quantity: number, batches: StockBatchSnapshot[]) {
  if (quantity <= 0) {
    throw new Error('Deduction quantity must be greater than zero.');
  }

  let remaining = quantity;
  const deductions: StockDeduction[] = [];

  for (const batch of sortBatchesForDeduction(batches)) {
    if (remaining <= 0) {
      break;
    }

    if (batch.quantity <= 0) {
      continue;
    }

    const deducted = Math.min(batch.quantity, remaining);
    deductions.push({ batchId: batch.id, quantity: deducted });
    remaining -= deducted;
  }

  return {
    deductions,
    remaining,
  };
}

export function calculateNewStock(currentStock: number, quantityDelta: number) {
  const nextStock = currentStock + quantityDelta;

  if (nextStock < 0) {
    throw new Error('Stock cannot become negative.');
  }

  return nextStock;
}
