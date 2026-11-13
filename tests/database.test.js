const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const PizZip = require('pizzip');
const {
  initializeDatabase,
  importPersonnel,
  listPersonnel,
  listPersonnelColumns,
  updatePersonnelColumnPlaceholder,
  listDocumentTemplates,
  saveDocumentTemplate,
  setDocumentTemplateActive,
  listModules,
  addModule,
  setModuleTemplate,
  addSubmodule,
  setSubmoduleTemplate,
  addSubmoduleRecord,
  addSubmoduleRecords,
  listSubmoduleRecords,
  getSubmoduleRecord,
  archiveMonth,
  getFinancialPeriod,
  setFinancialPeriodRange,
  getActiveFinancialPeriodKey,
  activateFinancialPeriod,
  isFinancialPeriodLocked,
  unlockFinancialPeriod,
  getApplicationSetting,
  setApplicationSetting,
  getArchive,
  getArchiveRevision,
  listArchiveRevisions,
  listArchiveAudit,
  copyArchiveToMonth,
  addPenalty,
  listDropdownOptions,
  addActionTypeOption,
  updateDropdownOption,
  setDropdownOptionActive,
  reorderDropdownOptions,
  upsertMonthlySalary,
  listInvoiceCompanies,
  listTextTemplates,
  addTextTemplate,
  updateTextTemplate,
  archiveTextTemplate,
  addInvoiceCompany,
  updateInvoiceCompany,
  addInvoiceProduct,
  saveInvoice,
  getMonthData,
  listArchives,
  listMonthlySalaries
} = require('../src/database/database');
const { createInvoiceDocument } = require('../src/services/invoiceDocument');

test('manages independent section options and preserves action identities on rename', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-dropdown-options-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const options = listDropdownOptions(database);
  const penaltyType = options.find((option) => option.group_id === 'action_type'
    && option.scope_id === 'penalties' && option.label === 'حبس');
  const accessionType = options.find((option) => option.group_id === 'action_type'
    && option.scope_id === 'accessions' && option.label === 'حبس');
  assert.ok(penaltyType);
  assert.ok(accessionType);
  assert.notEqual(penaltyType.option_value, accessionType.option_value);

  const added = addActionTypeOption(database, { moduleId: 'penalties', label: 'تنبيه كتابي' });
  assert.ok(added.some((option) => option.scope_id === 'penalties' && option.label === 'تنبيه كتابي'));
  assert.ok(!added.some((option) => option.scope_id === 'accessions' && option.label === 'تنبيه كتابي'));

  importPersonnel(database, [{
    military_number: 'DROPDOWN-1',
    full_name: 'فرد اختبار القائمة',
    rank: 'جندي',
    category: 'جندي',
    unit: 'الوحدة',
    notes: ''
  }]);
  const monthKey = getActiveFinancialPeriodKey(database);
  const directInsert = database.sqlite.prepare(`
    INSERT INTO penalties (military_number, penalty_type, action_date, clause_no, period_key)
    VALUES (?, ?, ?, ?, ?)
  `);
  assert.throws(() => directInsert.run([
    'DROPDOWN-1', penaltyType.option_value, `${monthKey}-01`, '', monthKey
  ]), /رقم بند الأمر مطلوب/);
  directInsert.free();
  assert.throws(() => addPenalty(database, {
    monthKey,
    militaryNumber: 'DROPDOWN-1',
    penaltyType: penaltyType.option_value,
    days: 1,
    reason: 'سبب الاختبار',
    actionDate: `${monthKey}-01`,
    clauseNo: ''
  }), /رقم بند الأمر مطلوب/);
  addPenalty(database, {
    monthKey,
    militaryNumber: 'DROPDOWN-1',
    penaltyType: penaltyType.option_value,
    days: 1,
    reason: 'سبب الاختبار',
    actionDate: `${monthKey}-01`,
    clauseNo: 'بند 10'
  });
  updateDropdownOption(database, { optionId: penaltyType.option_id, label: 'توقيف' });
  const saved = getMonthData(database, monthKey).penalties[0];
  assert.equal(saved.penalty_type, 'توقيف');
  assert.equal(saved.penalty_type_id, penaltyType.option_value);
  assert.equal(database.sqlite.exec('SELECT penalty_type FROM penalties')[0].values[0][0], penaltyType.option_value);
  assert.equal(listDropdownOptions(database).find((option) => option.option_id === accessionType.option_id).label, 'حبس');

  const fieldTypes = listDropdownOptions(database).filter((option) => option.group_id === 'field_type');
  const fieldType = fieldTypes.find((option) => option.option_value === 'text');
  updateDropdownOption(database, { optionId: fieldType.option_id, label: 'نص حر' });
  setDropdownOptionActive(database, { optionId: fieldType.option_id, isActive: false });
  assert.equal(listDropdownOptions(database).find((option) => option.option_id === fieldType.option_id).option_value, 'text');
  assert.equal(listDropdownOptions(database).find((option) => option.option_id === fieldType.option_id).is_active, 0);
  setDropdownOptionActive(database, { optionId: fieldType.option_id, isActive: true });
  const reordered = [...fieldTypes].reverse().map((option) => option.option_id);
  reorderDropdownOptions(database, { groupId: 'field_type', optionIds: reordered });
  assert.equal(listDropdownOptions(database).filter((option) => option.group_id === 'field_type')[0].option_id, reordered[0]);
});

test('allows person fields to filter by any imported personnel category', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-custom-person-category-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  importPersonnel(database, [{
    military_number: 'CUSTOM-CATEGORY-1',
    full_name: 'فرد بفئة مخصصة',
    rank: 'جندي',
    category: 'فئة تشغيلية جديدة',
    unit: 'الوحدة',
    notes: ''
  }]);
  addModule(database, { id: 'category-module', title: 'قسم الفئات' });
  addSubmodule(database, {
    id: 'category-submodule',
    moduleId: 'category-module',
    title: 'نموذج حسب الفئة',
    fields: [{
      key: 'person',
      label: 'الفرد',
      type: 'person',
      personCategory: 'فئة تشغيلية جديدة'
    }]
  });
  const monthKey = getActiveFinancialPeriodKey(database);
  const recordId = addSubmoduleRecord(database, {
    submoduleId: 'category-submodule',
    data: { person: 'CUSTOM-CATEGORY-1' },
    monthKey,
    clauseNo: 'بند 1'
  });
  assert.equal(listSubmoduleRecords(database, 'category-submodule', monthKey)[0].id, recordId);
});

test('seeds the invoice catalog and saves invoices with server-calculated VAT', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-invoices-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const companies = listInvoiceCompanies(database);
  assert.equal(companies.length, 20);
  assert.equal(companies.reduce((count, company) => count + company.products.length, 0), 80);

  const monthKey = '2026-03';
  const product = companies[0].products[0];
  const invoice = saveInvoice(database, {
    invoiceNumber: 'INV-2026-001',
    companyCode: companies[0].code,
    invoiceDate: `${monthKey}-15`,
    monthKey,
    documentType: 'quotation',
    items: [{ productCode: product.code, unitPrice: 99.75, quantity: 2 }]
  });

  assert.equal(invoice.document_type, 'quotation');
  assert.equal(invoice.items[0].unit_price, 99.75);
  assert.equal(invoice.subtotal, 199.5);
  assert.equal(invoice.vat_rate, 0.14);
  assert.equal(invoice.vat_amount, 27.93);
  assert.equal(invoice.grand_total, invoice.subtotal + invoice.vat_amount);
  assert.equal(getMonthData(database, monthKey).invoices.length, 1);
  assert.equal(getMonthData(database, monthKey).invoices[0].items.length, 1);

  archiveMonth(database, monthKey);
  assert.equal(getArchive(database, monthKey).snapshot.invoices.length, 1);
  assert.equal(getArchive(database, monthKey).snapshot.invoices[0].document_type, 'quotation');
  const copiedData = copyArchiveToMonth(database, monthKey, '2026-04');
  assert.equal(copiedData.invoices.length, 1);
  assert.equal(copiedData.invoices[0].items[0].product_code, product.code);
  assert.equal(copiedData.invoices[0].document_type, 'quotation');
  assert.throws(() => saveInvoice(database, {
    invoiceNumber: 'INV-2026-002',
    companyCode: companies[0].code,
    invoiceDate: `${monthKey}-20`,
    monthKey,
    items: [{ productCode: product.code, quantity: 1 }]
  }), /الفترة المالية مقفلة/);
  assert.throws(() => saveInvoice(database, {
    invoiceNumber: 'INVALID-TYPE',
    companyCode: companies[0].code,
    invoiceDate: '2026-05-20',
    monthKey: '2026-05',
    documentType: 'unknown',
    items: [{ productCode: product.code, quantity: 1 }]
  }), /نوع المستند/);
});

test('rejects invalid per-invoice unit prices', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-invoice-price-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const company = listInvoiceCompanies(database)[0];
  assert.throws(() => saveInvoice(database, {
    invoiceNumber: 'INVALID-PRICE',
    companyCode: company.code,
    invoiceDate: '2026-03-20',
    monthKey: '2026-03',
    items: [{ productCode: company.products[0].code, unitPrice: -1, quantity: 1 }]
  }), /سعر الوحدة/);
});

test('stores custom invoice companies, header layout, and independent invoice templates', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-custom-invoice-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const company = addInvoiceCompany(database, {
    name: 'شركة اختبار خاصة',
    category: 'توريدات عامة',
    commercialRegister: 'CR-123',
    taxCard: 'TX-456',
    address: 'عنوان تجريبي',
    phone: '01000000000'
  });
  const updatedCompany = updateInvoiceCompany(database, {
    code: company.code,
    name: company.name,
    category: company.category,
    commercialRegister: 'CR-UPDATED',
    taxCard: company.tax_card,
    address: company.address,
    phone: company.phone
  });
  const withProduct = addInvoiceProduct(database, {
    companyCode: company.code,
    description: 'صنف خاص',
    unit: 'علبة',
    unitPrice: 125.5
  });
  assert.equal(updatedCompany.commercial_register, 'CR-UPDATED');
  assert.equal(withProduct.products.length, 1);

  const headerFields = [
    { id: 'tax', label: 'البطاقة الضريبية', value: 'TX-456' },
    { id: 'phone', label: 'الهاتف', value: '01000000000' }
  ];
  const invoice = saveInvoice(database, {
    invoiceNumber: 'CUSTOM-1',
    companyCode: company.code,
    supplierName: 'مورد حر لهذه الفاتورة',
    invoiceDate: '2026-03-20',
    monthKey: '2026-03',
    templateId: 'framed',
    documentType: 'quotation',
    headerFields,
    layout: [
      { type: 'field', id: 'phone' },
      { type: 'divider', id: 'divider-one' },
      { type: 'field', id: 'tax' }
    ],
    items: [{ productCode: withProduct.products[0].code, quantity: 3 }]
  });
  assert.equal(invoice.company.commercial_register, 'CR-UPDATED');
  assert.equal(invoice.company.name, 'مورد حر لهذه الفاتورة');
  assert.equal(invoice.company_name, 'مورد حر لهذه الفاتورة');
  assert.equal(invoice.template_id, 'framed');
  assert.equal(invoice.document_type, 'quotation');
  assert.deepEqual(invoice.layout.map((block) => block.id), ['phone', 'divider-one', 'tax']);
  const docx = await createInvoiceDocument(invoice);
  assert.ok(docx.length > 1000);
  assert.equal(docx.subarray(0, 2).toString(), 'PK');
  assert.match(new PizZip(docx).file('word/document.xml').asText(), /بيان أسعار/);

  const defaultInvoice = saveInvoice(database, {
    invoiceNumber: 'CUSTOM-2',
    companyCode: company.code,
    invoiceDate: '2026-03-21',
    monthKey: '2026-03',
    items: [{ productCode: withProduct.products[0].code, quantity: 1 }]
  });
  assert.equal(defaultInvoice.document_type, 'invoice');
  const defaultDocx = await createInvoiceDocument(defaultInvoice);
  assert.match(new PizZip(defaultDocx).file('word/document.xml').asText(), /فاتورة إلكترونية/);

  const refreshed = updateInvoiceCompany(database, {
    code: company.code,
    name: company.name,
    category: company.category,
    commercialRegister: 'CR-NEW',
    taxCard: company.tax_card,
    address: company.address,
    phone: company.phone
  });
  assert.equal(refreshed.commercial_register, 'CR-NEW');
  assert.equal(getMonthData(database, '2026-03').invoices[0].company.commercial_register, 'CR-UPDATED');
});

test('persists imported personnel and updates the same military number', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-system-'));
  const databasePath = path.join(directory, 'finance_system.db');
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const database = await initializeDatabase(databasePath);
  importPersonnel(database, [{
    military_number: '1001',
    full_name: 'اسم تجريبي',
    rank: 'جندي',
    category: 'مدني',
    unit: 'الوحدة',
    notes: ''
  }]);
  importPersonnel(database, [{
    military_number: '1001',
    full_name: 'اسم محدث',
    rank: 'عريف',
    category: 'تصنيف جديد',
    unit: 'الوحدة',
    notes: ''
  }]);
  assert.equal(fs.readFileSync(databasePath).subarray(0, 15).toString(), 'SQLite format 3');
  database.close();

  const reopened = await initializeDatabase(databasePath);
  assert.equal(listPersonnel(reopened).length, 1);
  assert.equal(listPersonnel(reopened)[0].full_name, 'اسم محدث');
  assert.equal(listPersonnel(reopened)[0].category, 'تصنيف جديد');
  reopened.close();
});

test('upserts a new spreadsheet without deleting omitted personnel or their history', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-import-upsert-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    if (database.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const monthKey = getActiveFinancialPeriodKey(database);
  importPersonnel(database, [
    {
      military_number: 'IMPORT-A',
      full_name: 'اسم قديم',
      rank: 'جندي',
      category: 'جندي',
      unit: 'الوحدة',
      notes: '',
      sourceData: { 'اسم الأب القديم': 'والد قديم', 'حقل متروك': 'قيمة قديمة' }
    },
    {
      military_number: 'IMPORT-B',
      full_name: 'فرد غير موجود في الشيت الجديد',
      rank: 'عريف',
      category: 'صف ضابط',
      unit: 'الوحدة',
      notes: '',
      sourceData: { 'اسم الأب القديم': 'والد محفوظ' }
    }
  ], undefined, [{ name: 'اسم الأب القديم' }, { name: 'حقل متروك' }]);
  importPersonnel(database, [], undefined, [{ name: 'عنوان من ملف فارغ' }]);
  assert.deepEqual(
    listPersonnelColumns(database).map((column) => column.source_header),
    ['اسم الأب القديم', 'حقل متروك']
  );
  addModule(database, { id: 'import-history-module', title: 'قسم تاريخ الاستيراد' });
  addSubmodule(database, {
    id: 'import-history-submodule',
    moduleId: 'import-history-module',
    title: 'سجلات تاريخية',
    fields: [{ key: 'field_1', label: 'البيان' }]
  });
  addSubmoduleRecord(database, {
    submoduleId: 'import-history-submodule',
    data: { field_1: 'سجل محفوظ' },
    monthKey,
    clauseNo: 'بند 1',
    militaryNumber: 'IMPORT-B'
  });
  upsertMonthlySalary(database, {
    monthKey,
    militaryNumber: 'IMPORT-B',
    baseSalary: 3000,
    allowances: 250
  });
  database.sqlite.run(`
    INSERT INTO penalties (military_number, penalty_type, period_key, clause_no)
    VALUES ('IMPORT-B', 'حبس', '${monthKey}', 'بند 1')
  `);

  importPersonnel(database, [
    {
      military_number: 'IMPORT-A',
      full_name: 'اسم محدث',
      rank: 'رقيب',
      category: 'فئة جديدة',
      unit: 'وحدة جديدة',
      notes: '',
      sourceData: { 'رقم الأب الجديد': '123' }
    },
    {
      military_number: 'IMPORT-C',
      full_name: 'فرد جديد',
      rank: 'جندي',
      category: 'جندي',
      unit: 'وحدة جديدة',
      notes: '',
      sourceData: { 'رقم الأب الجديد': '456' }
    }
  ], undefined, [{ name: 'رقم الأب الجديد' }]);

  const people = listPersonnel(database);
  assert.deepEqual(people.map((person) => person.military_number).sort(), ['IMPORT-A', 'IMPORT-B', 'IMPORT-C']);
  const updatedPerson = people.find((person) => person.military_number === 'IMPORT-A');
  assert.equal(updatedPerson.full_name, 'اسم محدث');
  assert.deepEqual(updatedPerson.source_data, { 'رقم الأب الجديد': '123' });
  assert.deepEqual(listPersonnelColumns(database).map((column) => column.source_header), ['رقم الأب الجديد']);
  assert.equal(listPersonnelColumns(database)[0].column_key, 'excel_3');
  assert.equal(database.sqlite.exec("SELECT COUNT(*) FROM salaries_base WHERE military_number = 'IMPORT-B'")[0].values[0][0], 1);
  assert.equal(database.sqlite.exec("SELECT COUNT(*) FROM penalties WHERE military_number = 'IMPORT-B'")[0].values[0][0], 1);
  assert.equal(database.sqlite.exec("SELECT COUNT(*) FROM submodule_records WHERE military_number = 'IMPORT-B'")[0].values[0][0], 1);
  assert.equal(listSubmoduleRecords(database, 'import-history-submodule', monthKey)[0].data.field_1, 'سجل محفوظ');
});

test('removes the legacy personnel category constraint without breaking linked records', async (context) => {
  const initializeSqlJs = require('sql.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-personnel-category-migration-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database;
  context.after(() => {
    if (database?.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const SQL = await initializeSqlJs({
    locateFile: (filename) => require.resolve(`sql.js/dist/${filename}`)
  });
  const legacy = new SQL.Database();
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE personnel (
      military_number TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      rank TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL CHECK (category IN ('ضابط', 'صف ضابط', 'جندي')),
      unit TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      source_data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO personnel (military_number, full_name, category)
      VALUES ('OLD-100', 'فرد سابق', 'جندي');
    CREATE TABLE submodule_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submodule_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      military_number TEXT REFERENCES personnel(military_number) ON DELETE SET NULL
    );
    INSERT INTO submodule_records (submodule_id, data_json, military_number)
      VALUES ('legacy-section', '{}', 'OLD-100');
  `);
  fs.writeFileSync(databasePath, Buffer.from(legacy.export()));
  legacy.close();

  database = await initializeDatabase(databasePath);
  assert.equal(listPersonnel(database)[0].category, 'جندي');
  importPersonnel(database, [{
    military_number: 'NEW-100',
    full_name: 'فرد بتصنيف حر',
    category: 'موظف مدني',
    rank: '',
    unit: '',
    notes: ''
  }]);
  assert.equal(listPersonnel(database).find((person) => person.military_number === 'NEW-100').category, 'موظف مدني');
  assert.equal(database.sqlite.exec(`
    SELECT military_number FROM submodule_records WHERE submodule_id = 'legacy-section'
  `)[0].values[0][0], 'OLD-100');
  assert.deepEqual(database.sqlite.exec('PRAGMA foreign_key_check'), []);
});

test('stores exact imported Excel headings and their reusable placeholder values', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-personnel-columns-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database = await initializeDatabase(databasePath);
  context.after(() => {
    if (database?.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  importPersonnel(database, [{
    military_number: 'LEGACY-EXCEL',
    full_name: 'اسم قديم',
    rank: 'جندي',
    category: 'جندي',
    unit: 'الوحدة',
    notes: ''
  }]);

  importPersonnel(database, [{
    military_number: 'EXCEL-1',
    full_name: 'فرد تجريبي',
    rank: 'رقيب',
    category: 'صف ضابط',
    unit: 'الوحدة',
    notes: '',
    sourceData: { 'الاسم الكامل': 'فرد تجريبي', 'اسم الأب': 'أحمد', 'محل الميلاد': 'القاهرة' }
  }], undefined, [
    { name: 'الاسم الكامل', field: 'full_name' },
    { name: 'اسم الأب' },
    { name: 'محل الميلاد' }
  ]);
  let columns = listPersonnelColumns(database);
  assert.deepEqual(columns.map((column) => column.source_header), ['الاسم الكامل', 'اسم الأب', 'محل الميلاد']);
  assert.equal(columns[1].placeholder_label, 'اسم الأب');
  updatePersonnelColumnPlaceholder(database, columns[1].column_key, 'اسم الأب (متغير)');
  columns = listPersonnelColumns(database);
  assert.equal(columns[1].placeholder_label, 'اسم الأب (متغير)');

  const person = listPersonnel(database).find((item) => item.military_number === 'EXCEL-1');
  assert.equal(person[columns[1].column_key], 'أحمد');
  assert.equal(person.source_data['محل الميلاد'], 'القاهرة');
  const legacyPerson = listPersonnel(database).find((item) => item.military_number === 'LEGACY-EXCEL');
  assert.equal(legacyPerson[columns[0].column_key], 'اسم قديم');
  database.close();

  database = await initializeDatabase(databasePath);
  const reopened = database;
  const savedPerson = listPersonnel(reopened).find((item) => item.military_number === 'EXCEL-1');
  assert.equal(savedPerson[columns[1].column_key], 'أحمد');
  assert.equal(listPersonnelColumns(reopened)[1].source_header, 'اسم الأب');
});

test('stores document templates with a main and optional submodule binding', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-document-templates-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  addModule(database, { id: 'document-module', title: 'قسم المستندات' });
  addSubmodule(database, {
    id: 'document-submodule',
    moduleId: 'document-module',
    title: 'النموذج المرتبط',
    fields: [{ key: 'field_1', label: 'البيان' }]
  });
  const saved = saveDocumentTemplate(database, {
    moduleId: 'document-module',
    submoduleId: 'document-submodule',
    title: 'قالب مرتبط',
    contentHtml: '<p>{field_1}</p>'
  });
  assert.equal(saved.module_id, 'document-module');
  assert.equal(saved.submodule_id, 'document-submodule');
  assert.equal(listDocumentTemplates(database, { includeArchived: false }).length, 1);
  setDocumentTemplateActive(database, saved.id, false);
  assert.equal(listDocumentTemplates(database, { includeArchived: false }).length, 0);
});

test('persists dynamic modules, submodules, template paths, and records', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-modules-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const builtIn = listModules(database).find((module) => module.id === 'penalties');
  assert.deepEqual(builtIn.submodules, []);
  assert.equal(listModules(database).find((module) => module.id === 'salaries').title, 'الماهيات');

  addModule(database, { id: 'custom-test', title: 'قسم تجريبي' });
  setModuleTemplate(database, 'custom-test', 'C:\\templates\\module.docx');
  addSubmodule(database, {
    id: 'sub-test',
    moduleId: 'custom-test',
    title: 'نموذج تجريبي',
    fields: [{ key: 'field_1', label: 'البيان' }]
  });
  setSubmoduleTemplate(database, 'sub-test', 'C:\\templates\\sample.docx');
  const recordId = addSubmoduleRecord(database, {
    submoduleId: 'sub-test',
    data: { field_1: 'قيمة' },
    monthKey: '2026-07',
    clauseNo: 'بند 1'
  });
  addSubmodule(database, {
    id: 'sub-test-default-template',
    moduleId: 'custom-test',
    title: 'نموذج موروث',
    fields: [{ key: 'field_1', label: 'البيان' }]
  });
  const inheritedTemplateRecordId = addSubmoduleRecord(database, {
    submoduleId: 'sub-test-default-template',
    data: { field_1: 'قيمة موروثة' },
    monthKey: '2026-07',
    clauseNo: 'بند 2'
  });

  assert.equal(listModules(database).find((module) => module.id === 'custom-test').submodules[0].template_path, 'C:\\templates\\sample.docx');
  assert.equal(listModules(database).find((module) => module.id === 'custom-test').template_path, 'C:\\templates\\module.docx');
  assert.equal(getSubmoduleRecord(database, inheritedTemplateRecordId).templatePath, 'C:\\templates\\module.docx');
  assert.equal(listSubmoduleRecords(database, 'sub-test', '2026-07')[0].data.field_1, 'قيمة');
  assert.equal(getSubmoduleRecord(database, recordId).title, 'نموذج تجريبي');
  const allPeriodData = getMonthData(database, '2026-07');
  assert.ok(allPeriodData.customSections.some((section) => section.submodule_title === 'نموذج تجريبي'));
  assert.equal(
    allPeriodData.customSections.find((section) => section.submodule_id === 'sub-test').records[0].data.field_1,
    'قيمة'
  );
  const archive = archiveMonth(database, '2026-07');
  assert.equal(archive.snapshot.customSections.length, 2);
  assert.equal(archive.snapshot.customSections.find((section) => section.submodule_id === 'sub-test').records.length, 1);
});

test('persists and switches the active financial period, rejecting locked periods', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-active-period-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database = await initializeDatabase(databasePath);
  context.after(() => {
    if (database.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const period = activateFinancialPeriod(database, '2026-07');
  assert.equal(period.month_key, '2026-07');
  assert.equal(getActiveFinancialPeriodKey(database), '2026-07');
  assert.equal(database.sqlite.exec(`
    SELECT COUNT(*) FROM financial_periods WHERE month_key = '2026-07'
  `)[0].values[0][0], 1);

  database.close();
  database = await initializeDatabase(databasePath);
  assert.equal(getActiveFinancialPeriodKey(database), '2026-07');
  archiveMonth(database, '2026-07');
  assert.throws(() => activateFinancialPeriod(database, '2026-07'), /مقفلة/);
  unlockFinancialPeriod(database, '2026-07');
  activateFinancialPeriod(database, '2026-07');
  assert.equal(getActiveFinancialPeriodKey(database), '2026-07');
});

test('links generic submodule action records to personnel and carries the link into archives', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-linked-action-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  importPersonnel(database, [{
    military_number: 'LINK-1',
    full_name: 'فرد مرتبط',
    rank: 'عريف',
    category: 'صف ضابط',
    unit: 'الوحدة',
    notes: ''
  }]);
  addSubmodule(database, {
    id: 'linked-action',
    moduleId: 'penalties',
    title: 'نموذج إجراء عام',
    fields: [{ key: 'reference', label: 'المرجع' }]
  });
  assert.throws(() => addSubmoduleRecord(database, {
    submoduleId: 'linked-action',
    monthKey: '2026-11',
    data: { reference: 'مرجع غير صالح' },
    action: {
      militaryNumber: 'MISSING',
      penaltyType: 'قطع',
      days: 2,
      reason: 'إهمال',
      actionDate: '2026-11-08',
      clauseNo: '7'
    }
  }), /غير موجود/);
  addSubmoduleRecord(database, {
    submoduleId: 'linked-action',
    monthKey: '2026-11',
    data: { reference: 'مرجع 7' },
    action: {
      militaryNumber: 'LINK-1',
      penaltyType: 'قطع',
      days: 2,
      reason: 'إهمال',
      actionDate: '2026-11-08',
      clauseNo: '7'
    }
  });
  const saved = listSubmoduleRecords(database, 'linked-action', '2026-11')[0];
  assert.equal(saved.military_number, 'LINK-1');
  assert.equal(saved.full_name, 'فرد مرتبط');
  assert.equal(saved.rank, 'عريف');
  assert.equal(saved.action_reason, 'إهمال');
  assert.equal(saved.action_days, 2);
  assert.deepEqual(database.sqlite.exec('PRAGMA foreign_key_check'), []);
  const archive = archiveMonth(database, '2026-11');
  const archived = archive.snapshot.submoduleRecords.find((row) => row.id === saved.id);
  assert.equal(archived.military_number, 'LINK-1');
  assert.equal(archived.action_date, '2026-11-08');
  copyArchiveToMonth(database, '2026-11', '2026-12');
  const copied = listSubmoduleRecords(database, 'linked-action', '2026-12')[0];
  assert.equal(copied.military_number, 'LINK-1');
  assert.equal(copied.action_reason, 'إهمال');
});

test('persists institution branding settings in the application database', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-settings-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database = await initializeDatabase(databasePath);
  context.after(() => {
    if (database.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  setApplicationSetting(database, 'institution_logo_path', 'C:\\finance\\branding\\logo.png');
  database.close();
  database = await initializeDatabase(databasePath);

  assert.equal(
    getApplicationSetting(database, 'institution_logo_path'),
    'C:\\finance\\branding\\logo.png'
  );
  assert.throws(() => setApplicationSetting(database, 'invalid key', 'value'), /غير صالح/);
});

test('stores person penalties with reasons, dates, clauses, and archive protection', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-penalties-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  importPersonnel(database, [{
    military_number: 'P-100',
    full_name: 'فرد الجزاء',
    rank: 'جندي',
    category: 'جندي',
    unit: 'الوحدة',
    notes: ''
  }]);

  const result = addPenalty(database, {
    monthKey: '2026-11',
    militaryNumber: 'P-100',
    penaltyType: 'حبس',
    days: 15,
    reason: 'التغيب عن النوبة',
    actionDate: '2026-11-09',
    clauseNo: 'أمر 12'
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].full_name, 'فرد الجزاء');
  assert.equal(result[0].reason, 'التغيب عن النوبة');
  assert.equal(result[0].action_date, '2026-11-09');
  assert.equal(result[0].clause_no, 'أمر 12');
  assert.throws(() => addPenalty(database, {
    monthKey: '2026-11',
    militaryNumber: 'P-100',
    penaltyType: 'حبس',
    days: 1,
    reason: 'غياب',
    actionDate: '2026-10-31',
    clauseNo: ''
  }), /ضمن الشهر/);

  const archive = archiveMonth(database, '2026-11');
  assert.equal(archive.snapshot.penalties[0].reason, 'التغيب عن النوبة');
  assert.equal(archive.snapshot.penalties[0].action_date, '2026-11-09');
  copyArchiveToMonth(database, '2026-11', '2026-12');
  const copied = getMonthData(database, '2026-12').penalties[0];
  assert.equal(copied.reason, 'التغيب عن النوبة');
  assert.equal(copied.clause_no, 'أمر 12');
  assert.throws(() => addPenalty(database, {
    monthKey: '2026-11',
    militaryNumber: 'P-100',
    penaltyType: 'قطع',
    days: 2,
    reason: 'سبب آخر',
    actionDate: '2026-11-10',
    clauseNo: ''
  }), /مقفلة/);
});

test('migrates the text library without losing existing penalties and keeps saved text immutable', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-text-template-migration-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database = await initializeDatabase(databasePath);
  context.after(() => {
    if (database?.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  importPersonnel(database, [{
    military_number: 'P-TEMPLATE',
    full_name: 'فرد محفوظ',
    rank: 'جندي',
    category: 'جندي',
    unit: 'الوحدة',
    notes: ''
  }]);
  addPenalty(database, {
    monthKey: '2026-11',
    militaryNumber: 'P-TEMPLATE',
    penaltyType: 'حبس',
    days: 2,
    reason: 'النص النهائي المحفوظ قبل تعديل المكتبة',
    actionDate: '2026-11-10',
    clauseNo: 'قديم'
  });
  database.sqlite.exec('DROP TABLE text_templates');
  database.close();

  database = await initializeDatabase(databasePath);
  assert.equal(
    getMonthData(database, '2026-11').penalties[0].reason,
    'النص النهائي المحفوظ قبل تعديل المكتبة'
  );
  assert.deepEqual(listTextTemplates(database), []);

  const customTemplate = addTextTemplate(database, {
    scope: 'penalties',
    kind: 'حبس',
    title: 'نص اختبار',
    body: 'نص {الاسم}',
    requiresDays: 0,
    sortOrder: 20
  });
  const updatedTemplate = updateTextTemplate(database, {
    ...customTemplate,
    body: 'نص معدل {الاسم}',
    sortOrder: 10
  });
  assert.equal(updatedTemplate.body, 'نص معدل {الاسم}');
  assert.equal(archiveTextTemplate(database, customTemplate.id).is_active, 0);
  assert.equal(
    getMonthData(database, '2026-11').penalties[0].reason,
    'النص النهائي المحفوظ قبل تعديل المكتبة'
  );
});

test('migrates legacy penalty type constraint without losing existing rows', async (context) => {
  const initializeSqlJs = require('sql.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-penalty-migration-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database;
  context.after(() => {
    if (database?.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const SQL = await initializeSqlJs({
    locateFile: (filename) => require.resolve(`sql.js/dist/${filename}`)
  });
  const legacy = new SQL.Database();
  legacy.exec(`
    CREATE TABLE personnel (
      military_number TEXT PRIMARY KEY, full_name TEXT NOT NULL, rank TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE penalties (
      id INTEGER PRIMARY KEY AUTOINCREMENT, military_number TEXT NOT NULL,
      penalty_type TEXT NOT NULL CHECK (penalty_type IN ('حبس', 'قطع', 'إهمال')),
      days INTEGER NOT NULL DEFAULT 0, deduction_amount REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      period_key TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (military_number) REFERENCES personnel(military_number) ON DELETE CASCADE
    );
    INSERT INTO personnel (military_number, full_name, category) VALUES ('P-200', 'قديم', 'جندي');
    INSERT INTO penalties (military_number, penalty_type, days, notes, period_key)
      VALUES ('P-200', 'قطع', 3, 'بيانات سابقة', '2026-11');
  `);
  fs.writeFileSync(databasePath, Buffer.from(legacy.export()));
  legacy.close();

  database = await initializeDatabase(databasePath);
  const migrated = getMonthData(database, '2026-11').penalties[0];
  assert.equal(migrated.penalty_type, 'قطع');
  assert.equal(migrated.reason, 'بيانات سابقة');
  assert.equal(migrated.notes, 'بيانات سابقة');
  addPenalty(database, {
    monthKey: '2026-11',
    militaryNumber: 'P-200',
    penaltyType: 'إهمال',
    days: 1,
    reason: 'سبب حر غير موجود ضمن القائمة',
    actionDate: '2026-11-08',
    clauseNo: 'بند 11'
  });
  assert.equal(getMonthData(database, '2026-11').penalties.length, 2);
  archiveMonth(database, '2026-11');
  assert.throws(() => database.sqlite.run(`
    UPDATE penalties SET reason = 'تعديل ممنوع' WHERE military_number = 'P-200'
  `), /مقفلة/);
});

test('migrates legacy generic submodule records with person and action columns', async (context) => {
  const initializeSqlJs = require('sql.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-submodule-migration-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database;
  context.after(() => {
    if (database?.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const SQL = await initializeSqlJs({
    locateFile: (filename) => require.resolve(`sql.js/dist/${filename}`)
  });
  const legacy = new SQL.Database();
  legacy.exec(`
    CREATE TABLE personnel (
      military_number TEXT PRIMARY KEY, full_name TEXT NOT NULL, rank TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL, unit TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE custom_modules (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '▦',
      is_builtin INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE custom_submodules (
      id TEXT PRIMARY KEY, module_id TEXT NOT NULL, title TEXT NOT NULL,
      fields_json TEXT NOT NULL DEFAULT '[]', template_path TEXT, sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE submodule_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, submodule_id TEXT NOT NULL,
      data_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO custom_modules (id, title) VALUES ('legacy-module', 'قسم قديم');
    INSERT INTO custom_submodules (id, module_id, title, fields_json)
      VALUES ('legacy-sub', 'legacy-module', 'نموذج قديم', '[{"key":"field_1","label":"البيان"}]');
    INSERT INTO submodule_records (submodule_id, data_json)
      VALUES ('legacy-sub', '{"field_1":"قيمة سابقة"}');
  `);
  fs.writeFileSync(databasePath, Buffer.from(legacy.export()));
  legacy.close();

  database = await initializeDatabase(databasePath);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const migrated = listSubmoduleRecords(database, 'legacy-sub', currentMonth);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].data.field_1, 'قيمة سابقة');
  assert.equal(migrated[0].military_number, null);
  assert.deepEqual(database.sqlite.exec('PRAGMA foreign_key_check'), []);
  const columns = database.sqlite.exec('PRAGMA table_info(submodule_records)')[0].values.map((row) => row[1]);
  assert.ok(columns.includes('action_reason'));
  assert.ok(columns.includes('military_number'));
});

test('configures a period range, locks all month data, and copies an immutable snapshot once', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-archive-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  importPersonnel(database, [{
    military_number: '2001',
    full_name: 'فرد الأرشيف',
    rank: 'جندي',
    category: 'جندي',
    unit: 'الوحدة',
    notes: ''
  }]);
  const defaultPeriod = getFinancialPeriod(database, '2026-07');
  assert.equal(defaultPeriod.start_date, '2026-07-01');
  assert.equal(defaultPeriod.end_date, '2026-07-31');
  const configuredPeriod = setFinancialPeriodRange(database, {
    monthKey: '2026-07',
    startDate: '2026-06-25',
    endDate: '2026-07-24'
  });
  assert.equal(configuredPeriod.start_date, '2026-06-25');
  assert.throws(() => setFinancialPeriodRange(database, {
    monthKey: '2026-07',
    startDate: '2026-07-25',
    endDate: '2026-07-24'
  }), /يساويه/);
  addSubmodule(database, {
    id: 'archive-sub',
    moduleId: 'penalties',
    title: 'نموذج أرشيف',
    fields: [{ key: 'field_1', label: 'البيان' }]
  });
  addSubmoduleRecord(database, {
    submoduleId: 'archive-sub',
    data: { field_1: 'سجل يوليو' },
    monthKey: '2026-07',
    clauseNo: 'بند 1'
  });
  upsertMonthlySalary(database, {
    monthKey: '2026-07',
    militaryNumber: '2001',
    baseSalary: 5000,
    allowances: 250
  });
  const penalty = database.sqlite.prepare(`
    INSERT INTO penalties (military_number, penalty_type, days, deduction_amount, clause_no, notes, period_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  penalty.run(['2001', 'قطع', 1, 100, 'بند 2', 'ملاحظة', '2026-07']);
  penalty.free();
  const order = database.sqlite.prepare(`
    INSERT INTO supply_orders (order_number, order_date, supplier, description, amount, period_key)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  order.run(['توريد-1', '2026-07-15', 'مورد', 'وصف', 700, '2026-07']);
  order.free();

  const firstArchive = archiveMonth(database, '2026-07');
  assert.deepEqual(firstArchive.snapshot.periodRange, {
    start_date: '2026-06-25',
    end_date: '2026-07-24'
  });
  assert.equal(firstArchive.snapshot.submoduleRecords.length, 1);
  assert.equal(firstArchive.snapshot.salaries.length, 1);
  assert.equal(firstArchive.snapshot.penalties.length, 1);
  assert.equal(firstArchive.snapshot.supplyOrders.length, 1);
  assert.equal(firstArchive.snapshot.personnel[0].military_number, '2001');
  assert.equal(listArchiveRevisions(database, '2026-07').length, 1);
  const lockedPeriod = getFinancialPeriod(database, '2026-07');
  assert.equal(lockedPeriod.is_locked, 1);
  assert.equal(lockedPeriod.start_date, '2026-06-25');
  assert.throws(() => upsertMonthlySalary(database, {
    monthKey: '2026-07',
    militaryNumber: '2001',
    baseSalary: 5100,
    allowances: 300
  }), /مقفلة/);
  assert.equal(getArchiveRevision(database, '2026-07', 1).snapshot.salaries[0].base_salary, 5000);

  assert.throws(() => addSubmoduleRecord(database, {
    submoduleId: 'archive-sub',
    data: { field_1: 'سجل إضافي' },
    monthKey: '2026-07',
    clauseNo: 'بند 3'
  }), /مقفلة/);
  assert.throws(() => importPersonnel(database, [{
    military_number: '2001',
    full_name: 'فرد محدّث',
    rank: 'عريف',
    category: 'صف ضابط',
    unit: 'الوحدة',
    notes: ''
  }], '2026-07'), /مقفلة/);
  assert.throws(() => archiveMonth(database, '2026-07'), /مقفلة/);
  assert.throws(() => setFinancialPeriodRange(database, {
    monthKey: '2026-07',
    startDate: '2026-07-01',
    endDate: '2026-07-31'
  }), /مقفلة/);

  assert.throws(() => database.sqlite.run(`
    UPDATE salaries_base SET base_salary = 1 WHERE effective_month = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM salaries_base WHERE effective_month = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    INSERT INTO salaries_base (military_number, effective_month) VALUES ('2001', '2026-07')
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    UPDATE penalties SET notes = 'تعديل' WHERE period_key = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM penalties WHERE period_key = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    INSERT INTO penalties (military_number, penalty_type, period_key)
    VALUES ('2001', 'حبس', '2026-07')
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM supply_orders WHERE period_key = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    UPDATE supply_orders SET amount = 0 WHERE period_key = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    INSERT INTO supply_orders (order_number, order_date, period_key)
    VALUES ('مقفل-1', '2026-07-01', '2026-07')
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    INSERT INTO submodule_records (submodule_id, data_json, period_key)
    VALUES ('archive-sub', '{}', '2026-07')
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    UPDATE submodule_records SET data_json = '{}' WHERE period_key = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM submodule_records WHERE period_key = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    UPDATE financial_periods SET end_date = '2026-07-31' WHERE month_key = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM financial_periods WHERE month_key = '2026-07'
  `), /مقفلة/);
  assert.throws(() => database.sqlite.run(`
    UPDATE monthly_archives SET revision = 2 WHERE month_key = '2026-07'
  `), /مقفل/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM monthly_archives WHERE month_key = '2026-07'
  `), /مقفل/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM monthly_archive_revisions WHERE month_key = '2026-07'
  `), /مقفل/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM monthly_archive_audit WHERE month_key = '2026-07'
  `), /مراجعة/);
  assert.equal(getArchive(database, '2026-07').snapshot.submoduleRecords.length, 1);
  assert.equal(getArchive(database, '2026-07').revision, 1);
  assert.equal(getArchiveRevision(database, '2026-07', 1).snapshot.submoduleRecords.length, 1);
  assert.equal(listArchiveRevisions(database, '2026-07').length, 1);
  assert.deepEqual(
    listArchiveAudit(database, '2026-07').map((entry) => entry.action),
    ['closed']
  );

  database.sqlite.run(`
    UPDATE financial_periods
    SET is_locked = 0, updated_at = '2026-07-31 12:00:00'
    WHERE month_key = '2026-07'
  `);
  assert.equal(isFinancialPeriodLocked(database, '2026-07'), false);
  database.sqlite.run(`
    UPDATE financial_periods SET is_locked = 1 WHERE month_key = '2026-07'
  `);
  assert.equal(isFinancialPeriodLocked(database, '2026-07'), true);
  assert.throws(() => database.sqlite.run(`
    UPDATE salaries_base SET base_salary = 1 WHERE effective_month = '2026-07'
  `), /مقفلة/);

  const reopenedPeriod = unlockFinancialPeriod(database, '2026-07');
  assert.equal(reopenedPeriod.is_locked, 0);
  assert.throws(() => unlockFinancialPeriod(database, '2026-07'), /مفتوحة بالفعل/);
  assert.equal(listArchiveAudit(database, '2026-07')[0].action, 'unlocked');
  assert.throws(() => database.sqlite.run(`
    DELETE FROM monthly_archive_audit WHERE month_key = '2026-07'
  `), /مراجعة/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM monthly_archive_revisions WHERE month_key = '2026-07'
  `), /مقفل/);
  assert.throws(() => database.sqlite.run(`
    DELETE FROM monthly_archives WHERE month_key = '2026-07'
  `), /مقفل/);
  assert.equal(getArchiveRevision(database, '2026-07', 1).snapshot.salaries[0].base_salary, 5000);
  upsertMonthlySalary(database, {
    monthKey: '2026-07',
    militaryNumber: '2001',
    baseSalary: 5100,
    allowances: 300
  });
  addSubmoduleRecord(database, {
    submoduleId: 'archive-sub',
    data: { field_1: 'تعديل بعد إعادة الفتح' },
    monthKey: '2026-07',
    clauseNo: 'بند 4'
  });
  assert.equal(listArchiveAudit(database, '2026-07')[0].action, 'data_changed');
  const secondArchive = archiveMonth(database, '2026-07');
  assert.equal(secondArchive.revision, 2);
  assert.equal(secondArchive.snapshot.salaries[0].base_salary, 5100);
  assert.equal(secondArchive.snapshot.submoduleRecords.length, 2);
  assert.equal(getArchiveRevision(database, '2026-07', 1).snapshot.salaries[0].base_salary, 5000);
  assert.equal(getFinancialPeriod(database, '2026-07').is_locked, 1);

  copyArchiveToMonth(database, '2026-07', '2026-11');
  assert.equal(listSubmoduleRecords(database, 'archive-sub', '2026-11').length, 2);
  assert.equal(database.sqlite.exec(`
    SELECT COUNT(*) FROM salaries_base WHERE military_number = '2001' AND effective_month = '2026-11'
  `)[0].values[0][0], 1);
  assert.equal(database.sqlite.exec(`
    SELECT base_salary FROM salaries_base WHERE military_number = '2001' AND effective_month = '2026-11'
  `)[0].values[0][0], 5100);
  assert.equal(database.sqlite.exec(`
    SELECT COUNT(*) FROM penalties WHERE military_number = '2001' AND period_key = '2026-11'
  `)[0].values[0][0], 1);
  assert.equal(database.sqlite.exec(`
    SELECT COUNT(*) FROM supply_orders WHERE order_number = 'توريد-1' AND period_key = '2026-11'
  `)[0].values[0][0], 1);
  assert.throws(() => copyArchiveToMonth(database, '2026-07', '2026-11'), /تم نسخ/);
  assert.throws(() => copyArchiveToMonth(database, '2026-07', '2026-07'), /مختلفاً/);
});

test('migrates the existing one-salary-per-person table to monthly salary rows', async (context) => {
  const initializeSqlJs = require('sql.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-migration-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database;
  context.after(() => {
    if (database && database.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const SQL = await initializeSqlJs({
    locateFile: (filename) => require.resolve(`sql.js/dist/${filename}`)
  });
  const legacy = new SQL.Database();
  legacy.exec(`
    CREATE TABLE personnel (
      military_number TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      rank TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE salaries_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      military_number TEXT NOT NULL UNIQUE,
      base_salary REAL NOT NULL DEFAULT 0,
      allowances REAL NOT NULL DEFAULT 0,
      effective_month TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (military_number) REFERENCES personnel(military_number) ON DELETE CASCADE
    );
    CREATE TABLE supply_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      order_date TEXT NOT NULL,
      supplier TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'مسودة',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE monthly_archives (
      month_key TEXT PRIMARY KEY,
      snapshot_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO personnel (military_number, full_name, category) VALUES ('3001', 'بيانات قديمة', 'جندي');
    INSERT INTO salaries_base (military_number, base_salary, effective_month) VALUES ('3001', 4000, '2025-01');
    INSERT INTO supply_orders (order_number, order_date, supplier) VALUES ('قديم-1', '2025-01-10', 'مورد');
    INSERT INTO monthly_archives (month_key, snapshot_json, closed_at, updated_at)
      VALUES ('2025-01', '{"personnel":[],"salaries":[],"penalties":[],"supplyOrders":[],"submoduleRecords":[]}', '2025-01-31', '2025-01-31');
  `);
  fs.writeFileSync(databasePath, Buffer.from(legacy.export()));
  legacy.close();

  database = await initializeDatabase(databasePath);
  assert.equal(getFinancialPeriod(database, '2025-01').is_locked, 1);
  assert.equal(getFinancialPeriod(database, '2025-01').start_date, '2025-01-01');
  assert.throws(() => database.sqlite.run(`
    UPDATE salaries_base SET base_salary = 1 WHERE effective_month = '2025-01'
  `), /مقفلة/);
  assert.equal(database.sqlite.exec(`
    SELECT COUNT(*) FROM monthly_archive_revisions WHERE month_key = '2025-01'
  `)[0].values[0][0], 1);
  const salary = database.sqlite.prepare(`
    INSERT INTO salaries_base (military_number, base_salary, effective_month)
    VALUES (?, ?, ?)
  `);
  salary.run(['3001', 4200, '2025-02']);
  salary.free();
  assert.equal(database.sqlite.exec(`
    SELECT COUNT(*) FROM salaries_base WHERE military_number = '3001'
  `)[0].values[0][0], 2);
  const legacyOrderInNewMonth = database.sqlite.prepare(`
    INSERT INTO supply_orders (order_number, order_date, period_key) VALUES (?, ?, ?)
  `);
  legacyOrderInNewMonth.run(['قديم-1', '2025-02-10', '2025-02']);
  legacyOrderInNewMonth.free();
});

test('opens a locked period read-only when legacy rows need month assignment', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-locked-startup-'));
  const databasePath = path.join(directory, 'finance_system.db');
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  let database = await initializeDatabase(databasePath);
  context.after(() => {
    if (database.open) database.close();
  });
  importPersonnel(database, [{
    military_number: '4001',
    full_name: 'فرد فترة مقفلة',
    rank: 'جندي',
    category: 'جندي',
    unit: 'الوحدة',
    notes: ''
  }]);
  const currentMonth = new Date();
  const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
  const archive = archiveMonth(database, monthKey);
  assert.equal(archive.snapshot.personnel.length, 1);

  database.sqlite.run(`
    INSERT INTO salaries_base (military_number, base_salary, allowances, effective_month)
    VALUES ('4001', 3500, 100, '')
  `);
  database.close();

  database = await initializeDatabase(databasePath);
  assert.ok(database.sqlite.exec(`
    SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'salaries_period_lock_update'
  `)[0].values.length);
  assert.equal(listArchives(database)[0].is_locked, 1);
  assert.equal(getArchive(database, monthKey).snapshot.personnel[0].military_number, '4001');
  assert.equal(listMonthlySalaries(database, monthKey).length, 0);
  assert.equal(getMonthData(database, monthKey).salaries.length, 0);
  assert.equal(database.sqlite.exec(`
    SELECT COUNT(*) FROM salaries_base WHERE military_number = '4001' AND effective_month = ''
  `)[0].values[0][0], 1);
  assert.throws(() => database.sqlite.run(`
    UPDATE salaries_base SET effective_month = '${monthKey}' WHERE military_number = '4001'
  `), /مقفلة/);
  database.close();
});

test('replaces a legacy trigger that blocks reopening locked financial periods', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-legacy-lock-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database = await initializeDatabase(databasePath);
  context.after(() => {
    if (database.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  archiveMonth(database, '2026-07');
  database.sqlite.exec(`
    CREATE TRIGGER legacy_financial_period_unlock_guard
    BEFORE UPDATE ON financial_periods
    WHEN OLD.is_locked = 1 AND NEW.is_locked = 0
    BEGIN SELECT RAISE(ABORT, 'لا يمكن إعادة فتح فترة مالية مقفلة.'); END;
  `);
  database.close();

  database = await initializeDatabase(databasePath);
  const period = unlockFinancialPeriod(database, '2026-07');

  assert.equal(period.is_locked, 0);
  assert.equal(listArchiveAudit(database, '2026-07')[0].action, 'unlocked');
  assert.equal(database.sqlite.exec(`
    SELECT COUNT(*) FROM sqlite_master
    WHERE type = 'trigger' AND name = 'legacy_financial_period_unlock_guard'
  `)[0].values[0][0], 0);
});

test('rolls back a failed unlock without changing the lock state or audit history', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-unlock-rollback-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  archiveMonth(database, '2026-07');
  database.sqlite.exec(`
    CREATE TRIGGER reject_test_unlock
    BEFORE UPDATE OF is_locked ON financial_periods
    WHEN OLD.is_locked = 1 AND NEW.is_locked = 0
    BEGIN SELECT RAISE(ABORT, 'تعذر فتح الفترة للاختبار.'); END;
  `);

  assert.throws(() => unlockFinancialPeriod(database, '2026-07'), /تعذر فتح الفترة للاختبار/);
  assert.equal(isFinancialPeriodLocked(database, '2026-07'), true);
  assert.deepEqual(
    listArchiveAudit(database, '2026-07').map((entry) => entry.action),
    ['closed']
  );
});

test('rolls back a failed archive without creating a partial report or locking the period', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-archive-rollback-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  database.sqlite.exec(`
    CREATE TRIGGER reject_test_archive_revision
    BEFORE INSERT ON monthly_archive_revisions
    BEGIN SELECT RAISE(ABORT, 'تعذر حفظ إصدار التقرير للاختبار.'); END;
  `);

  assert.throws(() => archiveMonth(database, '2026-07'), /تعذر حفظ إصدار التقرير للاختبار/);
  assert.equal(getArchive(database, '2026-07'), null);
  assert.equal(isFinancialPeriodLocked(database, '2026-07'), false);
  assert.deepEqual(listArchiveAudit(database, '2026-07'), []);
});
