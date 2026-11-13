const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun
} = require('docx');
const htmlToDocx = require('html-to-docx');
const {
  renderWordTemplate,
  renderWordTemplateBatch,
  createCommonTemplateData,
  createPenaltyTemplateData,
  createSubmoduleTemplateData
} = require('../src/services/docxTemplate');
const { renderHtmlDocument } = require('../src/services/htmlDocument');
const { buildDocumentTemplateData } = require('../src/services/documentTemplateData');

test('fills field placeholders in an attached Word template', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-template-'));
  const templatePath = path.join(directory, 'template.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));

  const template = new Document({
    sections: [{ children: [new Paragraph('القيمة: {field_1}')] }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  const output = await renderWordTemplate(templatePath, { field_1: 'بيانات الاختبار' });
  const zip = new PizZip(output);
  const rendered = new Docxtemplater(zip);
  const documentXml = rendered.getZip().file('word/document.xml').asText();
  assert.match(documentXml, /بيانات الاختبار/);
  assert.doesNotMatch(documentXml, /\{field_1\}/);
});

test('renders selected records from one DOCX template as separate pages in one file', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-template-batch-'));
  const templatePath = path.join(directory, 'template.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const template = new Document({
    sections: [{ children: [new Paragraph('{field_1} · {NAME} · {excel_1} · {organization}')] }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  const output = await renderWordTemplateBatch(templatePath, [
    { field_1: 'بيانات أولى', NAME: 'أحمد الأول', excel_1: 'الأب الأول', organization: 'الجهة' },
    { field_1: 'بيانات ثانية', NAME: 'أحمد الثاني', excel_1: 'الأب الثاني', organization: 'الجهة' }
  ]);
  const documentXml = new PizZip(output).file('word/document.xml').asText();
  assert.match(documentXml, /بيانات أولى/);
  assert.match(documentXml, /أحمد الأول/);
  assert.match(documentXml, /بيانات ثانية/);
  assert.match(documentXml, /أحمد الثاني/);
  assert.equal((documentXml.match(/w:type="page"/g) || []).length, 1);
});

test('repeats a marked DOCX table row with each selected record mapped to its own columns', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-template-table-loop-'));
  const templatePath = path.join(directory, 'template.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const makeCell = (text) => new TableCell({ children: [new Paragraph(text)] });
  const people = [
    { full_name: 'باسم كمال سليمان', military_number: 'A-1', rank: 'عريف' },
    { full_name: 'حسين علي إبراهيم', military_number: 'A-2', rank: 'رقيب' },
    { full_name: 'أيمن محمد حسن', military_number: 'A-3', rank: 'جندي' },
    { full_name: 'أحمد سامي محمود', military_number: 'A-4', rank: 'مساعد' }
  ];
  const template = new Document({
    sections: [{
      children: [
        new Paragraph('الجهة: {organization}'),
        new Table({
          rows: [
            new TableRow({
              children: [makeCell('الاسم'), makeCell('الرتبة'), makeCell('الرقم العسكري')]
            }),
            new TableRow({
              children: [
                makeCell('{#records}{field_1}'),
                makeCell('{RANK}'),
                makeCell('{field_2} · {MILITARY_ID}{/records}')
              ]
            })
          ]
        })
      ]
    }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  const templateData = people.map((person) => createSubmoduleTemplateData({
    data: { field_1: person.full_name, field_2: person.military_number },
    fields: [
      { key: 'field_1', label: 'الاسم' },
      { key: 'field_2', label: 'الرقم العسكري' }
    ],
    ...person
  }, person));
  const output = await renderWordTemplateBatch(templatePath, templateData, { organization: 'الجهة الرسمية' });
  const zip = new PizZip(output);
  const documentXml = zip.file('word/document.xml').asText();
  const renderedText = new Docxtemplater(zip).getFullText();
  assert.match(renderedText, /الجهة: الجهة الرسمية/);
  for (const person of people) {
    assert.ok(renderedText.includes(`${person.full_name}${person.rank}${person.military_number} · ${person.military_number}`));
  }
  assert.doesNotMatch(renderedText, /باسم كمال سليمانرقيبA-2|حسين علي إبراهيمعريفA-1/);
  assert.equal((documentXml.match(/<w:tr\b/g) || []).length, 5);
  assert.match(documentXml, /<w:bidi\/>/);
  assert.match(documentXml, /<w:rtl\/>/);
});

test('collapses repeated records loops in a DOCX table to a single data row', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-template-repeated-table-loops-'));
  const templatePath = path.join(directory, 'template.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const makeCell = (text) => new TableCell({ children: [new Paragraph(text)] });
  const makeRecordRow = () => new TableRow({
    children: [
      makeCell('{#records}{PENALTY_REASON}'),
      makeCell('{field_2}'),
      makeCell('{field_1}'),
      makeCell('{RANK}{/records}')
    ]
  });
  const template = new Document({
    sections: [{
      children: [new Table({
        rows: [
          new TableRow({ children: [makeCell('السبب'), makeCell('الرقم'), makeCell('الاسم'), makeCell('الرتبة')] }),
          makeRecordRow(),
          makeRecordRow(),
          makeRecordRow(),
          new TableRow({ children: [makeCell(''), makeCell(''), makeCell(''), makeCell('')] }),
          new TableRow({ children: [makeCell(''), makeCell(''), makeCell(''), makeCell('')] })
        ]
      })]
    }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  const records = [
    { PENALTY_REASON: 'سبب الأول', field_2: '10247', field_1: 'باسم كمال سليمان', RANK: 'رقيب' },
    { PENALTY_REASON: 'سبب الثاني', field_2: '10242', field_1: 'حسين حسن الشناوي', RANK: 'ملازم أول' },
    { PENALTY_REASON: 'سبب الثالث', field_2: '10264', field_1: 'أيمن عبد العزيز خليل', RANK: 'عريف' },
    { PENALTY_REASON: 'سبب الرابع', field_2: '10237', field_1: 'أحمد محمد إبراهيم', RANK: 'مساعد' }
  ];
  const output = await renderWordTemplateBatch(templatePath, records);
  const zip = new PizZip(output);
  const documentXml = zip.file('word/document.xml').asText();
  const renderedText = new Docxtemplater(zip).getFullText();
  assert.equal((documentXml.match(/<w:tr\b/g) || []).length, records.length + 1);
  for (const record of records) {
    assert.equal(renderedText.split(record.field_1).length - 1, 1);
    assert.equal(renderedText.split(record.field_2).length - 1, 1);
  }
});

test('automatically repeats only the first unmarked DOCX data row for selected records', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-template-auto-table-'));
  const templatePath = path.join(directory, 'template.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const makeCell = (text) => new TableCell({ children: [new Paragraph(text)] });
  const template = new Document({
    sections: [{
      children: [new Table({
        rows: [
          new TableRow({ children: [makeCell('الاسم'), makeCell('الرقم العسكري')] }),
          new TableRow({ children: [makeCell('{NAME}'), makeCell('{MILITARY_ID}')] }),
          new TableRow({ children: [makeCell('{NAME}'), makeCell('{MILITARY_ID}')] }),
          new TableRow({ children: [makeCell('{NAME}'), makeCell('{MILITARY_ID}')] })
        ]
      })]
    }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  const records = Array.from({ length: 100 }, (_, index) => ({
    NAME: `الفرد رقم ${String(index + 1).padStart(3, '0')}`,
    MILITARY_ID: `A-${String(index + 1).padStart(3, '0')}`
  }));
  const output = await renderWordTemplateBatch(templatePath, records);
  const documentXml = new PizZip(output).file('word/document.xml').asText();
  const renderedText = new Docxtemplater(new PizZip(output)).getFullText();
  assert.equal((documentXml.match(/<w:tr\b/g) || []).length, records.length + 1);
  for (const record of records) {
    assert.equal(renderedText.split(record.NAME).length - 1, 1);
    assert.equal(renderedText.split(record.MILITARY_ID).length - 1, 1);
  }

  const singleOutput = await renderWordTemplateBatch(templatePath, [records[0]]);
  const singleXml = new PizZip(singleOutput).file('word/document.xml').asText();
  assert.equal((singleXml.match(/<w:tr\b/g) || []).length, 2);
  assert.equal(new Docxtemplater(new PizZip(singleOutput)).getFullText().split(records[0].NAME).length - 1, 1);
});

test('renders table loops when Word splits loop tags across text runs', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-template-split-loop-'));
  const templatePath = path.join(directory, 'template.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const cell = (runs) => new TableCell({
    children: [new Paragraph({ children: runs.map((text) => new TextRun(text)) })]
  });
  const template = new Document({
    sections: [{
      children: [new Table({
        rows: [
          new TableRow({ children: [cell(['الاسم']), cell(['الرقم العسكري'])] }),
          new TableRow({
            children: [
              cell(['{#', 'records}', '{NAME}']),
              cell(['{MILITARY_ID}', '{/', 'records}'])
            ]
          })
        ]
      })]
    }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  const output = await renderWordTemplateBatch(templatePath, [
    { NAME: 'الفرد الأول', MILITARY_ID: 'A-1' },
    { NAME: 'الفرد الثاني', MILITARY_ID: 'A-2' }
  ]);
  const renderedText = new Docxtemplater(new PizZip(output)).getFullText();
  assert.ok(renderedText.includes('الفرد الأول'));
  assert.ok(renderedText.includes('A-1'));
  assert.ok(renderedText.includes('الفرد الثاني'));
  assert.ok(renderedText.includes('A-2'));
});

test('reports malformed DOCX loop tags with an Arabic template error', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-template-invalid-loop-'));
  const templatePath = path.join(directory, 'template.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const template = new Document({
    sections: [{ children: [new Paragraph('{#records}{NAME}')] }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  await assert.rejects(
    renderWordTemplateBatch(templatePath, [{ NAME: 'الفرد الأول' }, { NAME: 'الفرد الثاني' }]),
    /تعذر معالجة قالب Word.*records.*unclosed/i
  );
});

test('maps custom form, personnel Excel, action, and official placeholders together', () => {
  const values = createSubmoduleTemplateData({
    data: { field_1: 'بيان النموذج' },
    fields: [{ key: 'field_1', label: 'البيان' }],
    full_name: 'أحمد محمد',
    military_number: 'M-1',
    rank: 'عريف',
    action_type: 'حبس',
    action_days: 3,
    action_reason: 'غياب',
    action_date: '2026-11-13',
    clause_no: '7'
  }, {
    full_name: 'أحمد محمد',
    military_number: 'M-1',
    rank: 'عريف',
    excel_1: 'إبراهيم'
  }, [{ column_key: 'excel_1' }], {
    organization: 'الجهة',
    unit_commander: 'القائد'
  });

  assert.equal(values.field_1, 'بيان النموذج');
  assert.equal(values.excel_1, 'إبراهيم');
  assert.equal(values.NAME, 'أحمد محمد');
  assert.equal(values.MILITARY_ID, 'M-1');
  assert.equal(values.PENALTY_DAYS, '3 يوم حبس');
  assert.equal(values.GENERATED_TEXT, 'تجازى المذكور 3 يوم حبس نظير غياب بتاريخ 2026-11-13 بند رقم 7');
  assert.equal(values.organization, 'الجهة');
  assert.equal(values.unit_commander, 'القائد');
});

test('maps a person field to the linked name without changing the military number placeholder', () => {
  const values = createSubmoduleTemplateData({
    data: { field_1: 'M-42', field_2: 'غياب' },
    fields: [
      { key: 'field_1', label: 'اسم الفرد', type: 'person' },
      { key: 'field_2', label: 'سبب الإجراء', type: 'text' }
    ],
    military_number: 'M-42',
    full_name: 'باسم كمال سليمان',
    rank: 'عريف'
  }, {
    military_number: 'M-42',
    full_name: 'باسم كمال سليمان',
    rank: 'عريف'
  });

  assert.equal(values.field_1, 'باسم كمال سليمان');
  assert.equal(values.field_2, 'غياب');
  assert.equal(values.NAME, 'باسم كمال سليمان');
  assert.equal(values.MILITARY_ID, 'M-42');
  assert.equal(values.RANK, 'عريف');
});

test('maps date, duration, reason, and clause fields to common action placeholders', () => {
  const values = createSubmoduleTemplateData({
    data: {
      field_1: 'غياب',
      field_2: '3',
      field_3: '2026-11-13',
      field_4: '8'
    },
    fields: [
      { key: 'field_1', label: 'سبب الإجراء' },
      { key: 'field_2', label: 'مدة الإجراء', type: 'duration' },
      { key: 'field_3', label: 'تاريخ الإجراء', type: 'date' },
      { key: 'field_4', label: 'رقم البند' }
    ]
  });

  assert.equal(values.PENALTY_REASON, 'غياب');
  assert.equal(values.PENALTY_DAYS, '3 يوم');
  assert.equal(values.DATE, '2026-11-13');
  assert.equal(values.CLAUSE_NO, '8');
  assert.equal(values.GENERATED_TEXT, 'تجازى المذكور 3 يوم نظير غياب بتاريخ 2026-11-13 بند رقم 8');
});

test('adds shared placeholders and imported personnel fields to module records', () => {
  const values = createCommonTemplateData({
    full_name: 'فرد تجريبي',
    military_number: 'M-2',
    rank: 'عريف',
    reason: 'إجراء عام',
    action_date: '2026-11-13'
  }, {
    excel_1: 'اسم الأب'
  }, [{ column_key: 'excel_1' }], {
    organization: 'الجهة'
  });

  assert.equal(values.NAME, 'فرد تجريبي');
  assert.equal(values.MILITARY_ID, 'M-2');
  assert.equal(values.RANK, 'عريف');
  assert.equal(values.PENALTY_REASON, 'إجراء عام');
  assert.equal(values.DATE, '2026-11-13');
  assert.equal(values.excel_1, 'اسم الأب');
  assert.equal(values.organization, 'الجهة');
});

test('renders universal section templates with repeated report records', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-section-template-'));
  const templatePath = path.join(directory, 'section.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const template = new Document({
    sections: [{
      children: [
        new Paragraph('تقرير {moduleTitle} - {monthKey}'),
        new Paragraph('إجمالي السجلات: {totalRecords}'),
        new Paragraph('{#records}{full_name} · {military_number}{/records}')
      ]
    }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  const output = await renderWordTemplate(templatePath, {
    moduleTitle: 'قسم الاختبار',
    monthKey: '2026-07',
    totalRecords: 2,
    records: [
      { full_name: 'الفرد الأول', military_number: 'A-1' },
      { full_name: 'الفرد الثاني', military_number: 'A-2' }
    ]
  });
  const documentXml = new PizZip(output).file('word/document.xml').asText();
  assert.match(documentXml, /قسم الاختبار/);
  assert.match(documentXml, /2026-07/);
  assert.match(documentXml, /الفرد الأول/);
  assert.match(documentXml, /الفرد الثاني/);
  assert.doesNotMatch(documentXml, /\{(?:moduleTitle|monthKey|totalRecords|#records|\/records)\}/);
});

test('fills official penalty placeholders and generated decision text', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-penalty-template-'));
  const templatePath = path.join(directory, 'penalty.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const template = new Document({
    sections: [{
      children: [new Paragraph('{NAME} · {MILITARY_ID} · {RANK} · {PENALTY_REASON} · {PENALTY_DAYS} · {DATE} · {CLAUSE_NO} · {GENERATED_TEXT}')]
    }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  const data = createPenaltyTemplateData({
    full_name: 'اسم الفرد',
    military_number: 'P-300',
    rank: 'عريف',
    penalty_type: 'حبس',
    days: 15,
    reason: 'التغيب',
    action_date: '2026-11-09',
    clause_no: '12'
  });
  const output = await renderWordTemplate(templatePath, data);
  const documentXml = new PizZip(output).file('word/document.xml').asText();
  assert.match(documentXml, /اسم الفرد/);
  assert.match(documentXml, /P-300/);
  assert.match(documentXml, /التغيب/);
  assert.match(documentXml, /15 يوم حبس/);
  assert.match(documentXml, /تجازى المذكور 15 يوم حبس نظير التغيب بتاريخ 2026-11-09 بند رقم 12/);
  assert.doesNotMatch(documentXml, /\{(?:NAME|MILITARY_ID|RANK|PENALTY_REASON|PENALTY_DAYS|DATE|CLAUSE_NO|GENERATED_TEXT)\}/);
});

test('does not wrap an already-final action sentence again for Word output', () => {
  const reason = 'تجازى المذكور 4 يوم حبس نظير غياب بتاريخ 2026-11-10 بند رقم 3';
  const data = createPenaltyTemplateData({
    full_name: 'اسم الفرد',
    military_number: 'P-301',
    penalty_type: 'حبس',
    days: 4,
    reason,
    action_date: '2026-11-10',
    clause_no: '3'
  });
  assert.equal(data.PENALTY_REASON, reason);
  assert.equal(data.GENERATED_TEXT, reason);
});

test('exposes empty standard placeholders to any unlinked submodule template', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'finance-generic-template-'));
  const templatePath = path.join(directory, 'generic.docx');
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const template = new Document({
    sections: [{ children: [new Paragraph('{field_1} · {NAME} · {MILITARY_ID} · {PENALTY_REASON} · {GENERATED_TEXT}')] }]
  });
  await fs.writeFile(templatePath, await Packer.toBuffer(template));

  const output = await renderWordTemplate(templatePath, {
    field_1: 'بيانات عامة',
    ...createPenaltyTemplateData({})
  });
  const documentXml = new PizZip(output).file('word/document.xml').asText();
  assert.match(documentXml, /بيانات عامة/);
  assert.doesNotMatch(documentXml, /\{(?:field_1|NAME|MILITARY_ID|PENALTY_REASON|GENERATED_TEXT)\}/);
});

test('builds a smart document from exact imported Excel columns and converts rich HTML to DOCX', async () => {
  const context = buildDocumentTemplateData({
    template: { module_id: 'personnel', submodule_id: '' },
    module: { id: 'personnel', title: 'سجل الأفراد' },
    monthData: {
      monthKey: '2026-11',
      periodRange: { start_date: '2026-11-01', end_date: '2026-11-30' },
      personnel: [{
        full_name: 'فرد تجريبي',
        military_number: 'EXCEL-1',
        rank: 'رقيب',
        category: 'صف ضابط',
        unit: 'الوحدة',
        excel_1: 'أحمد'
      }],
      salaries: [],
      penalties: [],
      supplyOrders: [],
      invoices: [],
      customSections: []
    },
    personnelColumns: [{ column_key: 'excel_1', source_header: 'اسم الأب' }]
  });
  assert.equal(context.excel_1, 'أحمد');
  assert.equal(context.periodStart, '2026-11-01');
  assert.equal(context.periodEnd, '2026-11-30');
  assert.equal(context.periodId, '2026-11');
  assert.match(context.records_table, /اسم الأب/);
  assert.match(context.records_table, /أحمد/);

  const html = renderHtmlDocument(
    '<h1>{full_name}</h1><p>اسم الأب: {excel_1}</p>{records_table}',
    context
  );
  const output = await htmlToDocx(html, null, { lang: 'ar-SA', font: 'Tahoma' });
  const documentXml = new PizZip(output).file('word/document.xml').asText();
  assert.match(documentXml, /فرد تجريبي/);
  assert.match(documentXml, /أحمد/);
  assert.match(documentXml, /اسم الأب/);
  assert.doesNotMatch(documentXml, /\{(?:full_name|excel_1|records_table)\}/);
});

test('builds a penalty document from the linked personnel name and military number', () => {
  const context = buildDocumentTemplateData({
    template: { module_id: 'penalties', submodule_id: '' },
    module: { id: 'penalties', title: 'الجزاءات' },
    monthData: {
      monthKey: '2026-11',
      personnel: [{
        full_name: 'الاسم الحالي',
        military_number: 'P-204',
        rank: 'عريف'
      }],
      penalties: [{
        id: 204,
        full_name: 'اسم قديم',
        military_number: 'P-204',
        penalty_type: 'شطب',
        days: 0,
        reason: 'إجراء تجريبي',
        action_date: '2026-11-12',
        clause_no: '4'
      }],
      customSections: []
    },
    recordId: 204
  });

  assert.equal(context.full_name, 'الاسم الحالي');
  assert.equal(context.military_number, 'P-204');
  assert.equal(context.records.length, 1);
  assert.equal(context.records[0].full_name, 'الاسم الحالي');
  assert.equal(context.reason, 'إجراء تجريبي');
});

test('rejects unknown smart-document placeholders instead of producing an incomplete file', () => {
  assert.throws(
    () => renderHtmlDocument('<p>{unknown_column}</p>', {}),
    /متغيرات غير متاحة/
  );
});

test('makes imported personnel columns available to linked records in any submodule', () => {
  const context = buildDocumentTemplateData({
    template: { module_id: 'accessions', submodule_id: 'accession-form' },
    module: { id: 'accessions', title: 'الضم' },
    monthData: {
      monthKey: '2026-11',
      personnel: [{
        full_name: 'فرد مرتبط',
        military_number: 'LINK-1',
        rank: 'عريف',
        excel_1: 'الأب'
      }],
      customSections: [{
        module_id: 'accessions',
        module_title: 'الضم',
        submodule_id: 'accession-form',
        submodule_title: 'نموذج ضم',
        fields: [{ key: 'field_1', label: 'البيان' }],
        records: [{
          id: 8,
          military_number: 'LINK-1',
          data: { field_1: 'بيانات النموذج', full_name: 'اسم غير محدث' }
        }]
      }]
    },
    personnelColumns: [{ column_key: 'excel_1', source_header: 'اسم الأب' }],
    recordId: 8
  });
  assert.equal(context.full_name, 'فرد مرتبط');
  assert.equal(context.military_number, 'LINK-1');
  assert.equal(context.excel_1, 'الأب');
  assert.equal(context.field_1, 'بيانات النموذج');
  assert.equal(context.records[0].full_name, 'فرد مرتبط');
  assert.match(context.records_table, /اسم الأب/);
});
