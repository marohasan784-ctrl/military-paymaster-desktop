function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mapModuleRecords(moduleId, monthData) {
  const records = {
    personnel: monthData.personnel || [],
    salaries: monthData.salaries || [],
    penalties: monthData.penalties || [],
    supplies: monthData.supplyOrders || [],
    invoices: monthData.invoices || []
  };
  return records[moduleId] ?? (monthData.customSections || [])
    .filter((section) => section.module_id === moduleId)
    .flatMap((section) => section.records.map((record) => ({
      ...record,
      module_id: section.module_id,
      module_title: section.module_title,
      submodule_id: section.submodule_id,
      submodule_title: section.submodule_title,
      fields: section.fields
    })));
}

function enrichRecord(record, monthData, personnelColumns) {
  const linkedPerson = (monthData.personnel || []).find((person) => (
    person.military_number && person.military_number === record.military_number
  ));
  const result = {
    ...(linkedPerson || {}),
    ...record,
    ...(record.data || {})
  };
  if (linkedPerson) {
    result.full_name = linkedPerson.full_name;
    result.military_number = linkedPerson.military_number;
  }
  for (const column of personnelColumns) {
    result[column.column_key] = linkedPerson?.[column.column_key] ?? result[column.column_key] ?? '';
  }
  for (const field of record.fields || []) {
    const value = record.data?.[field.key] ?? '';
    result[field.key] = field.type === 'percentage' && value ? `${value}%` : value;
    result[field.label] = result[field.key];
    result[field.label.replace(/\s+/g, '_')] = result[field.key];
    if (record.submodule_id) {
      result[`section_${record.submodule_id}_${field.key}`] = result[field.key];
    }
  }
  return result;
}

function getTableColumns(moduleId, sections, personnelColumns) {
  const standardColumns = {
    personnel: [
      ['full_name', 'الاسم'], ['military_number', 'الرقم العسكري'], ['rank', 'الرتبة'],
      ['category', 'الفئة'], ['unit', 'الوحدة']
    ],
    salaries: [
      ['full_name', 'الاسم'], ['military_number', 'الرقم العسكري'], ['rank', 'الرتبة'],
      ['base_salary', 'الراتب الأساسي'], ['allowances', 'البدلات'], ['effective_month', 'الشهر']
    ],
    penalties: [
      ['full_name', 'الاسم'], ['military_number', 'الرقم العسكري'], ['penalty_type', 'نوع الجزاء'],
      ['days', 'المدة'], ['reason', 'السبب'], ['action_date', 'التاريخ'], ['clause_no', 'رقم البند']
    ],
    supplies: [
      ['order_number', 'رقم الأمر'], ['order_date', 'التاريخ'], ['supplier', 'المورد'],
      ['description', 'البيان'], ['amount', 'القيمة'], ['status', 'الحالة']
    ],
    invoices: [
      ['invoice_number', 'رقم الفاتورة'], ['invoice_date', 'التاريخ'], ['company_name', 'الشركة'],
      ['grand_total', 'الإجمالي']
    ]
  };
  const columns = standardColumns[moduleId] || [
    ...(sections.length > 1 ? [['submodule_title', 'القسم الفرعي']] : []),
    ...sections.flatMap((section) => section.fields.map((field) => [
      sections.length > 1 ? `section_${section.submodule_id}_${field.key}` : field.key,
      sections.length > 1 ? `${section.submodule_title} · ${field.label}` : field.label
    ]))
  ];
  const unique = new Map(columns);
  for (const column of personnelColumns) unique.set(column.column_key, column.source_header);
  return [...unique].map(([key, label]) => ({ key, label }));
}

function renderRecordsTable(records, columns) {
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = records.map((record) => (
    `<tr>${columns.map((column) => `<td>${escapeHtml(record[column.key])}</td>`).join('')}</tr>`
  )).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function buildDocumentTemplateData({ template, module, monthData, personnelColumns = [], recordId = '' }) {
  const matchingSections = (monthData.customSections || []).filter((section) => (
    section.module_id === template.module_id
    && (!template.submodule_id || section.submodule_id === template.submodule_id)
  ));
  const sourceRecords = template.submodule_id
    ? matchingSections.flatMap((section) => section.records.map((record) => ({
      ...record,
      module_id: section.module_id,
      module_title: section.module_title,
      submodule_id: section.submodule_id,
      submodule_title: section.submodule_title,
      fields: section.fields
    })))
    : mapModuleRecords(template.module_id, monthData);
  const records = sourceRecords.map((record) => enrichRecord(record, monthData, personnelColumns));
  const selectedRecord = recordId
    ? records.find((record) => String(record.id ?? record.military_number) === String(recordId))
    : null;
  if (recordId && !selectedRecord) throw new Error('السجل المطلوب للقالب غير موجود في الفترة المحددة.');
  const outputRecords = selectedRecord ? [selectedRecord] : records;
  const tableColumns = getTableColumns(template.module_id, matchingSections, personnelColumns);
  const firstRecord = selectedRecord || (records.length === 1 ? records[0] : {});
  return {
    full_name: '',
    military_number: '',
    rank: '',
    category: '',
    unit: '',
    notes: '',
    base_salary: '',
    allowances: '',
    effective_month: '',
    penalty_type: '',
    days: '',
    deduction_amount: '',
    reason: '',
    action_date: '',
    clause_no: '',
    order_number: '',
    order_date: '',
    supplier: '',
    description: '',
    amount: '',
    status: '',
    invoice_number: '',
    invoice_date: '',
    company_name: '',
    grand_total: '',
    ...Object.fromEntries(personnelColumns.map((column) => [column.column_key, ''])),
    ...Object.fromEntries(matchingSections.flatMap((section) => section.fields.map((field) => [field.key, '']))),
    ...firstRecord,
    moduleTitle: module.title,
    moduleId: module.id,
    submoduleTitle: matchingSections.find((section) => section.submodule_id === template.submodule_id)?.submodule_title || '',
    monthKey: monthData.monthKey,
    periodStart: monthData.periodRange?.start_date || '',
    periodEnd: monthData.periodRange?.end_date || '',
    periodId: monthData.monthKey,
    totalRecords: outputRecords.length,
    records: outputRecords,
    records_table: renderRecordsTable(outputRecords, tableColumns)
  };
}

module.exports = { buildDocumentTemplateData, renderRecordsTable };
