const DEFAULT_LOCALE = 'ar-EG';
const DEFAULT_NUMBERING_SYSTEM = 'arab';
const DEFAULT_CALENDAR = 'gregory';

function getPreferences() {
  if (typeof window === 'undefined') {
    return {
      numberingSystem: DEFAULT_NUMBERING_SYSTEM,
      calendar: DEFAULT_CALENDAR
    };
  }
  return {
    numberingSystem: window.localStorage.getItem('finance.numberingSystem') || DEFAULT_NUMBERING_SYSTEM,
    calendar: window.localStorage.getItem('finance.calendar') || DEFAULT_CALENDAR
  };
}

function parseDate(value) {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (dateOnly) {
    const [, yearText, monthText, dayText] = dateOnly;
    const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), 12);
    if (
      date.getFullYear() !== Number(yearText) ||
      date.getMonth() !== Number(monthText) - 1 ||
      date.getDate() !== Number(dayText)
    ) {
      return new Date(NaN);
    }
    return date;
  }
  return new Date(value);
}

export function formatNumber(value, options = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const preferences = getPreferences();
  const {
    locale = DEFAULT_LOCALE,
    numberingSystem = preferences.numberingSystem,
    ...formatOptions
  } = options;
  return new Intl.NumberFormat(locale, { numberingSystem, ...formatOptions }).format(number);
}

export function formatMoney(value, options = {}) {
  const formatted = formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options
  });
  return `${formatted} ج.م`;
}

export function formatDate(value, options = {}) {
  const rawValue = String(value ?? '');
  if (!rawValue) return '—';
  const date = parseDate(rawValue);
  if (Number.isNaN(date.getTime())) return rawValue;
  const preferences = getPreferences();
  const {
    locale = DEFAULT_LOCALE,
    calendar = preferences.calendar,
    numberingSystem = preferences.numberingSystem,
    ...formatOptions
  } = options;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    calendar,
    numberingSystem,
    ...formatOptions
  }).format(date);
}

export function formatDateTime(value, options = {}) {
  const rawValue = String(value ?? '');
  if (!rawValue) return '—';
  const date = parseDate(rawValue);
  if (Number.isNaN(date.getTime())) return rawValue;
  const preferences = getPreferences();
  const {
    locale = DEFAULT_LOCALE,
    calendar = preferences.calendar,
    numberingSystem = preferences.numberingSystem,
    ...formatOptions
  } = options;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    calendar,
    numberingSystem,
    ...formatOptions
  }).format(date);
}

export function formatMonth(monthKey, options = {}) {
  if (typeof monthKey !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return '—';
  const date = parseDate(`${monthKey}-01`);
  const preferences = getPreferences();
  const {
    locale = DEFAULT_LOCALE,
    calendar = preferences.calendar,
    numberingSystem = preferences.numberingSystem,
    ...formatOptions
  } = options;
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    calendar,
    numberingSystem,
    ...formatOptions
  }).format(date);
}
