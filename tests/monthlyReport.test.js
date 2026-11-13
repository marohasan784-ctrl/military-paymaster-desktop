const assert = require('node:assert/strict');
const test = require('node:test');
const PizZip = require('pizzip');
const { createMonthlyReport } = require('../src/services/monthlyReport');

test('exports monthly snapshots and submodule field labels to a Word report', async () => {
  const buffer = await createMonthlyReport('2026-07', {
    personnel: [{ military_number: '1001', full_name: 'اسم محفوظ', category: 'جندي' }],
    salaries: [{ military_number: '1001', full_name: 'اسم محفوظ', base_salary: 5000, allowances: 200 }],
    penalties: [{
      military_number: '1001',
      full_name: 'اسم محفوظ',
      penalty_type: 'حبس',
      days: 15,
      reason: 'التغيب',
      action_date: '2026-07-12',
      clause_no: '12',
      deduction_amount: 0,
      notes: ''
    }],
    supplyOrders: [],
    submoduleRecords: [{
      module_title: 'قسم تجريبي',
      submodule_title: 'شطب عادي',
      fields_json: '[{"key":"field_1","label":"بيان الشطب"}]',
      data: { field_1: 'قيمة محفوظة' },
      military_number: '1001',
      full_name: 'اسم محفوظ',
      rank: 'جندي',
      action_type: 'حبس',
      action_days: 15,
      action_reason: 'غياب',
      action_date: '2026-07-12',
      clause_no: '12'
    }, {
      module_title: 'قسم تجريبي',
      submodule_title: 'شطب عادي',
      fields_json: '[{"key":"field_1","label":"بيان الشطب"}]',
      data: { field_1: 'قيمة أخرى' }
    }],
    periodRange: { start_date: '2026-06-25', end_date: '2026-07-24' }
  }, 1, { start_date: '2026-06-25', end_date: '2026-07-24' });
  const documentXml = new PizZip(buffer).file('word/document.xml').asText();
  assert.match(documentXml, /التقرير المالي الشهري/);
  assert.match(documentXml, /2026-06-25 إلى 2026-07-24/);
  assert.match(documentXml, /الجهة: الجهة التجريبية/);
  assert.match(documentXml, /اسم القائد التجريبي/);
  assert.match(documentXml, /اسم المسؤول المالي التجريبي/);
  assert.match(documentXml, /مهندس تطوير النظام/);
  assert.match(documentXml, /قسم تجريبي · شطب عادي/);
  assert.match(documentXml, /<w:bidi\/>/);
  assert.match(documentXml, /<w:bidiVisual\/>/);
  assert.match(documentXml, /<w:pgBorders/);
  assert.match(documentXml, /w:fill="1E293B"/);
  assert.match(documentXml, /w:val="FFFFFF"/);
  assert.match(documentXml, /w:fill="F1F5F9"/);
  assert.match(documentXml, /الاعتماد والتوقيعات/);
  assert.match(documentXml, /اسم القائد التجريبي/);
  assert.match(documentXml, /اسم محفوظ/);
  assert.match(documentXml, /بيان الشطب/);
  assert.match(documentXml, /قيمة محفوظة/);
  assert.match(documentXml, /سبب الإجراء/);
  assert.match(documentXml, /غياب/);
  assert.match(documentXml, /2026-07-12/);
  assert.match(documentXml, /التغيب/);
  assert.match(documentXml, /2026-07-12/);
  assert.match(documentXml, /حبس/);
});

test('embeds the institution logo and includes empty custom subsections in the report', async () => {
  const logo = {
    type: 'png',
    data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=', 'base64')
  };
  const buffer = await createMonthlyReport('2026-07', {
    personnel: [],
    salaries: [],
    penalties: [],
    supplyOrders: [],
    submoduleRecords: [],
    customSections: [{
      module_title: 'إدارة جديدة',
      submodule_title: 'قسم فرعي فارغ',
      submodule_id: 'empty-section',
      fields: [{ key: 'field_1', label: 'البيان' }],
      records: []
    }]
  }, null, null, logo);
  const zip = new PizZip(buffer);
  const documentXml = zip.file('word/document.xml').asText();

  assert.match(documentXml, /إدارة جديدة · قسم فرعي فارغ/);
  assert.match(documentXml, /لا توجد سجلات/);
  assert.ok(zip.file('word/media/image1.png'));
});
