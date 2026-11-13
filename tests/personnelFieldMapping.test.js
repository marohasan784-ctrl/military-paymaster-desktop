const assert = require('node:assert/strict');
const test = require('node:test');

async function loadPersonnelFieldMapping() {
  return import('../src/services/personnelFieldMapping.js');
}

test('maps common personnel fields from a selected registry entry', async () => {
  const { personnelValueForField } = await loadPersonnelFieldMapping();
  const person = {
    military_number: 'P-100',
    full_name: 'أحمد محمد',
    rank: 'رقيب',
    category: 'ضابط صف',
    unit: 'الوحدة الأولى'
  };

  assert.equal(personnelValueForField({ type: 'person', label: 'الفرد' }, person, []), 'P-100');
  assert.equal(personnelValueForField({ type: 'text', label: 'الاسم بالكامل' }, person, []), 'أحمد محمد');
  assert.equal(personnelValueForField({ type: 'text', label: 'الرتبة العسكرية' }, person, []), 'رقيب');
  assert.equal(personnelValueForField({ type: 'text', label: 'الوحدة' }, person, []), 'الوحدة الأولى');
});

test('maps imported personnel columns and skips incompatible select values', async () => {
  const { personnelValueForField } = await loadPersonnelFieldMapping();
  const person = {
    source_data: { 'محل الميلاد': 'القاهرة' },
    imported_1: 'القاهرة',
    category: 'ضابط'
  };
  const columns = [{
    column_key: 'imported_1',
    source_header: 'محل الميلاد',
    placeholder_label: 'محل الميلاد'
  }];

  assert.equal(personnelValueForField({ type: 'text', label: 'محل الميلاد' }, person, columns), 'القاهرة');
  assert.equal(personnelValueForField({
    type: 'select',
    label: 'الفئة',
    options: ['جندي', 'ضابط صف']
  }, person, columns), undefined);
});
