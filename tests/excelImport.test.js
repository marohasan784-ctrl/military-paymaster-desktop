const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ExcelJS = require('exceljs');
const { readPersonnelWorkbook } = require('../src/services/excelImport');

test('imports arbitrary category values without rejecting otherwise valid rows', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-import-'));
  const filePath = path.join(directory, 'roster.xlsx');
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الأفراد');
  sheet.addRow(['الرقم العسكري', 'الاسم', 'الرتبة', 'الفئة', 'الوحدة']);
  sheet.addRow(['1001', 'اسم تجريبي', 'جندي', 'جندي', 'الوحدة']);
  sheet.addRow(['1002', 'اسم آخر', 'مساعد', 'مدني', 'الوحدة']);
  sheet.addRow(['1003', 'اسم ثالث', 'فني', 'تصنيف جديد ', 'الوحدة']);
  sheet.addRow(['1004', 'اسم بلا فئة', 'جندي', '', 'الوحدة']);
  await workbook.xlsx.writeFile(filePath);

  const result = await readPersonnelWorkbook(filePath);
  assert.equal(result.records.length, 4);
  assert.equal(result.records[0].military_number, '1001');
  assert.equal(result.records[1].category, 'مدني');
  assert.equal(result.records[2].category, 'تصنيف جديد ');
  assert.equal(result.records[3].category, '');
  assert.deepEqual(result.errors, []);
});

test('imports CSV files using the same fixed header mapping', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-csv-'));
  const filePath = path.join(directory, 'roster.csv');
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(
    filePath,
    'الرقم العسكري,الاسم,الفئة\n1003,اسم CSV,ضابط',
    'utf8'
  );

  const result = await readPersonnelWorkbook(filePath);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].full_name, 'اسم CSV');
  assert.deepEqual(result.errors, []);
});

test('allows imports when the workbook has no category column', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-import-no-category-'));
  const filePath = path.join(directory, 'roster.xlsx');
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الأفراد');
  sheet.addRow(['الرقم العسكري', 'الاسم', 'اسم الأب']);
  sheet.addRow(['1005', 'اسم بدون فئة', 'الأب']);
  await workbook.xlsx.writeFile(filePath);

  const result = await readPersonnelWorkbook(filePath);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].category, '');
  assert.deepEqual(result.errors, []);
});

test('preserves arbitrary Excel headings and maps them to reusable personnel fields', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-dynamic-import-'));
  const filePath = path.join(directory, 'roster.xlsx');
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الأفراد');
  sheet.addRow(['الرقم العسكري', 'الاسم الكامل للفرد', 'الفئة', 'اسم الأب', 'محل الميلاد']);
  sheet.addRow(['1004', 'اسم محفوظ', 'ضابط', 'الأب', 'القاهرة']);
  await workbook.xlsx.writeFile(filePath);

  const preview = await readPersonnelWorkbook(filePath, { allowUnmapped: true });
  assert.deepEqual(preview.headers.map((header) => header.name), [
    'الرقم العسكري', 'الاسم الكامل للفرد', 'الفئة', 'اسم الأب', 'محل الميلاد'
  ]);
  assert.equal(preview.mappings.military_number, 'الرقم العسكري');
  assert.equal(preview.records[0].sourceData['محل الميلاد'], 'القاهرة');

  const mapped = await readPersonnelWorkbook(filePath, {
    mappings: { full_name: 'الاسم الكامل للفرد' }
  });
  assert.equal(mapped.records[0].full_name, 'اسم محفوظ');
  assert.equal(mapped.records[0].sourceData['اسم الأب'], 'الأب');
});
