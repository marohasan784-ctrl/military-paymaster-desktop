const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  initializeDatabase,
  addModule,
  addSubmodule,
  addSubmoduleRecord,
  addSubmoduleRecords,
  deleteSubmodule,
  updateSubmodule,
  updateSubmoduleRecord,
  deleteSubmoduleRecord,
  archiveModule,
  restoreModule,
  reorderModules,
  archiveRecords,
  listRecordArchives,
  restoreArchivedRecord,
  createModuleWithPreset,
  listSectionPresets,
  exportModuleDefinition,
  importModuleDefinition,
  getMonthData,
  listModules,
  listPersonnel,
  listSubmoduleRecords,
  addTextTemplate,
  addPenalty,
  importPersonnel,
  getLegacySalaryScreenVisible,
  setLegacySalaryScreenVisible,
  getActiveFinancialPeriodKey
} = require('../src/database/database');

test('backs up and migrates legacy section definitions without losing records', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-section-migration-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database = await initializeDatabase(databasePath);
  context.after(() => {
    if (database?.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  addModule(database, { id: 'legacy-module', title: 'قسم قديم' });
  addSubmodule(database, {
    id: 'legacy-submodule',
    moduleId: 'legacy-module',
    title: 'نموذج قديم',
    fields: [{ key: 'field_1', label: 'البيان' }]
  });
  const monthKey = getActiveFinancialPeriodKey(database);
  const recordId = addSubmoduleRecord(database, {
    submoduleId: 'legacy-submodule',
    data: { field_1: 'بيانات محفوظة' },
    monthKey,
    clauseNo: 'بند 1'
  });
  database.sqlite.run('DELETE FROM application_settings WHERE setting_key = ?', ['section_engine_schema_version']);
  database.sqlite.run('UPDATE custom_submodules SET fields_json = ? WHERE id = ?', [
    JSON.stringify([{ key: 'field_1', label: 'البيان' }]),
    'legacy-submodule'
  ]);
  database.close();

  database = await initializeDatabase(databasePath);
  const submodule = listModules(database).find((module) => module.id === 'legacy-module').submodules[0];
  assert.equal(submodule.fieldsVersion, 2);
  assert.deepEqual(submodule.fields, [{ key: 'field_1', label: 'البيان', type: 'text' }]);
  assert.equal(listSubmoduleRecords(database, 'legacy-submodule', monthKey)[0].id, recordId);
  assert.equal(listSubmoduleRecords(database, 'legacy-submodule', monthKey)[0].data.field_1, 'بيانات محفوظة');
  const backups = fs.readdirSync(directory).filter((name) => name.includes('.pre-section-engine-') && name.endsWith('.bak'));
  assert.equal(backups.length, 1);
  assert.ok(fs.statSync(path.join(directory, backups[0])).size > 0);
});

test('links a submodule record directly to a personnel registry entry', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-submodule-person-link-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  addModule(database, { id: 'person-link-module', title: 'قسم مرتبط بالأفراد' });
  addSubmodule(database, {
    id: 'person-link-submodule',
    moduleId: 'person-link-module',
    title: 'نموذج مرتبط',
    fields: [{ key: 'field_1', label: 'البيان' }]
  });
  importPersonnel(database, [{
    military_number: 'LINK-1',
    full_name: 'فرد للاختيار',
    rank: 'رقيب',
    category: 'ضابط صف',
    unit: 'الوحدة الأولى',
    notes: ''
  }, {
    military_number: 'LINK-2',
    full_name: 'فرد بديل',
    rank: 'ملازم',
    category: 'ضابط',
    unit: 'الوحدة الثانية',
    notes: ''
  }]);

  const monthKey = getActiveFinancialPeriodKey(database);
  const recordId = addSubmoduleRecord(database, {
    submoduleId: 'person-link-submodule',
    data: { field_1: '' },
    monthKey,
    clauseNo: 'بند 1',
    militaryNumber: 'LINK-1'
  });
  let [record] = listSubmoduleRecords(database, 'person-link-submodule', monthKey);
  assert.equal(record.id, recordId);
  assert.equal(record.military_number, 'LINK-1');
  assert.equal(record.full_name, 'فرد للاختيار');

  updateSubmoduleRecord(database, {
    recordId,
    data: { field_1: 'بيان مضاف' },
    monthKey,
    clauseNo: 'بند 1',
    militaryNumber: 'LINK-2'
  });
  [record] = listSubmoduleRecords(database, 'person-link-submodule', monthKey);
  assert.equal(record.military_number, 'LINK-2');
  assert.equal(record.full_name, 'فرد بديل');

  assert.throws(() => addSubmoduleRecord(database, {
    submoduleId: 'person-link-submodule',
    data: { field_1: 'بيان' },
    monthKey,
    clauseNo: 'بند 2',
    militaryNumber: 'UNKNOWN'
  }), /غير موجود في سجل الأفراد/);
});

test('creates an empty section by default and creates preset fields and text only when chosen', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-section-create-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  assert.deepEqual(listSectionPresets().map((preset) => preset.title), [
    'إخطار خصم (أيام)',
    'إخطار خصم (نسبة %)',
    'أمر توريد - رفد/إنهاء خدمة',
    'أمر توريد - جزاء'
  ]);
  assert.equal(database.sqlite.exec('SELECT COUNT(*) FROM custom_modules WHERE is_builtin = 0')[0].values[0][0], 0);
  assert.equal(database.sqlite.exec('SELECT COUNT(*) FROM custom_submodules')[0].values[0][0], 0);
  assert.equal(database.sqlite.exec('SELECT COUNT(*) FROM text_templates')[0].values[0][0], 0);

  const created = createModuleWithPreset(database, { id: 'name-only-section', title: 'إخطارات جديدة' });
  const module = listModules(database).find((item) => item.id === created.moduleId);
  assert.equal(module.title, 'إخطارات جديدة');
  assert.equal(created.submoduleId, null);
  assert.equal(module.submodules.length, 0);

  const presetCreated = createModuleWithPreset(database, {
    id: 'preset-section',
    title: 'إخطار خصم',
    presetId: 'deduction-days'
  });
  const presetModule = listModules(database).find((item) => item.id === presetCreated.moduleId);
  assert.equal(presetModule.submodules.length, 1);
  assert.equal(presetModule.submodules[0].title, 'إخطارات الخصم بالأيام');
  assert.deepEqual(presetModule.submodules[0].fields.map((field) => field.type), [
    'person', 'template', 'duration', 'text', 'date', 'text'
  ]);
  assert.equal(database.sqlite.exec('SELECT COUNT(*) FROM text_templates')[0].values[0][0], 1);
  assert.throws(
    () => createModuleWithPreset(database, { id: 'duplicate-section', title: 'إخطارات جديدة' }),
    /يوجد قسم بهذا الاسم/
  );
});

test('deletes a submodule and its dependent live data and templates', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-submodule-delete-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  addModule(database, { id: 'delete-module', title: 'قسم الحذف' });
  addSubmodule(database, {
    id: 'delete-submodule',
    moduleId: 'delete-module',
    title: 'نموذج للحذف',
    fields: [{ key: 'field_1', label: 'البيان', type: 'saved_value' }]
  });
  const monthKey = getActiveFinancialPeriodKey(database);
  const recordId = addSubmoduleRecord(database, {
    submoduleId: 'delete-submodule',
    data: { field_1: 'بيانات للحذف' },
    monthKey,
    clauseNo: 'بند 1'
  });
  updateSubmodule(database, {
    submoduleId: 'delete-submodule',
    title: 'نموذج بعد التعديل',
    fields: [{ key: 'field_1', label: 'البيان', type: 'saved_value' }]
  });
  assert.equal(listModules(database).find((module) => module.id === 'delete-module').submodules[0].title, 'نموذج بعد التعديل');
  assert.equal(getMonthData(database, monthKey).customSections[0].submodule_title, 'نموذج بعد التعديل');
  database.sqlite.run(`
    INSERT INTO document_templates (id, module_id, submodule_id, title, content_html)
    VALUES ('delete-template', 'delete-module', 'delete-submodule', 'قالب للحذف', '<p>نص</p>')
  `);
  database.sqlite.run(`
    INSERT INTO text_templates (scope, title, body)
    VALUES ('delete-submodule', 'نص للحذف', 'محتوى')
  `);
  database.sqlite.run(`
    INSERT INTO record_archives (entity_type, record_id, period_key, snapshot_json)
    VALUES ('submodule_record', ?, ?, '{}')
  `, [String(recordId), monthKey]);

  deleteSubmodule(database, 'delete-submodule');

  assert.equal(listModules(database).find((module) => module.id === 'delete-module').submodules.length, 0);
  const relatedRows = [
    ['submodule_records', 'submodule_id', 'delete-submodule'],
    ['custom_field_values', 'submodule_id', 'delete-submodule'],
    ['document_templates', 'id', 'delete-template'],
    ['text_templates', 'scope', 'delete-submodule'],
    ['record_archives', 'record_id', String(recordId)]
  ];
  for (const [table, column, value] of relatedRows) {
    const result = database.sqlite.exec(`SELECT COUNT(*) FROM ${table} WHERE ${column} = '${value}'`);
    assert.equal(result[0].values[0][0], 0, `${table} should be cleaned up`);
  }
  assert.throws(() => deleteSubmodule(database, 'delete-submodule'), /النموذج الفرعي غير موجود/);
});

test('seeds the core sections and allows their submodules to be managed', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-core-sections-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const modules = listModules(database);
  for (const [id, title] of [
    ['accessions', 'الضم'],
    ['deletions', 'الشطب'],
    ['penalties', 'الجزاءات']
  ]) {
    const module = modules.find((item) => item.id === id);
    assert.equal(module.title, title);
    assert.equal(module.is_builtin, 1);
  }

  addSubmodule(database, {
    id: 'accession-submodule',
    moduleId: 'accessions',
    title: 'ضم أفراد',
    fields: [{ key: 'field_1', label: 'البيان', type: 'select', options: ['اختيار أول', 'اختيار ثان'] }]
  });
  const accessionModule = listModules(database).find((item) => item.id === 'accessions');
  assert.deepEqual(accessionModule.submodules[0].fields[0].options, ['اختيار أول', 'اختيار ثان']);
});

test('hides configurable sections and persists their user-selected order', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-section-order-'));
  const databasePath = path.join(directory, 'finance_system.db');
  let database = await initializeDatabase(databasePath);
  context.after(() => {
    if (database?.open) database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const first = createModuleWithPreset(database, { id: 'order-first', title: 'قسم أول' });
  const second = createModuleWithPreset(database, { id: 'order-second', title: 'قسم ثان' });
  const order = ['order-second', 'accessions', first.moduleId, 'deletions', 'penalties'];
  reorderModules(database, order);
  assert.deepEqual(
    listModules(database).filter((module) => order.includes(module.id)).map((module) => module.id),
    order
  );
  assert.throws(() => reorderModules(database, order.slice(1)), /كل الأقسام القابلة للتخصيص/);

  archiveModule(database, 'accessions');
  assert.equal(listModules(database).find((module) => module.id === 'accessions').is_active, 0);
  restoreModule(database, 'accessions');
  assert.equal(listModules(database).find((module) => module.id === 'accessions').is_active, 1);

  database.close();
  database = await initializeDatabase(databasePath);
  assert.deepEqual(
    listModules(database).filter((module) => order.includes(module.id)).map((module) => module.id),
    order
  );
});

test('archives and restores individual section and personnel records', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-record-archive-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  importPersonnel(database, [{
    military_number: 'ARCH-1',
    full_name: 'فرد للأرشفة',
    rank: 'جندي',
    category: 'جندي',
    unit: 'الوحدة',
    notes: ''
  }]);
  const monthKey = getActiveFinancialPeriodKey(database);
  const created = createModuleWithPreset(database, { id: 'archive-module', title: 'قسم الأرشفة' });
  addSubmodule(database, {
    id: 'archive-submodule',
    moduleId: created.moduleId,
    title: 'نموذج الأرشفة',
    fields: [{ key: 'field_1', label: 'البيان' }]
  });
  const recordId = addSubmoduleRecord(database, {
    submoduleId: 'archive-submodule',
    data: { field_1: 'بيان محفوظ' },
    monthKey,
    clauseNo: 'بند 2'
  });

  let archives = archiveRecords(database, {
    monthKey,
    records: [{ entityType: 'submodule_record', recordId }]
  });
  assert.equal(listSubmoduleRecords(database, 'archive-submodule', monthKey).length, 0);
  assert.equal(archives[0].snapshot.module_id, 'archive-module');
  restoreArchivedRecord(database, { entityType: 'submodule_record', recordId, periodKey: monthKey });
  assert.equal(listSubmoduleRecords(database, 'archive-submodule', monthKey).length, 1);

  archiveRecords(database, {
    monthKey,
    records: [{ entityType: 'personnel', recordId: 'ARCH-1' }]
  });
  assert.equal(listPersonnel(database).some((person) => person.military_number === 'ARCH-1'), false);
  archives = listRecordArchives(database, monthKey);
  assert.equal(archives.some((archive) => archive.entity_type === 'personnel'), true);
  restoreArchivedRecord(database, { entityType: 'personnel', recordId: 'ARCH-1', periodKey: '' });
  assert.equal(listPersonnel(database).some((person) => person.military_number === 'ARCH-1'), true);
});

test('exports and imports section definitions with linked text templates and avoids name collisions', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-section-io-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const source = createModuleWithPreset(database, {
    id: 'exportable-section',
    title: 'قسم للتبادل',
    presetId: 'supply-penalty'
  });
  addTextTemplate(database, {
    scope: source.submoduleId,
    title: 'إشعار جاهز',
    body: 'إخطار إلى {الاسم}',
    requiresDays: false
  });
  const definition = exportModuleDefinition(database, source.moduleId);
  assert.equal(definition.format, 'maly-section-definition');
  assert.equal(definition.submodules[0].templates.length, 2);
  assert.throws(() => importModuleDefinition(database, definition), /يوجد قسم بهذا الاسم بالفعل/);

  const imported = importModuleDefinition(database, definition, 'قسم مستورد');
  const copy = listModules(database).find((module) => module.id === imported.moduleId);
  assert.equal(copy.title, 'قسم مستورد');
  assert.equal(copy.submodules.length, 1);
  assert.deepEqual(copy.submodules[0].fields, listModules(database).find((module) => module.id === source.moduleId).submodules[0].fields);
  const copiedTemplates = database.sqlite.exec(`SELECT scope, title FROM text_templates WHERE scope = '${copy.submodules[0].id}' ORDER BY title`)[0].values;
  assert.deepEqual(
    copiedTemplates.map((row) => row[1]).sort(),
    ['إشعار جاهز', 'أمر توريد مرتبط بجزاء'].sort()
  );
  assert.ok(copiedTemplates.every(([scope]) => scope === copy.submodules[0].id));
});

test('creates a section record from a penalty with its person and penalty link prefilled', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-section-from-penalty-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  importPersonnel(database, [{
    military_number: 'P-LINK',
    full_name: 'فرد مرتبط',
    rank: 'جندي',
    category: 'جندي',
    unit: 'الوحدة',
    notes: ''
  }]);
  const monthKey = getActiveFinancialPeriodKey(database);
  addPenalty(database, {
    monthKey,
    militaryNumber: 'P-LINK',
    penaltyType: 'حبس',
    days: 2,
    reason: 'جزاء اختباري',
    actionDate: `${monthKey}-01`,
    clauseNo: 'بند-1'
  });
  const [penalty] = database.sqlite.exec('SELECT id FROM penalties')[0].values;
  const created = createModuleWithPreset(database, {
    id: 'linked-order',
    title: 'أوامر مرتبطة',
    presetId: 'supply-penalty'
  });
  const fields = listModules(database).find((module) => module.id === created.moduleId).submodules[0].fields;
  const personField = fields.find((field) => field.type === 'person');
  const linkedField = fields.find((field) => field.type === 'linked_record');
  const data = Object.fromEntries(fields.map((field) => [field.key, '']));
  data[personField.key] = 'P-LINK';
  data[linkedField.key] = `penalty:${penalty[0]}`;
  const recordId = addSubmoduleRecord(database, {
    submoduleId: created.submoduleId,
    data,
    monthKey,
    clauseNo: 'بند 3'
  });
  const [record] = listSubmoduleRecords(database, created.submoduleId, monthKey);
  assert.equal(record.id, recordId);
  assert.equal(record.data[personField.key], 'P-LINK');
  assert.equal(record.data[linkedField.key], `penalty:${penalty[0]}`);
});

test('hides the legacy salary screen through a persistent setting without changing its tables', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-legacy-salary-setting-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  assert.equal(getLegacySalaryScreenVisible(database), true);
  setLegacySalaryScreenVisible(database, false);
  assert.equal(getLegacySalaryScreenVisible(database), false);
  assert.equal(database.sqlite.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('salaries_base', 'supply_orders') ORDER BY name")[0].values.length, 2);
  assert.equal(database.sqlite.exec("SELECT setting_value FROM application_settings WHERE setting_key = 'legacy_salaries_screen_visible'")[0].values[0][0], '0');
  assert.throws(() => setLegacySalaryScreenVisible(database, 'false'), /غير صالحة/);
});

test('bulk record insertion is atomic and logs successful record edits', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-section-bulk-'));
  const database = await initializeDatabase(path.join(directory, 'finance_system.db'));
  context.after(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  addModule(database, { id: 'bulk-module', title: 'قسم جماعي' });
  addSubmodule(database, {
    id: 'bulk-submodule',
    moduleId: 'bulk-module',
    title: 'نموذج',
    fields: [{ key: 'field_1', label: 'البيان', type: 'text' }]
  });
  const monthKey = getActiveFinancialPeriodKey(database);
  assert.throws(() => addSubmoduleRecord(database, {
    submoduleId: 'bulk-submodule',
    monthKey,
    data: { field_1: 'بدون بند' }
  }), /رقم بند الأمر مطلوب/);
  database.sqlite.exec(`
    CREATE TRIGGER reject_second_bulk_row
    BEFORE INSERT ON submodule_records
    WHEN NEW.data_json LIKE '%رفض%'
    BEGIN SELECT RAISE(ABORT, 'رفض الاختبار'); END;
  `);
  assert.throws(() => addSubmoduleRecords(database, {
    submoduleId: 'bulk-submodule',
    monthKey,
    records: [
      { data: { field_1: 'يمر' }, clauseNo: 'بند 1' },
      { data: { field_1: 'رفض' }, clauseNo: 'بند 2' }
    ]
  }), /رفض الاختبار/);
  assert.equal(listSubmoduleRecords(database, 'bulk-submodule', monthKey).length, 0);
  assert.equal(database.sqlite.exec("SELECT COUNT(*) FROM audit_log")[0].values[0][0], 0);
  database.sqlite.exec('DROP TRIGGER reject_second_bulk_row');

  const ids = addSubmoduleRecords(database, {
    submoduleId: 'bulk-submodule',
    monthKey,
    records: [
      { data: { field_1: 'سجل أول' }, clauseNo: 'بند 1' },
      { data: { field_1: 'سجل ثان' }, clauseNo: 'بند 2' }
    ]
  });
  assert.equal(ids.length, 2);
  assert.equal(listSubmoduleRecords(database, 'bulk-submodule', monthKey).length, 2);
  assert.equal(listSubmoduleRecords(database, 'bulk-submodule', monthKey)[0].clause_no, 'بند 2');
  assert.equal(database.sqlite.exec("SELECT COUNT(*) FROM audit_log WHERE action = 'created'")[0].values[0][0], 2);
  assert.throws(() => updateSubmoduleRecord(database, {
    recordId: ids[0],
    monthKey,
    data: { field_1: 'تعديل بلا بند' }
  }), /رقم بند الأمر مطلوب/);
  updateSubmoduleRecord(database, { recordId: ids[0], monthKey, data: { field_1: 'تعديل' }, clauseNo: 'بند 3' });
  assert.equal(listSubmoduleRecords(database, 'bulk-submodule', monthKey).find((row) => row.id === ids[0]).data.field_1, 'تعديل');
  deleteSubmoduleRecord(database, { recordId: ids[1], monthKey });
  assert.equal(listSubmoduleRecords(database, 'bulk-submodule', monthKey).length, 1);
  assert.deepEqual(
    database.sqlite.exec("SELECT action FROM audit_log WHERE entity_type = 'submodule_record' ORDER BY id")[0].values.map(([action]) => action),
    ['created', 'created', 'updated', 'deleted']
  );
});
