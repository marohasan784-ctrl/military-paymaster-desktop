const path = require('node:path');
const ExcelJS = require('exceljs');

const HEADER_ALIASES = {
  military_number: ['الرقم العسكري', 'رقم عسكري', 'military number', 'military_number'],
  full_name: ['الاسم', 'الاسم بالكامل', 'اسم الفرد', 'full name', 'name'],
  rank: ['الرتبة', 'الدرجة', 'rank'],
  category: ['الفئة', 'الفئة الوظيفية', 'category'],
  unit: ['الوحدة', 'unit'],
  notes: ['ملاحظات', 'notes']
};

function normalizeHeader(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ar')
    .replace(/[\s_-]+/g, ' ')
    .replace(/[أإآ]/g, 'ا');
}

function getSuggestedMappings(headers) {
  const normalizedHeaders = new Map(headers.map((header) => [normalizeHeader(header.name), header.name]));
  return Object.fromEntries(Object.entries(HEADER_ALIASES).flatMap(([field, aliases]) => {
    const match = aliases.map(normalizeHeader).find((alias) => normalizedHeaders.has(alias));
    return match ? [[field, normalizedHeaders.get(match)]] : [];
  }));
}

async function readPersonnelWorkbook(filePath, { mappings = null, allowUnmapped = false } = {}) {
  const extension = path.extname(filePath).toLocaleLowerCase();
  if (!['.xlsx', '.csv'].includes(extension)) {
    throw new Error('صيغة الملف غير مدعومة. اختر ملف Excel أو CSV.');
  }

  const workbook = new ExcelJS.Workbook();
  if (extension === '.csv') await workbook.csv.readFile(filePath);
  else await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) throw new Error('الملف لا يحتوي على ورقة بيانات.');

  const headerRow = worksheet.getRow(1);
  const headers = [];
  const normalizedHeaders = new Set();
  for (let column = 1; column <= headerRow.cellCount; column += 1) {
    const name = headerRow.getCell(column).text;
    if (!String(name).trim()) continue;
    const normalized = normalizeHeader(name);
    if (normalizedHeaders.has(normalized)) {
      throw new Error(`يوجد عنوان عمود مكرر أو ملتبس: «${name}». غيّر أحد العناوين ثم أعد الاستيراد.`);
    }
    normalizedHeaders.add(normalized);
    headers.push({ name, index: column });
  }
  if (!headers.length) throw new Error('الصف الأول لا يحتوي على عناوين أعمدة.');

  const suggestedMappings = getSuggestedMappings(headers);
  const validHeaderNames = new Set(headers.map((header) => header.name));
  const selectedMappings = { ...suggestedMappings, ...(mappings || {}) };
  for (const [field, headerName] of Object.entries(selectedMappings)) {
    if (headerName && !validHeaderNames.has(headerName)) {
      throw new Error(`عنوان العمود المحدد للحقل ${field} غير موجود في الملف.`);
    }
  }
  const missing = ['military_number', 'full_name']
    .filter((field) => !selectedMappings[field]);
  if (missing.length && !allowUnmapped) {
    throw new Error(`يرجى ربط الأعمدة الإلزامية قبل الاستيراد: ${missing.map((field) => ({
      military_number: 'الرقم العسكري',
      full_name: 'الاسم',
      category: 'الفئة'
    }[field])).join('، ')}`);
  }

  const records = [];
  const errors = [];
  worksheet.eachRow((source, rowNumber) => {
    if (rowNumber === 1) return;
    const sourceData = Object.fromEntries(headers.map(({ name, index }) => [
      name,
      source.getCell(index).text
    ]));
    if (Object.values(sourceData).every((value) => !String(value).trim())) return;

    const value = (field, trim = true) => {
      const headerName = selectedMappings[field];
      const fieldValue = headerName ? String(sourceData[headerName] ?? '') : '';
      return trim ? fieldValue.trim() : fieldValue;
    };
    const record = {
      military_number: value('military_number'),
      full_name: value('full_name'),
      rank: value('rank'),
      category: value('category', false),
      unit: value('unit'),
      notes: value('notes'),
      sourceData
    };

    if (allowUnmapped) {
      records.push({ ...record, _rowNumber: rowNumber });
    } else if (!record.military_number || !record.full_name) {
      errors.push(`الصف ${rowNumber}: الرقم العسكري والاسم مطلوبان.`);
    } else {
      records.push(record);
    }
  });

  return {
    records,
    errors,
    headers: headers.map((header) => ({
      ...header,
      field: Object.entries(selectedMappings).find(([, sourceHeader]) => sourceHeader === header.name)?.[0] || ''
    })),
    mappings: selectedMappings,
    suggestedMappings,
    rowCount: records.length + errors.length
  };
}

module.exports = { readPersonnelWorkbook, HEADER_ALIASES };
