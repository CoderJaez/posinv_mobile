export function formatCurrency(value: number) {
  return `₱${value.toFixed(2)}`;
}

export function parseDatabaseDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasTimezone ? normalized : `${normalized}Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseLocalDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateObject(value: Date) {
  return value.toLocaleString("en-US", {
    month: 'short',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const parsed = parseDatabaseDateTime(value);

  if (!parsed) {
    return value;
  }

  return formatDateObject(parsed);
}

export function formatLocalDateTime(value: string | null) {
  if (!value) {
    return '-';
  }

  const parsed = parseLocalDateTime(value);

  if (!parsed) {
    return value;
  }

  return formatDateObject(parsed);
}
