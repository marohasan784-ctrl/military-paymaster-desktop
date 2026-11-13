const { Paragraph } = require('docx');
const {
  createOfficialHeader,
  createReportDocument,
  createSignatureSection,
  createStyledTable,
  rtlParagraph
} = require('./wordReportStyle');

const REPORT_SECTIONS = [
  {
    title: 'الأفراد وقت الإقفال',
    key: 'personnel',
    fields: [
      ['military_number', 'الرقم العسكري'],
      ['full_name', 'الاسم'],
      ['rank', 'الرتبة'],
      ['category', 'الفئة'],
      ['unit', 'الوحدة']
    ]
  },
  {
    title: 'الماهيات',
    key: 'salaries',
    fields: [
      ['military_number', 'الرقم العسكري'],
      ['full_name', 'الاسم'],
      ['base_salary', 'الماهية الأساسية'],
      ['allowances', 'البدلات']
    ]
  },
  {
    title: 'الجزاءات',
    key: 'penalties',
    fields: [
      ['military_number', 'الرقم العسكري'],
      ['full_name', 'الاسم'],
      ['penalty_type', 'نوع الجزاء'],
      ['days', 'الأيام'],
      ['reason', 'السبب / البيان'],
      ['action_date', 'تاريخ الإجراء'],
      ['clause_no', 'رقم البند / الأمر'],
      ['deduction_amount', 'قيمة الخصم'],
      ['notes', 'ملاحظات']
    ]
  },
  {
    title: 'أوامر التوريد',
    key: 'supplyOrders',
    fields: [
      ['order_number', 'رقم الأمر'],
      ['order_date', 'التاريخ'],
      ['supplier', 'المورد'],
      ['description', 'البيان'],
      ['amount', 'القيمة'],
      ['status', 'الحالة']
    ]
  }
];

async function createMonthlyReport(monthKey, snapshot, archiveRevision = null, period = null, logo = null) {
  const subtitle = [
    `الفترة المالية: ${monthKey}`,
    period ? `نطاق الفترة: ${period.start_date} إلى ${period.end_date}` : null,
    archiveRevision
      ? `أرشيف معتمد - الإصدار ${archiveRevision}`
      : 'بيانات الفترة الحالية - لم يتم إقفالها وأرشفتها'
  ].filter(Boolean).join(' · ');
  const children = [...createOfficialHeader(`التقرير المالي الشهري - ${monthKey}`, subtitle, logo)];

  for (const section of REPORT_SECTIONS) {
    appendSection(children, section.title, snapshot[section.key] || [], section.fields);
  }

  const customSections = snapshot.customSections || buildLegacyCustomSections(snapshot.submoduleRecords || []);
  for (const section of customSections) {
    const sectionTitle = [section.module_title, section.submodule_title || section.submodule_id]
      .filter(Boolean)
      .join(' · ');
    const hasActionFields = section.records.some((record) => record.military_number);
    const actionFields = hasActionFields ? [
      ['الرقم العسكري المرتبط', 'military_number'],
      ['اسم الفرد', 'full_name'],
      ['الرتبة', 'rank'],
      ['نوع الإجراء', 'action_type'],
      ['مدة الإجراء بالأيام', 'action_days'],
      ['سبب الإجراء', 'action_reason'],
      ['تاريخ الإجراء', 'action_date'],
      ['رقم البند / الأمر', 'clause_no']
    ] : [];
    const rows = section.records.map((record) => ({
      ...Object.fromEntries(
        Object.entries(record.data).map(([key, value]) => [
          section.fields.find((field) => field.key === key)?.label || key,
          value
        ])
      ),
      ...Object.fromEntries(actionFields.map(([label, key]) => [label, record[key] ?? '']))
    }));
    const submoduleFields = [
      ...section.fields.map((field) => field.label),
      ...actionFields.map(([label]) => label)
    ];
    appendSection(
      children,
      sectionTitle,
      rows,
      submoduleFields.map((field) => [field, field])
    );
  }

  children.push(...createSignatureSection());
  return createReportDocument(children);
}

function buildLegacyCustomSections(records) {
  const sections = new Map();
  for (const record of records) {
    const key = `${record.module_title || ''}\u0000${record.submodule_id}`;
    if (!sections.has(key)) {
      sections.set(key, {
        module_title: record.module_title,
        submodule_title: record.submodule_title,
        submodule_id: record.submodule_id,
        fields: JSON.parse(record.fields_json || '[]'),
        records: []
      });
    }
    sections.get(key).records.push(record);
  }
  return [...sections.values()];
}

function appendSection(children, title, rows, fields) {
  children.push(new Paragraph({
    ...rtlParagraph(title),
    style: 'SectionTitle',
    spacing: { before: 300, after: 100 }
  }));
  if (rows.length === 0) {
    children.push(new Paragraph({
      ...rtlParagraph('لا توجد سجلات.'),
      style: 'TableText'
    }));
    return;
  }
  children.push(createStyledTable(
    fields.map(([, label]) => label),
    rows.map((row) => fields.map(([key]) => row[key]))
  ));
}

module.exports = { createMonthlyReport };
