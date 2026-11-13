const {
  createOfficialHeader,
  createReportDocument,
  createSignatureSection,
  createStyledTable
} = require('./wordReportStyle');

async function createPersonnelDocument(records, logo = null, columns = []) {
  const tableColumns = columns.length
    ? columns.map((column) => ({ key: column.column_key, label: column.source_header }))
    : [
      { key: 'military_number', label: 'الرقم العسكري' },
      { key: 'full_name', label: 'الاسم' },
      { key: 'rank', label: 'الرتبة' },
      { key: 'category', label: 'الفئة' },
      { key: 'unit', label: 'الوحدة' }
    ];
  const children = [
    ...createOfficialHeader('كشف الأفراد', '', logo),
    createStyledTable(
      tableColumns.map((column) => column.label),
      records.map((person) => tableColumns.map((column) => person[column.key] || ''))
    ),
    ...createSignatureSection()
  ];
  return createReportDocument(children);
}

module.exports = { createPersonnelDocument };
