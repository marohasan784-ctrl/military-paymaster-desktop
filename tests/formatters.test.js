import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatMoney, formatMonth, formatNumber } from '../src/services/formatters.js';

test('formats numbers using the requested numbering system', () => {
  assert.equal(formatNumber(1234, { locale: 'en-US', numberingSystem: 'latn' }), '1,234');
});

test('formats ISO date-only values without timezone shifts', () => {
  assert.equal(formatDate('2024-03-05', {
    locale: 'en-GB',
    calendar: 'gregory',
    numberingSystem: 'latn'
  }), '05/03/2024');
});

test('formats money with fixed decimal places and rejects impossible dates', () => {
  assert.equal(formatMoney(1234.5, { locale: 'en-US', numberingSystem: 'latn' }), '1,234.50 ج.م');
  assert.equal(formatDate('2024-02-31', { locale: 'en-GB' }), '2024-02-31');
});

test('preserves invalid display text and rejects invalid month keys', () => {
  assert.equal(formatDate('غير محدد'), 'غير محدد');
  assert.equal(formatMonth('2024-13'), '—');
});
