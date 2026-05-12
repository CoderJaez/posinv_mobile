export function formatCurrency(value: number) {
  return `₱${value.toFixed(2)}`;
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value.replace(' ', 'T'));

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
