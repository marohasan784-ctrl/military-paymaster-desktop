const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const initializeSqlJs = require('sql.js');
const { invoiceCompanies } = require('../data/mockInvoiceCatalog');
const { sectionPresets } = require('../services/sectionPresets.cjs');
const DEFAULT_ACTION_TYPES = ['حبس', 'قطع', 'إهمال', 'غياب', 'نقل', 'شطب', 'أخرى', 'حبس احتياطي', 'محكمة', 'مخالفة الأوامر'];
const DEFAULT_DROPDOWN_OPTIONS = {
  field_type: [
    ['text', 'نص'], ['number', 'رقم'], ['date', 'تاريخ'], ['select', 'قائمة اختيارات'],
    ['person', 'فرد'], ['saved_value', 'قيمة محفوظة'], ['template', 'نص جاهز'],
    ['linked_record', 'ربط بسجل'], ['duration', 'مدة بالأيام'], ['percentage', 'نسبة %']
  ],
  paragraph_format: [['p', 'نص عادي'], ['h1', 'عنوان رئيسي'], ['h2', 'عنوان فرعي'], ['h3', 'عنوان صغير']],
  document_font: [['Tahoma', 'Tahoma'], ['Arial', 'Arial'], ['Times New Roman', 'Times New Roman'], ['Courier New', 'Courier New']],
  document_font_size: [['3', '12'], ['2', '10'], ['4', '14'], ['5', '18'], ['6', '24']],
  invoice_template: [['classic', 'كلاسيكي بسيط'], ['modern', 'مودرن ملون'], ['framed', 'رسمي بإطار'], ['sidebar', 'شرائط جانبية']]
};
const SECTION_ENGINE_VERSION = '2';
const CONFIGURABLE_CORE_MODULE_IDS = ['accessions', 'deletions', 'penalties'];

async function initializeDatabase(filePath) {
  const SQL = await initializeSqlJs({
    locateFile: (filename) => {
      const resolvedPath = require.resolve(`sql.js/dist/${filename}`);
      if (!filename.endsWith('.wasm') || !process.resourcesPath) return resolvedPath;

      const archivePath = path.join(process.resourcesPath, 'app.asar');
      const relativePath = path.relative(archivePath, resolvedPath);
      if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
        return resolvedPath;
      }
      return path.join(process.resourcesPath, 'app.asar.unpacked', relativePath);
    }
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite = fs.existsSync(filePath)
    ? new SQL.Database(new Uint8Array(fs.readFileSync(filePath)))
    : new SQL.Database();
  backupDatabaseBeforeSectionMigration(filePath, sqlite);
  sqlite.run('PRAGMA foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS personnel (
      military_number TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      rank TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      source_data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS salaries_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      military_number TEXT NOT NULL,
      base_salary REAL NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
      allowances REAL NOT NULL DEFAULT 0 CHECK (allowances >= 0),
      effective_month TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (military_number) REFERENCES personnel(military_number) ON DELETE CASCADE,
      UNIQUE (military_number, effective_month)
    );

    CREATE TABLE IF NOT EXISTS penalties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      military_number TEXT NOT NULL,
      penalty_type TEXT NOT NULL DEFAULT '',
      days INTEGER NOT NULL DEFAULT 0 CHECK (days >= 0),
      deduction_amount REAL NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
      reason TEXT NOT NULL DEFAULT '',
      action_date TEXT NOT NULL DEFAULT '',
      clause_no TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      period_key TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (military_number) REFERENCES personnel(military_number) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS supply_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL,
      order_date TEXT NOT NULL,
      supplier TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
      status TEXT NOT NULL DEFAULT 'مسودة',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      period_key TEXT NOT NULL DEFAULT '',
      UNIQUE (order_number, period_key)
    );

    CREATE TABLE IF NOT EXISTS dynamic_schemas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schema_name TEXT NOT NULL UNIQUE,
      fields_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_modules (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT '▦',
      is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_submodules (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      title TEXT NOT NULL,
      fields_json TEXT NOT NULL DEFAULT '[]',
      template_path TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES custom_modules(id) ON DELETE CASCADE,
      UNIQUE (module_id, title)
    );

    CREATE TABLE IF NOT EXISTS personnel_import_columns (
      column_key TEXT PRIMARY KEY,
      source_header TEXT NOT NULL UNIQUE,
      placeholder_label TEXT NOT NULL,
      canonical_field TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS document_templates (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      submodule_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      content_html TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES custom_modules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS submodule_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submodule_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      military_number TEXT REFERENCES personnel(military_number) ON DELETE SET NULL,
      action_type TEXT,
      action_days INTEGER,
      action_reason TEXT,
      action_date TEXT,
      clause_no TEXT,
      FOREIGN KEY (submodule_id) REFERENCES custom_submodules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS application_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS text_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      requires_days INTEGER NOT NULL DEFAULT 0 CHECK (requires_days IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dropdown_options (
      option_id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      scope_id TEXT NOT NULL DEFAULT '',
      option_value TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
      UNIQUE (group_id, scope_id, option_value)
    );

    CREATE TABLE IF NOT EXISTS custom_field_values (
      submodule_id TEXT NOT NULL,
      field_key TEXT NOT NULL,
      value TEXT NOT NULL,
      last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (submodule_id, field_key, value),
      FOREIGN KEY (submodule_id) REFERENCES custom_submodules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  addColumnIfMissing(sqlite, 'personnel', 'source_data_json', "TEXT NOT NULL DEFAULT '{}'");
  migratePersonnelCategoryConstraint(sqlite);
  addColumnIfMissing(sqlite, 'personnel_import_columns', 'canonical_field', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'custom_modules', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(sqlite, 'custom_modules', 'updated_at', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'custom_submodules', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(sqlite, 'custom_submodules', 'updated_at', "TEXT NOT NULL DEFAULT ''");
  migrateSectionFieldDefinitions(sqlite);
  migrateActionTemplates(sqlite);
  migrateSalaryBase(sqlite);
  addColumnIfMissing(sqlite, 'supply_orders', 'period_key', "TEXT NOT NULL DEFAULT ''");
  migrateSupplyOrders(sqlite);
  addColumnIfMissing(sqlite, 'penalties', 'period_key', "TEXT NOT NULL DEFAULT ''");
  migratePenalties(sqlite);
  addColumnIfMissing(sqlite, 'custom_modules', 'template_path', 'TEXT');
  addColumnIfMissing(sqlite, 'submodule_records', 'period_key', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'submodule_records', 'military_number', 'TEXT REFERENCES personnel(military_number) ON DELETE SET NULL');
  addColumnIfMissing(sqlite, 'submodule_records', 'action_type', 'TEXT');
  addColumnIfMissing(sqlite, 'submodule_records', 'action_days', 'INTEGER');
  addColumnIfMissing(sqlite, 'submodule_records', 'action_reason', 'TEXT');
  addColumnIfMissing(sqlite, 'submodule_records', 'action_date', 'TEXT');
  addColumnIfMissing(sqlite, 'submodule_records', 'clause_no', 'TEXT');
  const currentMonth = getCurrentMonthKey();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS monthly_archives (
      month_key TEXT PRIMARY KEY,
      snapshot_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      closed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS monthly_archive_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_key TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (month_key) REFERENCES monthly_archives(month_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS monthly_archive_copies (
      source_month TEXT NOT NULL,
      target_month TEXT NOT NULL,
      source_revision INTEGER NOT NULL,
      copied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_month, target_month, source_revision)
    );

    CREATE TABLE IF NOT EXISTS monthly_archive_revisions (
      month_key TEXT NOT NULL,
      revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (month_key, revision),
      FOREIGN KEY (month_key) REFERENCES monthly_archives(month_key) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS record_archives (
      entity_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      period_key TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL,
      archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (entity_type, record_id, period_key)
    );

    CREATE TABLE IF NOT EXISTS financial_periods (
      month_key TEXT PRIMARY KEY,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
      locked_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (start_date <= end_date)
    );

    CREATE TABLE IF NOT EXISTS invoice_companies (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      commercial_register TEXT NOT NULL DEFAULT '',
      tax_card TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS invoice_products (
      code TEXT PRIMARY KEY,
      company_code TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (company_code) REFERENCES invoice_companies(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL,
      company_code TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      period_key TEXT NOT NULL,
      subtotal REAL NOT NULL CHECK (subtotal >= 0),
      vat_rate REAL NOT NULL DEFAULT 0.14 CHECK (vat_rate = 0.14),
      vat_amount REAL NOT NULL CHECK (vat_amount >= 0),
      grand_total REAL NOT NULL CHECK (grand_total >= 0),
      company_snapshot_json TEXT NOT NULL DEFAULT '{}',
      header_fields_json TEXT NOT NULL DEFAULT '[]',
      layout_json TEXT NOT NULL DEFAULT '[]',
      template_id TEXT NOT NULL DEFAULT 'classic',
      document_type TEXT NOT NULL DEFAULT 'invoice' CHECK (document_type IN ('invoice', 'quotation')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_code) REFERENCES invoice_companies(code),
      UNIQUE (invoice_number, period_key)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      serial INTEGER NOT NULL,
      product_code TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      quantity REAL NOT NULL CHECK (quantity > 0),
      total REAL NOT NULL CHECK (total >= 0),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (product_code) REFERENCES invoice_products(code),
      UNIQUE (invoice_id, serial)
    );
  `);
  sqlite.exec(`
    INSERT OR IGNORE INTO monthly_archive_revisions (month_key, revision, snapshot_json, created_at)
    SELECT a.month_key, a.revision, a.snapshot_json, a.updated_at
    FROM monthly_archives a
    WHERE NOT EXISTS (
      SELECT 1 FROM financial_periods p
      WHERE p.month_key = a.month_key AND p.is_locked = 1
    );
  `);
  migrateFinancialPeriods(sqlite);
  addColumnIfMissing(sqlite, 'invoice_companies', 'commercial_register', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'invoice_companies', 'tax_card', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'invoice_companies', 'address', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'invoice_companies', 'phone', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(sqlite, 'invoice_companies', 'is_custom', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(sqlite, 'invoices', 'company_snapshot_json', "TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(sqlite, 'invoices', 'header_fields_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(sqlite, 'invoices', 'layout_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(sqlite, 'invoices', 'template_id', "TEXT NOT NULL DEFAULT 'classic'");
  addColumnIfMissing(sqlite, 'invoices', 'document_type', "TEXT NOT NULL DEFAULT 'invoice' CHECK (document_type IN ('invoice', 'quotation'))");
  seedInvoiceCatalog(sqlite);
  createClauseNumberTriggers(sqlite);
  createPeriodLockTriggers(sqlite);
  updateUnassignedMonths(sqlite, currentMonth);
  sqlite.run('PRAGMA foreign_keys = ON');
  sqlite.exec(`
    INSERT OR IGNORE INTO custom_modules (id, title, icon, is_builtin, sort_order) VALUES
      ('home', 'لوحة المتابعة', '⌂', 1, 0),
      ('personnel', 'سجل الأفراد', '♙', 1, 1),
      ('salaries', 'الماهيات', '▤', 1, 2),
      ('accessions', 'الضم', '＋', 1, 3),
      ('deletions', 'الشطب', '−', 1, 4),
      ('penalties', 'الجزاءات', '◈', 1, 5),
      ('supplies', 'أوامر التوريد', '▣', 1, 6),
      ('invoices', 'الفواتير الإلكترونية', '▧', 1, 7),
      ('templates', 'مصمم القوالب المرنة', '＋', 1, 8);
  `);
  const database = {
    filePath,
    sqlite,
    close() {
      persistDatabase(this);
      this.sqlite.close();
      this.open = false;
    },
    open: true
  };
  if (!getApplicationSetting(database, 'active_period_key')) {
    const { startDate, endDate } = defaultPeriodRange(currentMonth);
    execute(database, `
      INSERT OR IGNORE INTO financial_periods (month_key, start_date, end_date)
      VALUES (?, ?, ?)
    `, [currentMonth, startDate, endDate]);
    execute(database, `
      INSERT INTO application_settings (setting_key, setting_value)
      VALUES ('active_period_key', ?)
    `, [currentMonth]);
  }
  seedDropdownOptions(database);
  migrateActionTypeValues(database);
  execute(database, `
    INSERT INTO application_settings (setting_key, setting_value, updated_at)
    VALUES ('section_engine_schema_version', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = CURRENT_TIMESTAMP
  `, [SECTION_ENGINE_VERSION]);
  persistDatabase(database);
  return database;
}

function backupDatabaseBeforeSectionMigration(filePath, sqlite) {
  if (!fs.existsSync(filePath)) return null;
  const settingsTable = sqlite.exec(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'application_settings'
  `)[0]?.values?.length;
  if (settingsTable) {
    const version = sqlite.exec(`
      SELECT setting_value FROM application_settings
      WHERE setting_key = 'section_engine_schema_version'
    `)[0]?.values?.[0]?.[0];
    if (version === SECTION_ENGINE_VERSION) return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.pre-section-engine-${timestamp}.bak`;
  fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
  return backupPath;
}

function migrateSectionFieldDefinitions(sqlite) {
  const rows = sqlite.exec(`
    SELECT id, fields_json FROM custom_submodules
  `)[0]?.values ?? [];
  const update = sqlite.prepare(`
    UPDATE custom_submodules SET fields_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    for (const [id, raw] of rows) {
      const parsed = JSON.parse(raw || '[]');
      if (parsed && !Array.isArray(parsed) && parsed.version === SECTION_ENGINE_VERSION && Array.isArray(parsed.fields)) {
        continue;
      }
      const fields = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.fields) ? parsed.fields : [];
      const normalized = fields.map((field, index) => ({
        ...field,
        key: String(field.key || `field_${index + 1}`),
        label: String(field.label || `حقل ${index + 1}`),
        type: field.type || 'text'
      }));
      update.run([JSON.stringify({ version: Number(SECTION_ENGINE_VERSION), fields: normalized }), id]);
      update.reset();
    }
    sqlite.run('COMMIT');
  } catch (error) {
    sqlite.run('ROLLBACK');
    throw error;
  } finally {
    update.free();
  }
}

function seedInvoiceCatalog(sqlite) {
  sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const company = sqlite.prepare(`
      INSERT OR IGNORE INTO invoice_companies (code, name, category) VALUES (?, ?, ?)
    `);
    const product = sqlite.prepare(`
      INSERT OR IGNORE INTO invoice_products
        (code, company_code, description, unit, unit_price, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    try {
      for (const entry of invoiceCompanies) {
        company.run([entry.code, entry.name, entry.category]);
        company.reset();
        for (const item of entry.products) {
          product.run([
            item.code, entry.code, item.description, item.unit, item.unitPrice, item.sortOrder
          ]);
          product.reset();
        }

      }
    } finally {
      company.free();
      product.free();
    }
    sqlite.run('COMMIT');
  } catch (error) {
    sqlite.run('ROLLBACK');
    throw error;
  }
}

function migrateActionTemplates(sqlite) {
  const legacyTable = sqlite.exec(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'action_templates'
  `)[0]?.values?.length;
  if (!legacyTable) return;
  const hasTextTemplates = sqlite.exec('SELECT id FROM text_templates LIMIT 1')[0]?.values?.length;
  if (hasTextTemplates) return;
  sqlite.exec(`
    INSERT OR IGNORE INTO text_templates
      (id, scope, kind, title, body, requires_days, sort_order, is_active, created_at, updated_at)
    SELECT id, 'penalties', action_type, title, body_template, requires_days,
      sort_order, is_active, created_at, updated_at
    FROM action_templates
  `);
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function migrateSalaryBase(sqlite) {
  const table = sqlite.exec(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'salaries_base'
  `)[0]?.values?.[0]?.[0];
  if (!table || !/military_number\s+TEXT\s+NOT NULL\s+UNIQUE/i.test(table)) return;

  sqlite.exec(`
    BEGIN IMMEDIATE TRANSACTION;
    ALTER TABLE salaries_base RENAME TO salaries_base_legacy;
    CREATE TABLE salaries_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      military_number TEXT NOT NULL,
      base_salary REAL NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
      allowances REAL NOT NULL DEFAULT 0 CHECK (allowances >= 0),
      effective_month TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (military_number) REFERENCES personnel(military_number) ON DELETE CASCADE,
      UNIQUE (military_number, effective_month)
    );
    INSERT INTO salaries_base (id, military_number, base_salary, allowances, effective_month)
      SELECT id, military_number, base_salary, allowances, effective_month FROM salaries_base_legacy;
    DROP TABLE salaries_base_legacy;
    COMMIT;
  `);
}

function migrateSupplyOrders(sqlite) {
  const table = sqlite.exec(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'supply_orders'
  `)[0]?.values?.[0]?.[0];
  if (!table || !/order_number\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(table)) return;

  sqlite.exec(`
    BEGIN IMMEDIATE TRANSACTION;
    ALTER TABLE supply_orders RENAME TO supply_orders_legacy;
    CREATE TABLE supply_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL,
      order_date TEXT NOT NULL,
      supplier TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
      status TEXT NOT NULL DEFAULT 'مسودة',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      period_key TEXT NOT NULL DEFAULT '',
      UNIQUE (order_number, period_key)
    );
    INSERT INTO supply_orders (
      id, order_number, order_date, supplier, description, amount, status, created_at, period_key
    )
      SELECT id, order_number, order_date, supplier, description, amount, status, created_at, period_key
      FROM supply_orders_legacy;
    DROP TABLE supply_orders_legacy;
    COMMIT;
  `);
}

function migratePenalties(sqlite) {
  const table = sqlite.exec(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'penalties'
  `)[0]?.values?.[0]?.[0];
  if (!table) return;
  const columns = sqlite.exec('PRAGMA table_info(penalties)')[0]?.values ?? [];
  const columnNames = new Set(columns.map((column) => column[1]));
  const requiredColumns = ['reason', 'action_date', 'clause_no', 'period_key'];
  const hasLegacyTypeConstraint = /CHECK\s*\(\s*penalty_type\s+IN/i.test(table);
  if (!hasLegacyTypeConstraint && requiredColumns.every((column) => columnNames.has(column))) return;

  const expression = (columnName, fallback) => (
    columnNames.has(columnName) ? `"${columnName}"` : fallback
  );
  const legacyReason = columnNames.has('notes')
    ? `COALESCE(NULLIF("notes", ''), "penalty_type")`
    : `"penalty_type"`;
  sqlite.exec(`
    BEGIN IMMEDIATE TRANSACTION;
    ALTER TABLE penalties RENAME TO penalties_legacy;
    CREATE TABLE penalties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      military_number TEXT NOT NULL,
      penalty_type TEXT NOT NULL DEFAULT '',
      days INTEGER NOT NULL DEFAULT 0 CHECK (days >= 0),
      deduction_amount REAL NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
      reason TEXT NOT NULL DEFAULT '',
      action_date TEXT NOT NULL DEFAULT '',
      clause_no TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      period_key TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (military_number) REFERENCES personnel(military_number) ON DELETE CASCADE
    );
    INSERT INTO penalties (
      id, military_number, penalty_type, days, deduction_amount, reason,
      action_date, clause_no, notes, created_at, period_key
    )
    SELECT id, military_number, penalty_type, days, deduction_amount,
      ${expression('reason', legacyReason)},
      ${expression('action_date', "''")},
      ${expression('clause_no', "''")},
      ${expression('notes', "''")},
      ${expression('created_at', 'CURRENT_TIMESTAMP')},
      ${expression('period_key', "''")}
    FROM penalties_legacy;
    DROP TABLE penalties_legacy;
    COMMIT;
  `);
}

function addColumnIfMissing(sqlite, tableName, columnName, columnDefinition) {
  const columns = sqlite.exec(`PRAGMA table_info(${tableName})`)[0]?.values ?? [];
  if (!columns.some((column) => column[1] === columnName)) {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

function migratePersonnelCategoryConstraint(sqlite) {
  const table = sqlite.exec(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'personnel'
  `)[0]?.values?.[0]?.[0];
  if (!table || !/CHECK\s*\(\s*category\s+IN\s*\(/i.test(table)) return;

  sqlite.exec('PRAGMA foreign_keys = OFF');
  try {
    sqlite.exec(`
      BEGIN IMMEDIATE TRANSACTION;
      CREATE TABLE personnel_new (
        military_number TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        rank TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        unit TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        source_data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO personnel_new (
        military_number, full_name, rank, category, unit, notes, source_data_json, created_at, updated_at
      )
      SELECT military_number, full_name, rank, category, unit, notes, source_data_json, created_at, updated_at
      FROM personnel;
      DROP TABLE personnel;
      ALTER TABLE personnel_new RENAME TO personnel;
      COMMIT;
    `);
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  } finally {
    sqlite.exec('PRAGMA foreign_keys = ON');
  }
}

function updateUnassignedMonths(sqlite, monthKey) {
  const period = sqlite.prepare('SELECT is_locked FROM financial_periods WHERE month_key = ?');
  period.bind([monthKey]);
  const isLocked = period.step() && period.getAsObject().is_locked === 1;
  period.free();
  if (isLocked) return;

  for (const [table, column] of [
    ['penalties', 'period_key'],
    ['supply_orders', 'period_key'],
    ['submodule_records', 'period_key'],
    ['salaries_base', 'effective_month']
  ]) {
    const statement = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ''`);
    statement.run([monthKey]);
    statement.free();
  }
}

function defaultPeriodRange(monthKey) {
  validateMonthKey(monthKey);
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${String(lastDay).padStart(2, '0')}`
  };
}

function migrateFinancialPeriods(sqlite) {
  const archives = sqlite.exec(`
    SELECT month_key, closed_at FROM monthly_archives
  `)[0]?.values ?? [];
  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO financial_periods
      (month_key, start_date, end_date, is_locked, locked_at)
    VALUES (?, ?, ?, 1, ?)
  `);
  try {
    for (const [monthKey, closedAt] of archives) {
      const { startDate, endDate } = defaultPeriodRange(monthKey);
      insert.run([monthKey, startDate, endDate, closedAt]);
      insert.reset();
    }
  } finally {
    insert.free();
  }
}

function createPeriodLockTriggers(sqlite) {
  const periodTriggers = sqlite.exec(`
    SELECT name FROM sqlite_master
    WHERE type = 'trigger' AND tbl_name = 'financial_periods'
  `)[0]?.values ?? [];
  for (const [triggerName] of periodTriggers) {
    const escapedName = String(triggerName).replace(/"/g, '""');
    sqlite.exec(`DROP TRIGGER "${escapedName}"`);
  }

  sqlite.exec(`
    DROP TRIGGER IF EXISTS monthly_archives_lock_delete;
    DROP TRIGGER IF EXISTS archive_revisions_lock_update;
    DROP TRIGGER IF EXISTS archive_revisions_lock_delete;
    DROP TRIGGER IF EXISTS archive_audit_lock_update;
    DROP TRIGGER IF EXISTS archive_audit_lock_delete;
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS salaries_period_lock_insert
    BEFORE INSERT ON salaries_base
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.effective_month AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS invoices_period_lock_insert
    BEFORE INSERT ON invoices
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS invoices_period_lock_update
    BEFORE UPDATE ON invoices
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.period_key AND is_locked = 1)
      OR EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS invoices_period_lock_delete
    BEFORE DELETE ON invoices
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS invoice_items_period_lock_insert
    BEFORE INSERT ON invoice_items
    WHEN EXISTS (
      SELECT 1 FROM invoices i JOIN financial_periods p ON p.month_key = i.period_key
      WHERE i.id = NEW.invoice_id AND p.is_locked = 1
    )
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS invoice_items_period_lock_update
    BEFORE UPDATE ON invoice_items
    WHEN EXISTS (
      SELECT 1 FROM invoices i JOIN financial_periods p ON p.month_key = i.period_key
      WHERE i.id IN (OLD.invoice_id, NEW.invoice_id) AND p.is_locked = 1
    )
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS invoice_items_period_lock_delete
    BEFORE DELETE ON invoice_items
    WHEN EXISTS (
      SELECT 1 FROM invoices i JOIN financial_periods p ON p.month_key = i.period_key
      WHERE i.id = OLD.invoice_id AND p.is_locked = 1
    )
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS salaries_period_lock_update
    BEFORE UPDATE ON salaries_base
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.effective_month AND is_locked = 1)
      OR EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.effective_month AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS salaries_period_lock_delete
    BEFORE DELETE ON salaries_base
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.effective_month AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS penalties_period_lock_insert
    BEFORE INSERT ON penalties
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS penalties_period_lock_update
    BEFORE UPDATE ON penalties
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.period_key AND is_locked = 1)
      OR EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS penalties_period_lock_delete
    BEFORE DELETE ON penalties
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS supply_orders_period_lock_insert
    BEFORE INSERT ON supply_orders
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS supply_orders_period_lock_update
    BEFORE UPDATE ON supply_orders
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.period_key AND is_locked = 1)
      OR EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS supply_orders_period_lock_delete
    BEFORE DELETE ON supply_orders
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS submodule_records_period_lock_insert
    BEFORE INSERT ON submodule_records
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS submodule_records_period_lock_update
    BEFORE UPDATE ON submodule_records
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.period_key AND is_locked = 1)
      OR EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS submodule_records_period_lock_delete
    BEFORE DELETE ON submodule_records
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.period_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS monthly_archives_lock_insert
    BEFORE INSERT ON monthly_archives
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.month_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS monthly_archives_lock_update
    BEFORE UPDATE ON monthly_archives
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = OLD.month_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الأرشيف المالي مقفل ولا يمكن تعديله.'); END;

    CREATE TRIGGER IF NOT EXISTS monthly_archives_lock_delete
    BEFORE DELETE ON monthly_archives
    BEGIN SELECT RAISE(ABORT, 'الأرشيف المالي مقفل ولا يمكن حذفه.'); END;

    CREATE TRIGGER IF NOT EXISTS archive_revisions_lock_insert
    BEFORE INSERT ON monthly_archive_revisions
    WHEN EXISTS (SELECT 1 FROM financial_periods WHERE month_key = NEW.month_key AND is_locked = 1)
    BEGIN SELECT RAISE(ABORT, 'الفترة المالية مقفلة ولا يمكن تعديل بياناتها.'); END;

    CREATE TRIGGER IF NOT EXISTS archive_revisions_lock_update
    BEFORE UPDATE ON monthly_archive_revisions
    BEGIN SELECT RAISE(ABORT, 'الأرشيف المالي مقفل ولا يمكن تعديله.'); END;

    CREATE TRIGGER IF NOT EXISTS archive_revisions_lock_delete
    BEFORE DELETE ON monthly_archive_revisions
    BEGIN SELECT RAISE(ABORT, 'الأرشيف المالي مقفل ولا يمكن حذفه.'); END;

    CREATE TRIGGER IF NOT EXISTS archive_audit_lock_update
    BEFORE UPDATE ON monthly_archive_audit
    BEGIN SELECT RAISE(ABORT, 'سجل مراجعة الأرشيف غير قابل للتعديل.'); END;

    CREATE TRIGGER IF NOT EXISTS archive_audit_lock_delete
    BEFORE DELETE ON monthly_archive_audit
    BEGIN SELECT RAISE(ABORT, 'سجل مراجعة الأرشيف غير قابل للحذف.'); END;

    CREATE TRIGGER IF NOT EXISTS financial_period_prevent_locked_update
    BEFORE UPDATE ON financial_periods
    WHEN OLD.is_locked = 1
      AND NEW.is_locked = 1
      AND (
        NEW.month_key != OLD.month_key
        OR NEW.start_date != OLD.start_date
        OR NEW.end_date != OLD.end_date
        OR NEW.locked_at IS NOT OLD.locked_at
        OR NEW.created_at != OLD.created_at
        OR NEW.updated_at != OLD.updated_at
      )
    BEGIN SELECT RAISE(ABORT, 'لا يمكن تعديل فترة مالية مقفلة.'); END;

    CREATE TRIGGER IF NOT EXISTS financial_period_audit_unlock
    AFTER UPDATE OF is_locked ON financial_periods
    WHEN OLD.is_locked = 1 AND NEW.is_locked = 0
    BEGIN
      INSERT INTO monthly_archive_audit (month_key, action, details)
      VALUES (
        OLD.month_key,
        'unlocked',
        'إعادة فتح إدارية بعد تأكيد نافذة التطبيق؛ تم الاحتفاظ بالأرشيف السابق.'
      );
    END;

    CREATE TRIGGER IF NOT EXISTS financial_period_prevent_locked_delete
    BEFORE DELETE ON financial_periods
    WHEN OLD.is_locked = 1
    BEGIN SELECT RAISE(ABORT, 'لا يمكن حذف فترة مالية مقفلة.'); END;
  `);
}

function createClauseNumberTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS penalties_require_clause_on_insert;
    DROP TRIGGER IF EXISTS penalties_require_clause_on_update;
    DROP TRIGGER IF EXISTS submodule_records_require_clause_on_insert;
    DROP TRIGGER IF EXISTS submodule_records_require_clause_on_update;
    CREATE TRIGGER penalties_require_clause_on_insert
    BEFORE INSERT ON penalties
    WHEN TRIM(COALESCE(NEW.clause_no, '')) = ''
    BEGIN SELECT RAISE(ABORT, 'رقم بند الأمر مطلوب'); END;
    CREATE TRIGGER penalties_require_clause_on_update
    BEFORE UPDATE OF clause_no ON penalties
    WHEN TRIM(COALESCE(NEW.clause_no, '')) = ''
    BEGIN SELECT RAISE(ABORT, 'رقم بند الأمر مطلوب'); END;
    CREATE TRIGGER submodule_records_require_clause_on_insert
    BEFORE INSERT ON submodule_records
    WHEN TRIM(COALESCE(NEW.clause_no, '')) = ''
    BEGIN SELECT RAISE(ABORT, 'رقم بند الأمر مطلوب'); END;
    CREATE TRIGGER submodule_records_require_clause_on_update
    BEFORE UPDATE OF clause_no ON submodule_records
    WHEN TRIM(COALESCE(NEW.clause_no, '')) = ''
    BEGIN SELECT RAISE(ABORT, 'رقم بند الأمر مطلوب'); END;
  `);
}

function validatePeriodDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`تاريخ ${label} غير صالح.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`تاريخ ${label} غير صالح.`);
  }
}

function isFinancialPeriodLocked(database, monthKey) {
  validateMonthKey(monthKey);
  return readRows(database, `
    SELECT is_locked FROM financial_periods WHERE month_key = ?
  `, [monthKey])[0]?.is_locked === 1;
}

function unlockFinancialPeriod(database, monthKey) {
  validateMonthKey(monthKey);
  const period = withDatabaseTransaction(database, () => {
    if (!isFinancialPeriodLocked(database, monthKey)) {
      throw new Error('الفترة المالية مفتوحة بالفعل ولا تحتاج إلى إعادة فتحها.');
    }
    database.sqlite.run(
      'UPDATE financial_periods SET is_locked = 0 WHERE month_key = ?',
      [monthKey]
    );
    return getFinancialPeriod(database, monthKey);
  });
  persistDatabase(database);
  return period;
}

function ensureFinancialPeriodOpen(database, monthKey) {
  if (isFinancialPeriodLocked(database, monthKey)) {
    throw new Error('الفترة المالية مقفلة للقراءة فقط ولا يمكن تعديل بياناتها.');
  }
}

function persistDatabase(database) {
  const temporaryPath = `${database.filePath}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, Buffer.from(database.sqlite.export()));
    fs.renameSync(temporaryPath, database.filePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function listPersonnel(database) {
  const statement = database.sqlite.prepare(`
    SELECT military_number, full_name, rank, category, unit, notes, source_data_json
    FROM personnel p
    WHERE NOT EXISTS (
      SELECT 1 FROM record_archives a
      WHERE a.entity_type = 'personnel'
        AND a.record_id = p.military_number
        AND a.period_key = ''
    )
    ORDER BY full_name COLLATE NOCASE
  `);
  const records = [];
  try {
    while (statement.step()) records.push(statement.getAsObject());
  } finally {
    statement.free();
  }
  const columns = listPersonnelColumns(database);
  return records.map(({ source_data_json: sourceDataJson, ...person }) => {
    const sourceData = parseJson(sourceDataJson, {});
    const result = { ...person };
    if (Object.keys(sourceData).length) result.source_data = sourceData;
    return columns.reduce((result, column) => ({
      ...result,
      [column.column_key]: sourceData[column.source_header] ?? person[column.canonical_field] ?? ''
    }), result);
  });
}

function listPersonnelColumns(database) {
  return readRows(database, `
    SELECT column_key, source_header, placeholder_label, canonical_field, sort_order
    FROM personnel_import_columns
    ORDER BY sort_order, column_key
  `);
}

function registerPersonnelColumns(database, headers = []) {
  const columns = listPersonnelColumns(database);
  const validHeaders = headers.map((header) => typeof header === 'string' ? { name: header } : header)
    .filter((header) => typeof header?.name === 'string' && header.name.trim());
  const sourceHeaders = validHeaders.map((header) => header.name);
  if (!sourceHeaders.length) return;
  const imported = new Set(sourceHeaders);
  const nextAvailableKey = columns.reduce((next, column) => {
    const number = Number(/^excel_(\d+)$/.exec(column.column_key)?.[1] || 0);
    return Math.max(next, number + 1);
  }, 1);
  const configuredNextKey = Number(getApplicationSetting(database, 'personnel_import_next_column_key')) || 1;
  let nextKey = Math.max(nextAvailableKey, configuredNextKey);
  for (const column of columns.filter((item) => !imported.has(item.source_header))) {
    execute(database, 'DELETE FROM personnel_import_columns WHERE source_header = ?', [column.source_header]);
  }
  const existing = new Set(columns
    .filter((column) => imported.has(column.source_header))
    .map((column) => column.source_header));
  for (const [index, sourceHeader] of sourceHeaders.entries()) {
    const header = validHeaders[index];
    const canonicalField = String(header?.field || '');
    if (existing.has(sourceHeader)) {
      execute(database, `
        UPDATE personnel_import_columns
        SET sort_order = ?, canonical_field = ?
        WHERE source_header = ?
      `, [index, canonicalField, sourceHeader]);
    } else {
      execute(database, `
        INSERT INTO personnel_import_columns (column_key, source_header, placeholder_label, canonical_field, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `, [`excel_${nextKey}`, sourceHeader, sourceHeader, canonicalField, index]);
      existing.add(sourceHeader);
      nextKey += 1;
    }
  }
  execute(database, `
    INSERT INTO application_settings (setting_key, setting_value)
    VALUES ('personnel_import_next_column_key', ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = CURRENT_TIMESTAMP
  `, [String(nextKey)]);
}

function updatePersonnelColumnPlaceholder(database, columnKey, label) {
  const cleanLabel = String(label ?? '').trim();
  if (!cleanLabel || cleanLabel.length > 100) {
    throw new Error('أدخل اسماً للمتغير من 1 إلى 100 حرف.');
  }
  const statement = database.sqlite.prepare(`
    UPDATE personnel_import_columns
    SET placeholder_label = ?
    WHERE column_key = ?
  `);
  statement.run([cleanLabel, columnKey]);
  const changed = database.sqlite.getRowsModified();
  statement.free();
  if (!changed) throw new Error('عمود Excel غير موجود.');
  persistDatabase(database);
  return listPersonnelColumns(database);
}

function importPersonnel(database, records, monthKey, headers = []) {
  if (monthKey) {
    validateMonthKey(monthKey);
    ensureFinancialPeriodOpen(database, monthKey);
  }
  const archived = monthKey ? getArchive(database, monthKey) : null;
  const insert = database.sqlite.prepare(`
    INSERT INTO personnel (military_number, full_name, rank, category, unit, notes, source_data_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(military_number) DO UPDATE SET
      full_name = excluded.full_name,
      rank = excluded.rank,
      category = excluded.category,
      unit = excluded.unit,
      notes = excluded.notes,
      source_data_json = excluded.source_data_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    if (records.length) registerPersonnelColumns(database, headers);
    for (const row of records) {
      const [existing] = readRows(database,
        'SELECT source_data_json FROM personnel WHERE military_number = ?',
        [row.military_number]);
      const sourceData = row.sourceData
        && typeof row.sourceData === 'object'
        && !Array.isArray(row.sourceData)
        ? row.sourceData
        : parseJson(existing?.source_data_json, {});
      insert.run([
        row.military_number,
        row.full_name,
        row.rank,
        row.category,
        row.unit,
        row.notes,
        JSON.stringify(sourceData)
      ]);
      insert.reset();
    }
    if (archived && records.length > 0) {
      execute(database, `
        INSERT INTO monthly_archive_audit (month_key, action, details)
        VALUES (?, 'data_changed', ?)
      `, [monthKey, `personnel-imported count=${records.length}`]);
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  } finally {
    insert.free();
  }
  persistDatabase(database);
  return records.length;
}

function readRows(database, sql, parameters = []) {
  const statement = database.sqlite.prepare(sql);
  const rows = [];
  try {
    statement.bind(parameters);
    while (statement.step()) rows.push(statement.getAsObject());
  } finally {
    statement.free();
  }
  return rows;
}

function execute(database, sql, parameters = []) {
  const statement = database.sqlite.prepare(sql);
  try {
    statement.run(parameters);
  } finally {
    statement.free();
  }
}

function parseFieldDefinitions(fieldsJson) {
  const parsed = JSON.parse(fieldsJson || '[]');
  const fields = Array.isArray(parsed) ? parsed : parsed?.fields;
  return Array.isArray(fields) ? fields.map((field, index) => ({
    ...field,
    key: String(field.key || `field_${index + 1}`),
    label: String(field.label || `حقل ${index + 1}`),
    type: field.type || 'text'
  })) : [];
}

function serializeFieldDefinitions(fields) {
  return JSON.stringify({ version: Number(SECTION_ENGINE_VERSION), fields });
}

function insertDropdownOption(database, {
  groupId,
  scopeId = '',
  value,
  label,
  sortOrder,
  isSystem
}) {
  execute(database, `
    INSERT OR IGNORE INTO dropdown_options (
      option_id, group_id, scope_id, option_value, label, sort_order, is_active, is_system
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `, [randomUUID(), groupId, scopeId, value, label, sortOrder, isSystem ? 1 : 0]);
}

function ensureActionTypeOptions(database, moduleId) {
  const existing = readRows(database, `
    SELECT option_id FROM dropdown_options WHERE group_id = 'action_type' AND scope_id = ?
  `, [moduleId]);
  if (existing.length) return;
  DEFAULT_ACTION_TYPES.forEach((value, index) => insertDropdownOption(database, {
    groupId: 'action_type',
    scopeId: moduleId,
    value: randomUUID(),
    label: value,
    sortOrder: index,
    isSystem: false
  }));
}

function seedDropdownOptions(database) {
  for (const [groupId, options] of Object.entries(DEFAULT_DROPDOWN_OPTIONS)) {
    options.forEach(([value, label], index) => insertDropdownOption(database, {
      groupId,
      value,
      label,
      sortOrder: index,
      isSystem: true
    }));
  }
  const actionModules = readRows(database, `
    SELECT id FROM custom_modules
    WHERE id NOT IN ('home', 'personnel', 'salaries', 'supplies', 'invoices', 'templates')
  `);
  for (const { id } of actionModules) ensureActionTypeOptions(database, id);
}

function migrateActionTypeValues(database) {
  const options = readRows(database, `
    SELECT scope_id, option_value, label
    FROM dropdown_options WHERE group_id = 'action_type'
  `);
  for (const option of options) {
    if (option.scope_id === 'penalties') {
      execute(database, `
        UPDATE penalties SET penalty_type = ? WHERE penalty_type = ?
      `, [option.option_value, option.label]);
      execute(database, `
        UPDATE text_templates SET kind = ?, updated_at = CURRENT_TIMESTAMP
        WHERE scope = 'penalties' AND kind = ?
      `, [option.option_value, option.label]);
    }
    const submodules = readRows(database, `
      SELECT id FROM custom_submodules WHERE module_id = ?
    `, [option.scope_id]);
    if (submodules.length) {
      const placeholders = submodules.map(() => '?').join(', ');
      const ids = submodules.map((submodule) => submodule.id);
      execute(database, `
        UPDATE submodule_records SET action_type = ?
        WHERE action_type = ? AND submodule_id IN (${placeholders})
      `, [option.option_value, option.label, ...ids]);
      execute(database, `
        UPDATE text_templates SET kind = ?, updated_at = CURRENT_TIMESTAMP
        WHERE kind = ? AND scope IN (${placeholders})
      `, [option.option_value, option.label, ...ids]);
    }
  }
}

function listDropdownOptions(database, { includeInactive = true } = {}) {
  return readRows(database, `
    SELECT option_id, group_id, scope_id, option_value, label, sort_order, is_active, is_system
    FROM dropdown_options
    ${includeInactive ? '' : 'WHERE is_active = 1'}
    ORDER BY group_id, scope_id, sort_order, label COLLATE NOCASE, option_id
  `);
}

function findActionTypeOption(database, moduleId, value, { activeOnly = true } = {}) {
  const [option] = readRows(database, `
    SELECT option_id, option_value, label, is_active FROM dropdown_options
    WHERE group_id = 'action_type' AND scope_id = ?
      AND (option_value = ? OR label = ?)
      ${activeOnly ? 'AND is_active = 1' : ''}
    ORDER BY CASE WHEN option_value = ? THEN 0 ELSE 1 END
    LIMIT 1
  `, [moduleId, value, value, value]);
  return option ?? null;
}

function addActionTypeOption(database, { moduleId, label }) {
  const cleanLabel = typeof label === 'string' ? label.trim() : '';
  if (!cleanLabel || cleanLabel.length > 80) throw new Error('اسم الخيار يجب أن يتراوح بين 1 و80 حرفاً.');
  if (!readRows(database, 'SELECT id FROM custom_modules WHERE id = ?', [moduleId]).length) {
    throw new Error('القسم المحدد غير موجود.');
  }
  ensureActionTypeOptions(database, moduleId);
  if (readRows(database, `
    SELECT option_id FROM dropdown_options
    WHERE group_id = 'action_type' AND scope_id = ? AND option_value = ?
  `, [moduleId, cleanLabel]).length) {
    throw new Error('هذا الخيار موجود بالفعل في قائمة القسم.');
  }
  const [{ next_order: sortOrder }] = readRows(database, `
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
    FROM dropdown_options WHERE group_id = 'action_type' AND scope_id = ?
  `, [moduleId]);
  insertDropdownOption(database, {
    groupId: 'action_type',
    scopeId: moduleId,
    value: randomUUID(),
    label: cleanLabel,
    sortOrder,
    isSystem: false
  });
  persistDatabase(database);
  return listDropdownOptions(database);
}

function updateDropdownOption(database, { optionId, label }) {
  const cleanLabel = typeof label === 'string' ? label.trim() : '';
  if (!cleanLabel || cleanLabel.length > 80) throw new Error('اسم الخيار يجب أن يتراوح بين 1 و80 حرفاً.');
  const [option] = readRows(database, `
    SELECT option_id, group_id, scope_id, option_value, is_system
    FROM dropdown_options WHERE option_id = ?
  `, [optionId]);
  if (!option) throw new Error('الخيار المحدد غير موجود.');
  if (option.group_id === 'action_type' && readRows(database, `
    SELECT option_id FROM dropdown_options
    WHERE group_id = 'action_type' AND scope_id = ? AND label = ? AND option_id <> ?
  `, [option.scope_id, cleanLabel, optionId]).length) {
    throw new Error('يوجد خيار آخر بهذا الاسم في القائمة.');
  }
  execute(database, 'UPDATE dropdown_options SET label = ? WHERE option_id = ?', [cleanLabel, optionId]);
  persistDatabase(database);
  return listDropdownOptions(database);
}

function setDropdownOptionActive(database, { optionId, isActive }) {
  const [option] = readRows(database, `
    SELECT option_id, group_id, scope_id, is_active
    FROM dropdown_options WHERE option_id = ?
  `, [optionId]);
  if (!option) throw new Error('الخيار المحدد غير موجود.');
  const active = Boolean(isActive) ? 1 : 0;
  if (!active && option.is_active === 1) {
    const [{ active_count: activeCount }] = readRows(database, `
      SELECT COUNT(*) AS active_count FROM dropdown_options
      WHERE group_id = ? AND scope_id = ? AND is_active = 1
    `, [option.group_id, option.scope_id]);
    if (Number(activeCount) <= 1) throw new Error('يجب إبقاء خيار واحد على الأقل ظاهراً في القائمة.');
  }
  execute(database, 'UPDATE dropdown_options SET is_active = ? WHERE option_id = ?', [active, optionId]);
  persistDatabase(database);
  return listDropdownOptions(database);
}

function reorderDropdownOptions(database, { groupId, scopeId = '', optionIds }) {
  if (!Array.isArray(optionIds) || !optionIds.length || new Set(optionIds).size !== optionIds.length) {
    throw new Error('ترتيب الخيارات غير صالح.');
  }
  const actual = readRows(database, `
    SELECT option_id FROM dropdown_options WHERE group_id = ? AND scope_id = ?
  `, [groupId, scopeId]).map((row) => row.option_id);
  if (actual.length !== optionIds.length || optionIds.some((id) => !actual.includes(id))) {
    throw new Error('يجب أن يتضمن الترتيب جميع خيارات هذه القائمة فقط.');
  }
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    optionIds.forEach((optionId, index) => execute(database, `
      UPDATE dropdown_options SET sort_order = ? WHERE option_id = ?
    `, [index, optionId]));
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
  return listDropdownOptions(database);
}

function listModules(database, { includeHidden = true } = {}) {
  const modules = readRows(database, `
    SELECT id, title, icon, is_builtin, sort_order, template_path, is_active, updated_at
    FROM custom_modules
    ${includeHidden ? '' : 'WHERE is_active = 1'}
    ORDER BY sort_order, title COLLATE NOCASE
  `);
  for (const module of modules) {
    module.submodules = readRows(database, `
      SELECT id, module_id, title, fields_json, template_path, sort_order, is_active, updated_at
      FROM custom_submodules WHERE module_id = ? ${includeHidden ? '' : 'AND is_active = 1'}
      ORDER BY sort_order, title COLLATE NOCASE
    `, [module.id]).map((submodule) => ({
      ...submodule,
      fieldsVersion: Number(SECTION_ENGINE_VERSION),
      fields: parseFieldDefinitions(submodule.fields_json)
    }));
  }
  return modules;
}

function nextConfigurableModuleOrder(database) {
  const [row] = readRows(database, `
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
    FROM custom_modules
    WHERE is_builtin = 0 OR id IN (?, ?, ?)
  `, CONFIGURABLE_CORE_MODULE_IDS);
  return Number(row.next_order);
}

function addModule(database, { id, title }) {
  execute(database, `
    INSERT INTO custom_modules (id, title) VALUES (?, ?)
  `, [id, title]);
  ensureActionTypeOptions(database, id);
  persistDatabase(database);
}

function listSectionPresets() {
  return sectionPresets.map(({ id, title }) => ({ id, title }));
}

function createModuleWithPreset(database, {
  id,
  title,
  icon = '▦',
  submoduleId = randomUUID(),
  presetId = ''
}) {
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle || cleanTitle.length > 80) throw new Error('أدخل اسم قسم من 1 إلى 80 حرفاً.');
  if (readRows(database, 'SELECT id FROM custom_modules WHERE title = ? COLLATE NOCASE', [cleanTitle]).length) {
    throw new Error('يوجد قسم بهذا الاسم بالفعل.');
  }
  const preset = presetId ? sectionPresets.find((item) => item.id === presetId) : null;
  if (presetId && !preset) throw new Error('النموذج الجاهز المحدد غير موجود.');
  const fields = preset ? normalizeFieldDefinitions(preset.fields) : null;
  const sortOrder = nextConfigurableModuleOrder(database);
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    execute(database, `
      INSERT INTO custom_modules (id, title, icon, is_builtin, sort_order)
      VALUES (?, ?, ?, 0, ?)
    `, [id, cleanTitle, icon, sortOrder]);
    ensureActionTypeOptions(database, id);
    if (preset) {
      execute(database, `
        INSERT INTO custom_submodules (id, module_id, title, fields_json, sort_order)
        VALUES (?, ?, ?, ?, 0)
      `, [submoduleId, id, preset.submoduleTitle, serializeFieldDefinitions(fields)]);
      for (const [index, template] of preset.templates.entries()) {
        execute(database, `
          INSERT INTO text_templates (scope, kind, title, body, requires_days, sort_order)
          VALUES (?, '', ?, ?, ?, ?)
        `, [submoduleId, template.title, template.body, template.requiresDays ? 1 : 0, index]);
      }
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    if (/UNIQUE constraint failed: custom_modules\.title/i.test(error.message)) {
      throw new Error('يوجد قسم بهذا الاسم بالفعل.');
    }
    throw error;
  }
  persistDatabase(database);
  return { moduleId: id, submoduleId: preset ? submoduleId : null };
}

function updateModule(database, { moduleId, title, icon }) {
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle || cleanTitle.length > 80) throw new Error('أدخل اسم قسم من 1 إلى 80 حرفاً.');
  if (readRows(database, 'SELECT id FROM custom_modules WHERE title = ? COLLATE NOCASE AND id <> ?', [cleanTitle, moduleId]).length) {
    throw new Error('يوجد قسم آخر بهذا الاسم.');
  }
  execute(database, `
    UPDATE custom_modules SET title = ?, icon = COALESCE(?, icon), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND is_builtin = 0
  `, [cleanTitle, icon || null, moduleId]);
  if (!database.sqlite.getRowsModified()) throw new Error('القسم غير موجود أو لا يمكن تعديله.');
  persistDatabase(database);
}

function archiveModule(database, moduleId) {
  execute(database, `
    UPDATE custom_modules SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND (is_builtin = 0 OR id IN (?, ?, ?))
  `, [moduleId, ...CONFIGURABLE_CORE_MODULE_IDS]);
  if (!database.sqlite.getRowsModified()) throw new Error('القسم غير موجود أو لا يمكن إخفاؤه.');
  persistDatabase(database);
}

function restoreModule(database, moduleId) {
  execute(database, `
    UPDATE custom_modules SET is_active = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND (is_builtin = 0 OR id IN (?, ?, ?))
  `, [moduleId, ...CONFIGURABLE_CORE_MODULE_IDS]);
  if (!database.sqlite.getRowsModified()) throw new Error('القسم غير موجود.');
  persistDatabase(database);
}

function reorderModules(database, orderedModuleIds) {
  if (!Array.isArray(orderedModuleIds) || orderedModuleIds.some((id) => typeof id !== 'string')) {
    throw new Error('ترتيب الأقسام غير صالح.');
  }
  const allowedModuleIds = readRows(database, `
    SELECT id FROM custom_modules
    WHERE is_builtin = 0 OR id IN (?, ?, ?)
  `, CONFIGURABLE_CORE_MODULE_IDS).map((module) => module.id);
  const uniqueModuleIds = new Set(orderedModuleIds);
  if (uniqueModuleIds.size !== orderedModuleIds.length
    || uniqueModuleIds.size !== allowedModuleIds.length
    || allowedModuleIds.some((id) => !uniqueModuleIds.has(id))) {
    throw new Error('يجب أن يتضمن الترتيب كل الأقسام القابلة للتخصيص مرة واحدة.');
  }

  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    orderedModuleIds.forEach((moduleId, sortOrder) => {
      execute(database, `
        UPDATE custom_modules SET sort_order = ?
        WHERE id = ? AND (is_builtin = 0 OR id IN (?, ?, ?))
      `, [sortOrder, moduleId, ...CONFIGURABLE_CORE_MODULE_IDS]);
    });
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
}

function addSubmodule(database, { id, moduleId, title, fields }) {
  const normalizedFields = normalizeFieldDefinitions(fields);
  execute(database, `
    INSERT INTO custom_submodules (id, module_id, title, fields_json)
    VALUES (?, ?, ?, ?)
  `, [id, moduleId, title, serializeFieldDefinitions(normalizedFields)]);
  persistDatabase(database);
}

function normalizeFieldDefinitions(fields) {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 100) {
    throw new Error('يجب تعريف حقل واحد على الأقل، وبحد أقصى 100 حقل.');
  }
  const validTypes = new Set(['text', 'number', 'date', 'select', 'person', 'saved_value', 'template', 'linked_record', 'duration', 'percentage']);
  const keys = new Set();
  return fields.map((field, index) => {
    const key = String(field.key || `field_${index + 1}`);
    const label = String(field.label ?? '').trim();
    const type = String(field.type || 'text');
    if (!/^field_[1-9]\d*$/.test(key) && !/^[a-zA-Z][\w-]{0,79}$/.test(key)) {
      throw new Error('مفتاح أحد الحقول غير صالح.');
    }
    if (keys.has(key)) throw new Error('مفاتيح الحقول يجب أن تكون فريدة.');
    if (!label || label.length > 80) throw new Error('يجب أن يكون لكل حقل اسم من 1 إلى 80 حرفاً.');
    if (!validTypes.has(type)) throw new Error(`نوع الحقل «${type}» غير مدعوم.`);
    keys.add(key);
    const normalized = { ...field, key, label, type };
    normalized.required = Boolean(field.required);
    if (type === 'select') {
      normalized.options = Array.isArray(field.options)
        ? field.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 100)
        : [];
      if (!normalized.options.length) throw new Error(`أدخل اختيارات ثابتة للحقل «${label}».`);
    }
    if (type === 'person') {
      const personCategory = String(field.personCategory ?? 'all').trim();
      if (!personCategory || personCategory.length > 80) {
        throw new Error(`فئة الأفراد للحقل «${label}» غير صالحة.`);
      }
      normalized.personCategory = personCategory;
    }
    return normalized;
  });
}

function updateSubmodule(database, { submoduleId, title, fields }) {
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle || cleanTitle.length > 80) throw new Error('أدخل اسم نموذج فرعي من 1 إلى 80 حرفاً.');
  const [existing] = readRows(database, 'SELECT module_id FROM custom_submodules WHERE id = ?', [submoduleId]);
  if (!existing) throw new Error('النموذج الفرعي غير موجود.');
  if (readRows(database, 'SELECT id FROM custom_submodules WHERE module_id = ? AND title = ? COLLATE NOCASE AND id <> ?',
    [existing.module_id, cleanTitle, submoduleId]).length) {
    throw new Error('يوجد نموذج فرعي آخر بهذا الاسم في القسم.');
  }
  const normalizedFields = normalizeFieldDefinitions(fields);
  execute(database, `
    UPDATE custom_submodules SET title = ?, fields_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [cleanTitle, serializeFieldDefinitions(normalizedFields), submoduleId]);
  if (!database.sqlite.getRowsModified()) throw new Error('النموذج الفرعي غير موجود.');
  persistDatabase(database);
}

function archiveSubmodule(database, submoduleId) {
  execute(database, `
    UPDATE custom_submodules SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `, [submoduleId]);
  if (!database.sqlite.getRowsModified()) throw new Error('النموذج الفرعي غير موجود.');
  persistDatabase(database);
}

function deleteSubmodule(database, submoduleId) {
  if (!readRows(database, 'SELECT id FROM custom_submodules WHERE id = ?', [submoduleId]).length) {
    throw new Error('النموذج الفرعي غير موجود.');
  }
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    execute(database, `
      DELETE FROM record_archives
      WHERE entity_type = 'submodule_record'
        AND record_id IN (
          SELECT CAST(id AS TEXT) FROM submodule_records WHERE submodule_id = ?
        )
    `, [submoduleId]);
    execute(database, 'DELETE FROM document_templates WHERE submodule_id = ?', [submoduleId]);
    execute(database, 'DELETE FROM text_templates WHERE scope = ?', [submoduleId]);
    execute(database, 'DELETE FROM custom_submodules WHERE id = ?', [submoduleId]);
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
}

function restoreSubmodule(database, submoduleId) {
  execute(database, `UPDATE custom_submodules SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [submoduleId]);
  if (!database.sqlite.getRowsModified()) throw new Error('النموذج الفرعي غير موجود.');
  persistDatabase(database);
}

function exportModuleDefinition(database, moduleId) {
  const module = listModules(database).find((item) => item.id === moduleId);
  if (!module || module.is_builtin === 1) throw new Error('القسم غير موجود أو لا يمكن تصديره.');
  return {
    format: 'maly-section-definition',
    version: 1,
    title: module.title,
    icon: module.icon,
    submodules: module.submodules.map((submodule) => ({
      title: submodule.title,
      fields: submodule.fields,
      templates: readRows(database, `
        SELECT kind, title, body, requires_days, sort_order, is_active
        FROM text_templates WHERE scope = ?
        ORDER BY sort_order, title COLLATE NOCASE
      `, [submodule.id])
    }))
  };
}

function importModuleDefinition(database, definition, titleOverride = null) {
  if (!definition || definition.format !== 'maly-section-definition' || definition.version !== 1) {
    throw new Error('ملف تعريف القسم غير مدعوم أو تالف.');
  }
  const title = String(titleOverride ?? definition.title ?? '').trim();
  if (!title || title.length > 80) throw new Error('أدخل اسم قسم من 1 إلى 80 حرفاً.');
  if (readRows(database, 'SELECT id FROM custom_modules WHERE title = ? COLLATE NOCASE', [title]).length) {
    throw new Error('يوجد قسم بهذا الاسم بالفعل؛ اختر اسماً مختلفاً قبل الاستيراد.');
  }
  if (!Array.isArray(definition.submodules) || !definition.submodules.length || definition.submodules.length > 100) {
    throw new Error('ملف القسم يجب أن يحتوي من نموذج فرعي واحد إلى 100 نموذج.');
  }
  const moduleId = randomUUID();
  const sortOrder = nextConfigurableModuleOrder(database);
  const submodules = definition.submodules.map((item) => {
    const submoduleTitle = String(item?.title ?? '').trim();
    if (!submoduleTitle || submoduleTitle.length > 80) throw new Error('عنوان أحد النماذج الفرعية غير صالح.');
    return {
      id: randomUUID(),
      title: submoduleTitle,
      fields: normalizeFieldDefinitions(item.fields),
      templates: Array.isArray(item.templates) ? item.templates : []
    };
  });
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    execute(database, `
      INSERT INTO custom_modules (id, title, icon, is_builtin, sort_order)
      VALUES (?, ?, ?, 0, ?)
    `, [moduleId, title, String(definition.icon || '▦').slice(0, 8), sortOrder]);
    ensureActionTypeOptions(database, moduleId);
    for (const submodule of submodules) {
      execute(database, `
        INSERT INTO custom_submodules (id, module_id, title, fields_json, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `, [submodule.id, moduleId, submodule.title, serializeFieldDefinitions(submodule.fields), submodules.indexOf(submodule)]);
      for (const template of submodule.templates) {
        const valid = validateTextTemplate(database, {
          ...template,
          scope: submodule.id,
          sortOrder: template.sort_order ?? 100
        });
        execute(database, `
          INSERT INTO text_templates (scope, kind, title, body, requires_days, sort_order, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [submodule.id, valid.kind, valid.title, valid.body, valid.requiresDays, valid.sortOrder, template.is_active === 0 ? 0 : 1]);
      }
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
  return { moduleId, modules: listModules(database) };
}

function copyModule(database, moduleId, title) {
  const definition = exportModuleDefinition(database, moduleId);
  return importModuleDefinition(database, definition, title);
}

function setModuleTemplate(database, moduleId, templatePath) {
  const statement = database.sqlite.prepare(`
    UPDATE custom_modules SET template_path = ? WHERE id = ?
  `);
  statement.run([templatePath, moduleId]);
  const changed = database.sqlite.getRowsModified();
  statement.free();
  if (!changed) throw new Error('القسم الرئيسي غير موجود.');
  persistDatabase(database);
}

function setSubmoduleTemplate(database, submoduleId, templatePath) {
  const statement = database.sqlite.prepare(`
    UPDATE custom_submodules SET template_path = ? WHERE id = ?
  `);
  statement.run([templatePath, submoduleId]);
  const changed = database.sqlite.getRowsModified();
  statement.free();
  if (!changed) throw new Error('القسم الفرعي غير موجود.');
  persistDatabase(database);
}

function listDocumentTemplates(database, { includeArchived = true } = {}) {
  return readRows(database, `
    SELECT t.id, t.module_id, t.submodule_id, t.title, t.content_html,
      t.is_active, t.created_at, t.updated_at,
      m.title AS module_title, s.title AS submodule_title
    FROM document_templates t
    JOIN custom_modules m ON m.id = t.module_id
    LEFT JOIN custom_submodules s ON s.id = t.submodule_id
    ${includeArchived ? '' : 'WHERE t.is_active = 1'}
    ORDER BY m.sort_order, m.title COLLATE NOCASE, s.sort_order, t.title COLLATE NOCASE
  `);
}

function getDocumentTemplate(database, templateId) {
  return readRows(database, `
    SELECT t.id, t.module_id, t.submodule_id, t.title, t.content_html,
      t.is_active, t.created_at, t.updated_at,
      m.title AS module_title, s.title AS submodule_title
    FROM document_templates t
    JOIN custom_modules m ON m.id = t.module_id
    LEFT JOIN custom_submodules s ON s.id = t.submodule_id
    WHERE t.id = ?
  `, [templateId])[0] ?? null;
}

function saveDocumentTemplate(database, input) {
  const id = String(input?.id || randomUUID());
  const moduleId = String(input?.moduleId || '');
  const submoduleId = String(input?.submoduleId || '');
  const title = String(input?.title || '').trim();
  const contentHtml = String(input?.contentHtml || '');
  if (!title || title.length > 120) throw new Error('أدخل عنواناً للقالب من 1 إلى 120 حرفاً.');
  if (!contentHtml.trim() || contentHtml.length > 500000) throw new Error('محتوى القالب فارغ أو يتجاوز الحد المسموح.');
  if (!readRows(database, 'SELECT id FROM custom_modules WHERE id = ?', [moduleId]).length) {
    throw new Error('القسم الرئيسي المرتبط بالقالب غير موجود.');
  }
  if (submoduleId && !readRows(database,
    'SELECT id FROM custom_submodules WHERE id = ? AND module_id = ?',
    [submoduleId, moduleId]).length) {
    throw new Error('القسم الفرعي لا يتبع القسم الرئيسي المحدد.');
  }
  execute(database, `
    INSERT INTO document_templates (id, module_id, submodule_id, title, content_html)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      module_id = excluded.module_id,
      submodule_id = excluded.submodule_id,
      title = excluded.title,
      content_html = excluded.content_html,
      is_active = 1,
      updated_at = CURRENT_TIMESTAMP
  `, [id, moduleId, submoduleId, title, contentHtml]);
  persistDatabase(database);
  return getDocumentTemplate(database, id);
}

function setDocumentTemplateActive(database, templateId, isActive) {
  const statement = database.sqlite.prepare(`
    UPDATE document_templates
    SET is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  statement.run([isActive ? 1 : 0, templateId]);
  const changed = database.sqlite.getRowsModified();
  statement.free();
  if (!changed) throw new Error('قالب المستند غير موجود.');
  persistDatabase(database);
  return listDocumentTemplates(database);
}

function getSubmodule(database, submoduleId) {
  const [submodule] = readRows(database, `
    SELECT id, module_id, title, fields_json, template_path
    FROM custom_submodules WHERE id = ?
  `, [submoduleId]);
  if (!submodule) return null;
  return { ...submodule, fieldsVersion: Number(SECTION_ENGINE_VERSION), fields: parseFieldDefinitions(submodule.fields_json) };
}

function listSubmoduleRecords(database, submoduleId, monthKey) {
  return readRows(database, `
    SELECT r.id, r.data_json, r.created_at, r.period_key, r.military_number,
      p.full_name, p.rank, COALESCE(action_option.option_value, r.action_type) AS action_type_id,
      COALESCE(action_option.label, r.action_type) AS action_type,
      r.action_days, r.action_reason,
      r.action_date, r.clause_no
    FROM submodule_records r
    JOIN custom_submodules s ON s.id = r.submodule_id
    JOIN custom_modules m ON m.id = s.module_id
    LEFT JOIN personnel p ON p.military_number = r.military_number
    LEFT JOIN dropdown_options action_option
      ON action_option.group_id = 'action_type'
      AND action_option.scope_id = m.id
      AND (action_option.option_value = r.action_type OR action_option.label = r.action_type)
    WHERE r.submodule_id = ? AND r.period_key = ?
      AND NOT EXISTS (
        SELECT 1 FROM record_archives a
        WHERE a.entity_type = 'submodule_record'
          AND a.record_id = CAST(r.id AS TEXT)
          AND a.period_key = r.period_key
      )
    ORDER BY r.id DESC
  `, [submoduleId, monthKey]).map((record) => ({
    id: record.id,
    data: JSON.parse(record.data_json),
    created_at: record.created_at,
    period_key: record.period_key,
    military_number: record.military_number,
    full_name: record.full_name,
    rank: record.rank,
    action_type: record.action_type,
    action_type_id: record.action_type_id,
    action_days: record.action_days,
    action_reason: record.action_reason,
    action_date: record.action_date,
    clause_no: record.clause_no,
    is_locked: isFinancialPeriodLocked(database, record.period_key) ? 1 : 0
  }));
}

function isValidLinkedRecord(database, value, submoduleId, monthKey) {
  const penaltyMatch = /^penalty:(\d+)$/.exec(value);
  if (penaltyMatch) {
    const penaltyId = Number(penaltyMatch[1]);
    if (!Number.isSafeInteger(penaltyId)) return false;
    return readRows(database,
      `SELECT p.id FROM penalties p
       WHERE p.id = ? AND p.period_key = ?
         AND NOT EXISTS (
           SELECT 1 FROM record_archives a
           WHERE a.entity_type = 'penalty' AND a.record_id = CAST(p.id AS TEXT) AND a.period_key = p.period_key
         )`,
      [penaltyId, monthKey]).length > 0;
  }
  if (!/^\d+$/.test(value)) return false;
  const recordId = Number(value);
  if (!Number.isSafeInteger(recordId)) return false;
  return readRows(database,
    `SELECT r.id FROM submodule_records r
     WHERE r.id = ? AND r.submodule_id <> ?
       AND NOT EXISTS (
         SELECT 1 FROM record_archives a
         WHERE a.entity_type = 'submodule_record' AND a.record_id = CAST(r.id AS TEXT) AND a.period_key = r.period_key
       )`,
    [recordId, submoduleId]).length > 0;
}

function normalizeLinkedMilitaryNumber(database, militaryNumber) {
  const cleanMilitaryNumber = String(militaryNumber ?? '').trim();
  if (!cleanMilitaryNumber) return null;
  if (!readRows(database, 'SELECT military_number FROM personnel WHERE military_number = ?', [cleanMilitaryNumber]).length) {
    throw new Error('الفرد المختار غير موجود في سجل الأفراد.');
  }
  return cleanMilitaryNumber;
}

function addSubmoduleRecord(database, { submoduleId, data, monthKey, action = null, clauseNo = '', militaryNumber = null }) {
  const [recordId] = addSubmoduleRecords(database, {
    submoduleId,
    records: [{ data, action, clauseNo, militaryNumber }],
    monthKey
  });
  return recordId;
}

function addSubmoduleRecords(database, { submoduleId, records, monthKey }) {
  validateMonthKey(monthKey);
  ensureFinancialPeriodOpen(database, monthKey);
  const submodule = getSubmodule(database, submoduleId);
  if (!submodule) throw new Error('القسم الفرعي غير موجود.');
  if (!Array.isArray(records) || records.length < 1 || records.length > 500) {
    throw new Error('اختر سجلاً واحداً على الأقل، وبحد أقصى 500 سجل في الدفعة.');
  }
  const allowedKeys = new Set(submodule.fields.map((field) => field.key));
  const normalizedRecords = records.map(({ data, action, clauseNo = '', militaryNumber = null }) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('بيانات السجل غير صالحة.');
    if (Object.keys(data).some((key) => !allowedKeys.has(key))) throw new Error('يتضمن السجل حقلاً غير معرّف.');
    const linkedMilitaryNumber = normalizeLinkedMilitaryNumber(database, militaryNumber);
    const normalizedData = Object.fromEntries(submodule.fields.map((field) => {
      const value = String(data[field.key] ?? '').trim();
      if (value.length > 4000) throw new Error(`قيمة الحقل «${field.label}» تتجاوز 4000 حرف.`);
      if (field.required && !value) throw new Error(`الحقل «${field.label}» مطلوب.`);
      if (value && ['number', 'duration', 'percentage'].includes(field.type) && !Number.isFinite(Number(value))) {
        throw new Error(`أدخل رقماً صحيحاً في الحقل «${field.label}».`);
      }
      if (value && field.type === 'duration' && (Number(value) < 0 || !Number.isSafeInteger(Number(value)))) {
        throw new Error(`المدة في الحقل «${field.label}» يجب أن تكون عدداً صحيحاً غير سالب.`);
      }
      if (value && field.type === 'person') {
        const person = readRows(database, 'SELECT category FROM personnel WHERE military_number = ?', [value])[0];
        if (!person) throw new Error(`الفرد المحدد في «${field.label}» غير موجود.`);
        if (field.personCategory && field.personCategory !== 'all' && person.category !== field.personCategory) {
          throw new Error(`الفرد المحدد لا يطابق الفئة المطلوبة في «${field.label}».`);
        }
      }
      if (value && field.type === 'date') validatePeriodDate(value, field.label);
      if (value && field.type === 'select' && !field.options.includes(value)) {
        throw new Error(`القيمة المحددة في «${field.label}» غير موجودة ضمن الاختيارات.`);
      }
      if (value && field.type === 'linked_record') {
        if (!isValidLinkedRecord(database, value, submoduleId, monthKey)) {
          throw new Error(`السجل المرتبط في «${field.label}» غير موجود أو غير صالح.`);
        }
      }
      return [field.key, value];
    }));
    const actionFields = action ? validateActionRecord(database, monthKey, action, submodule.module_id) : null;
    const cleanClauseNo = String(clauseNo || actionFields?.clauseNo || '').trim();
    if (!cleanClauseNo || cleanClauseNo.length > 100) {
      throw new Error('رقم بند الأمر مطلوب ويجب ألا يتجاوز 100 حرف.');
    }
    if (actionFields && actionFields.clauseNo !== cleanClauseNo) {
      throw new Error('رقم بند الأمر في السجل والإجراء يجب أن يتطابق.');
    }
    const personField = submodule.fields.find((field) => field.type === 'person');
    const personFieldMilitaryNumber = personField ? normalizedData[personField.key] || null : null;
    if (linkedMilitaryNumber && personFieldMilitaryNumber && linkedMilitaryNumber !== personFieldMilitaryNumber) {
      throw new Error('الفرد المختار لا يطابق الفرد الموجود في حقل النموذج.');
    }
    if (linkedMilitaryNumber && actionFields?.militaryNumber && linkedMilitaryNumber !== actionFields.militaryNumber) {
      throw new Error('الفرد المختار لا يطابق الفرد المرتبط بالإجراء.');
    }
    const recordMilitaryNumber = actionFields?.militaryNumber
      || personFieldMilitaryNumber
      || linkedMilitaryNumber;
    if (Object.values(normalizedData).every((value) => !value) && !recordMilitaryNumber) {
      throw new Error('اختر فرداً من سجل الأفراد أو أدخل بيانات في حقل واحد على الأقل.');
    }
    const savedValues = submodule.fields
      .filter((field) => field.type === 'saved_value' && normalizedData[field.key])
      .map((field) => [field.key, normalizedData[field.key]]);
    return { data: normalizedData, actionFields, clauseNo: cleanClauseNo, militaryNumber: recordMilitaryNumber, savedValues };
  });
  const archived = getArchive(database, monthKey);
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  const recordIds = [];
  try {
    const insert = database.sqlite.prepare(`
      INSERT INTO submodule_records (
        submodule_id, data_json, period_key, military_number, action_type,
        action_days, action_reason, action_date, clause_no
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      for (const row of normalizedRecords) {
        for (const [fieldKey, value] of row.savedValues) {
          execute(database, `
            INSERT INTO custom_field_values (submodule_id, field_key, value)
            VALUES (?, ?, ?)
            ON CONFLICT(submodule_id, field_key, value)
            DO UPDATE SET last_used_at = CURRENT_TIMESTAMP
          `, [submoduleId, fieldKey, value]);
        }
        insert.run([
          submoduleId,
          JSON.stringify(row.data),
          monthKey,
          row.militaryNumber,
          row.actionFields?.penaltyType ?? null,
          row.actionFields?.days ?? null,
          row.actionFields?.reason ?? null,
          row.actionFields?.actionDate ?? null,
          row.clauseNo
        ]);
        const [record] = readRows(database, 'SELECT last_insert_rowid() AS id');
        recordIds.push(record.id);
        execute(database, `
          INSERT INTO audit_log (entity_type, entity_id, action, period_key, details_json)
          VALUES ('submodule_record', ?, 'created', ?, ?)
        `, [String(record.id), monthKey, JSON.stringify({
          submoduleId,
          data: row.data,
          militaryNumber: row.militaryNumber
        })]);
      }
    } finally {
      insert.free();
    }
    if (archived) {
      execute(database, `
        INSERT INTO monthly_archive_audit (month_key, action, details)
        VALUES (?, 'data_changed', ?)
      `, [monthKey, `submodule-records-added ids=${recordIds.join(',')}`]);
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
  return recordIds;
}

function updateSubmoduleRecord(database, { recordId, data, monthKey, clauseNo, militaryNumber }) {
  validateMonthKey(monthKey);
  ensureFinancialPeriodOpen(database, monthKey);
  const [existing] = readRows(database, `
    SELECT submodule_id, period_key, data_json, military_number FROM submodule_records WHERE id = ?
  `, [recordId]);
  if (!existing) throw new Error('السجل غير موجود.');
  if (existing.period_key !== monthKey) throw new Error('السجل لا ينتمي إلى الفترة المختارة.');
  const cleanClauseNo = typeof clauseNo === 'string' ? clauseNo.trim() : '';
  if (!cleanClauseNo || cleanClauseNo.length > 100) {
    throw new Error('رقم بند الأمر مطلوب ويجب ألا يتجاوز 100 حرف.');
  }
  const submodule = getSubmodule(database, existing.submodule_id);
  const allowedKeys = new Set(submodule.fields.map((field) => field.key));
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some((key) => !allowedKeys.has(key))) {
    throw new Error('بيانات السجل غير صالحة.');
  }
  const normalized = Object.fromEntries(submodule.fields.map((field) => {
    const value = String(data[field.key] ?? '').trim();
    if (value.length > 4000) throw new Error(`قيمة الحقل «${field.label}» تتجاوز 4000 حرف.`);
    if (field.required && !value) throw new Error(`الحقل «${field.label}» مطلوب.`);
    if (value && ['number', 'duration', 'percentage'].includes(field.type) && !Number.isFinite(Number(value))) {
      throw new Error(`أدخل رقماً صحيحاً في الحقل «${field.label}».`);
    }
    if (value && field.type === 'duration' && (Number(value) < 0 || !Number.isSafeInteger(Number(value)))) {
      throw new Error(`المدة في الحقل «${field.label}» يجب أن تكون عدداً صحيحاً غير سالب.`);
    }
    if (value && field.type === 'date') validatePeriodDate(value, field.label);
    if (value && field.type === 'select' && !field.options.includes(value)) {
      throw new Error(`القيمة المحددة في «${field.label}» غير موجودة ضمن الاختيارات.`);
    }
    if (value && field.type === 'person') {
      const person = readRows(database, 'SELECT category FROM personnel WHERE military_number = ?', [value])[0];
      if (!person || (field.personCategory && field.personCategory !== 'all' && person.category !== field.personCategory)) {
        throw new Error(`الفرد المحدد في «${field.label}» غير موجود أو لا يطابق الفئة المطلوبة.`);
      }
    }
    if (value && field.type === 'linked_record') {
      if (!isValidLinkedRecord(database, value, existing.submodule_id, monthKey)) {
        throw new Error(`السجل المرتبط في «${field.label}» غير موجود أو غير صالح.`);
      }
    }
    return [field.key, value];
  }));
  const personField = submodule.fields.find((field) => field.type === 'person');
  const personFieldNumber = personField ? normalized[personField.key] || null : null;
  const linkedMilitaryNumber = militaryNumber === undefined
    ? (personField ? personFieldNumber : existing.military_number)
    : normalizeLinkedMilitaryNumber(database, militaryNumber);
  if (linkedMilitaryNumber && personFieldNumber && linkedMilitaryNumber !== personFieldNumber) {
    throw new Error('الفرد المختار لا يطابق الفرد الموجود في حقل النموذج.');
  }
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    for (const field of submodule.fields.filter((item) => item.type === 'saved_value' && normalized[item.key])) {
      execute(database, `
        INSERT INTO custom_field_values (submodule_id, field_key, value)
        VALUES (?, ?, ?)
        ON CONFLICT(submodule_id, field_key, value)
        DO UPDATE SET last_used_at = CURRENT_TIMESTAMP
      `, [existing.submodule_id, field.key, normalized[field.key]]);
    }
    execute(database, `
      UPDATE submodule_records SET data_json = ?, military_number = ?, clause_no = ? WHERE id = ?
    `, [JSON.stringify(normalized), linkedMilitaryNumber, cleanClauseNo, recordId]);
    execute(database, `
      INSERT INTO audit_log (entity_type, entity_id, action, period_key, details_json)
      VALUES ('submodule_record', ?, 'updated', ?, ?)
    `, [String(recordId), monthKey, JSON.stringify({
      submoduleId: existing.submodule_id,
      before: JSON.parse(existing.data_json),
      after: normalized,
      beforeMilitaryNumber: existing.military_number,
      afterMilitaryNumber: linkedMilitaryNumber
    })]);
    if (getArchive(database, monthKey)) {
      execute(database, `INSERT INTO monthly_archive_audit (month_key, action, details) VALUES (?, 'data_changed', ?)`,
        [monthKey, `submodule-record-updated id=${recordId}`]);
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
}

function deleteSubmoduleRecord(database, { recordId, monthKey }) {
  validateMonthKey(monthKey);
  ensureFinancialPeriodOpen(database, monthKey);
  const [existing] = readRows(database, `
    SELECT submodule_id, period_key, data_json FROM submodule_records WHERE id = ?
  `, [recordId]);
  if (!existing) throw new Error('السجل غير موجود.');
  if (existing.period_key !== monthKey) throw new Error('السجل لا ينتمي إلى الفترة المختارة.');
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    execute(database, 'DELETE FROM submodule_records WHERE id = ?', [recordId]);
    execute(database, `
      INSERT INTO audit_log (entity_type, entity_id, action, period_key, details_json)
      VALUES ('submodule_record', ?, 'deleted', ?, ?)
    `, [String(recordId), monthKey, JSON.stringify({
      submoduleId: existing.submodule_id,
      before: JSON.parse(existing.data_json)
    })]);
    if (getArchive(database, monthKey)) {
      execute(database, `INSERT INTO monthly_archive_audit (month_key, action, details) VALUES (?, 'data_changed', ?)`,
        [monthKey, `submodule-record-deleted id=${recordId}`]);
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
}

function listSavedFieldValues(database, submoduleId, fieldKey, query = '') {
  const cleanQuery = String(query || '').trim();
  return readRows(database, `
    SELECT value FROM custom_field_values
    WHERE submodule_id = ? AND field_key = ? AND (? = '' OR value LIKE '%' || ? || '%')
    ORDER BY last_used_at DESC, value COLLATE NOCASE LIMIT 30
  `, [submoduleId, fieldKey, cleanQuery, cleanQuery]).map((row) => row.value);
}

function getSubmoduleRecord(database, recordId) {
  const [record] = readRows(database, `
    SELECT r.id, r.submodule_id, r.period_key, r.data_json, s.title, s.fields_json,
      COALESCE(s.template_path, m.template_path) AS template_path,
      r.military_number,
      p.full_name, p.rank, COALESCE(action_option.option_value, r.action_type) AS action_type_id,
      COALESCE(action_option.label, r.action_type) AS action_type,
      r.action_days, r.action_reason,
      r.action_date, r.clause_no
    FROM submodule_records r
    JOIN custom_submodules s ON s.id = r.submodule_id
    JOIN custom_modules m ON m.id = s.module_id
    LEFT JOIN personnel p ON p.military_number = r.military_number
    LEFT JOIN dropdown_options action_option
      ON action_option.group_id = 'action_type'
      AND action_option.scope_id = m.id
      AND (action_option.option_value = r.action_type OR action_option.label = r.action_type)
    WHERE r.id = ?
  `, [recordId]);
  return record
    ? {
      id: record.id,
      submoduleId: record.submodule_id,
      periodKey: record.period_key,
      data: JSON.parse(record.data_json),
      fields: parseFieldDefinitions(record.fields_json),
      title: record.title,
      templatePath: record.template_path,
      military_number: record.military_number,
      full_name: record.full_name,
      rank: record.rank,
      action_type: record.action_type,
      action_type_id: record.action_type_id,
      action_days: record.action_days,
      action_reason: record.action_reason,
      action_date: record.action_date,
      clause_no: record.clause_no
    }
    : null;
}

function validateActionRecord(database, monthKey, action, moduleId) {
  const {
    militaryNumber,
    penaltyType,
    days,
    reason,
    actionDate,
    clauseNo
  } = action;
  validatePenaltyFields(database, {
    monthKey,
    moduleId,
    militaryNumber,
    penaltyType,
    days,
    reason,
    actionDate,
    clauseNo
  });
  return {
    militaryNumber: militaryNumber.trim(),
    penaltyType: findActionTypeOption(database, moduleId, penaltyType).option_value,
    days,
    reason: reason.trim(),
    actionDate,
    clauseNo: clauseNo.trim()
  };
}

function getApplicationSetting(database, settingKey) {
  const [setting] = readRows(database, `
    SELECT setting_value FROM application_settings WHERE setting_key = ?
  `, [settingKey]);
  return setting?.setting_value ?? null;
}

function setApplicationSetting(database, settingKey, settingValue) {
  if (typeof settingKey !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(settingKey)) {
    throw new Error('مفتاح إعداد التطبيق غير صالح.');
  }
  if (typeof settingValue !== 'string' || settingValue.length > 2048) {
    throw new Error('قيمة إعداد التطبيق غير صالحة.');
  }
  execute(database, `
    INSERT INTO application_settings (setting_key, setting_value)
    VALUES (?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = CURRENT_TIMESTAMP
  `, [settingKey, settingValue]);
  persistDatabase(database);
}

function getLegacySalaryScreenVisible(database) {
  return getApplicationSetting(database, 'legacy_salaries_screen_visible') !== '0';
}

function setLegacySalaryScreenVisible(database, visible) {
  if (typeof visible !== 'boolean') throw new Error('قيمة إظهار شاشة الماهيات غير صالحة.');
  setApplicationSetting(database, 'legacy_salaries_screen_visible', visible ? '1' : '0');
  return visible;
}

function validateMonthKey(monthKey) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new Error('صيغة الشهر غير صالحة.');
  }
}

function withDatabaseTransaction(database, operation) {
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = operation();
    database.sqlite.run('COMMIT');
    return result;
  } catch (error) {
    try {
      database.sqlite.run('ROLLBACK');
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'تعذر إكمال العملية أو التراجع عنها بأمان داخل قاعدة البيانات.'
      );
    }
    throw error;
  }
}

function getFinancialPeriod(database, monthKey) {
  validateMonthKey(monthKey);
  const [period] = readRows(database, `
    SELECT month_key, start_date, end_date, is_locked, locked_at, created_at, updated_at
    FROM financial_periods WHERE month_key = ?
  `, [monthKey]);
  if (period) return period;
  const { startDate, endDate } = defaultPeriodRange(monthKey);
  return {
    month_key: monthKey,
    start_date: startDate,
    end_date: endDate,
    is_locked: 0,
    locked_at: null,
    created_at: null,
    updated_at: null
  };
}

function getActiveFinancialPeriodKey(database) {
  const activePeriodKey = getApplicationSetting(database, 'active_period_key');
  if (!activePeriodKey) return getCurrentMonthKey();
  validateMonthKey(activePeriodKey);
  return activePeriodKey;
}

function activateFinancialPeriod(database, monthKey) {
  validateMonthKey(monthKey);
  ensureFinancialPeriodOpen(database, monthKey);
  const { startDate, endDate } = defaultPeriodRange(monthKey);
  withDatabaseTransaction(database, () => {
    execute(database, `
      INSERT OR IGNORE INTO financial_periods (month_key, start_date, end_date)
      VALUES (?, ?, ?)
    `, [monthKey, startDate, endDate]);
    execute(database, `
      INSERT INTO application_settings (setting_key, setting_value)
      VALUES ('active_period_key', ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = CURRENT_TIMESTAMP
    `, [monthKey]);
  });
  persistDatabase(database);
  return getFinancialPeriod(database, monthKey);
}

function setFinancialPeriodRange(database, { monthKey, startDate, endDate }) {
  validateMonthKey(monthKey);
  validatePeriodDate(startDate, 'البداية');
  validatePeriodDate(endDate, 'النهاية');
  if (startDate > endDate) throw new Error('يجب أن يسبق تاريخ البداية تاريخ النهاية أو يساويه.');
  withDatabaseTransaction(database, () => {
    ensureFinancialPeriodOpen(database, monthKey);
    execute(database, `
      INSERT INTO financial_periods (month_key, start_date, end_date)
      VALUES (?, ?, ?)
      ON CONFLICT(month_key) DO UPDATE SET
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        updated_at = CURRENT_TIMESTAMP
    `, [monthKey, startDate, endDate]);
  });
  persistDatabase(database);
  return getFinancialPeriod(database, monthKey);
}

function listMonthlySalaries(database, monthKey) {
  validateMonthKey(monthKey);
  return readRows(database, `
    SELECT s.military_number, p.full_name, p.rank, s.base_salary, s.allowances, s.effective_month
    FROM salaries_base s
    JOIN personnel p ON p.military_number = s.military_number
    WHERE s.effective_month = ?
      AND NOT EXISTS (
        SELECT 1 FROM record_archives a
        WHERE a.entity_type = 'salary'
          AND a.record_id = s.military_number
          AND a.period_key = s.effective_month
      )
    ORDER BY p.full_name COLLATE NOCASE
  `, [monthKey]);
}

function listMonthlyPenalties(database, monthKey) {
  validateMonthKey(monthKey);
  return readRows(database, `
    SELECT p.id, p.military_number, person.full_name, person.rank,
      COALESCE(action_option.option_value, p.penalty_type) AS penalty_type_id,
      COALESCE(action_option.label, p.penalty_type) AS penalty_type,
      p.days, p.deduction_amount, p.reason, p.action_date,
      p.clause_no, p.notes, p.created_at, p.period_key
    FROM penalties p
    JOIN personnel person ON person.military_number = p.military_number
    LEFT JOIN dropdown_options action_option
      ON action_option.group_id = 'action_type'
      AND action_option.scope_id = 'penalties'
      AND (action_option.option_value = p.penalty_type OR action_option.label = p.penalty_type)
    WHERE p.period_key = ?
      AND NOT EXISTS (
        SELECT 1 FROM record_archives a
        WHERE a.entity_type = 'penalty'
          AND a.record_id = CAST(p.id AS TEXT)
          AND a.period_key = p.period_key
      )
    ORDER BY p.action_date DESC, p.id DESC
  `, [monthKey]);
}

function getPenalty(database, penaltyId) {
  if (!Number.isSafeInteger(penaltyId) || penaltyId < 1) {
    throw new Error('معرّف الجزاء غير صالح.');
  }
  return readRows(database, `
    SELECT p.id, p.military_number, person.full_name, person.rank,
      COALESCE(action_option.option_value, p.penalty_type) AS penalty_type_id,
      COALESCE(action_option.label, p.penalty_type) AS penalty_type,
      p.days, p.deduction_amount, p.reason, p.action_date,
      p.clause_no, p.notes, p.created_at, p.period_key
    FROM penalties p
    JOIN personnel person ON person.military_number = p.military_number
    LEFT JOIN dropdown_options action_option
      ON action_option.group_id = 'action_type'
      AND action_option.scope_id = 'penalties'
      AND (action_option.option_value = p.penalty_type OR action_option.label = p.penalty_type)
    WHERE p.id = ?
      AND NOT EXISTS (
        SELECT 1 FROM record_archives a
        WHERE a.entity_type = 'penalty'
          AND a.record_id = CAST(p.id AS TEXT)
          AND a.period_key = p.period_key
      )
  `, [penaltyId])[0] ?? null;
}

function validatePenaltyFields(database, {
  monthKey,
  moduleId = 'penalties',
  militaryNumber,
  penaltyType,
  days,
  reason,
  actionDate,
  clauseNo
}) {
  if (typeof militaryNumber !== 'string' || !militaryNumber.trim()) {
    throw new Error('اختر الفرد من سجل الأفراد.');
  }
  if (!readRows(database, `
    SELECT 1 AS exists_flag FROM personnel WHERE military_number = ?
  `, [militaryNumber.trim()]).length) {
    throw new Error('الفرد المحدد غير موجود في سجل الأفراد.');
  }
  if (typeof penaltyType !== 'string' || !penaltyType.trim() || !findActionTypeOption(database, moduleId, penaltyType)) {
    throw new Error('نوع الإجراء غير صالح أو مخفي من قائمة القسم.');
  }
  if (!Number.isSafeInteger(days) || days < 0 || days > 36500) {
    throw new Error('أدخل مدة صحيحة بالأيام من صفر إلى 36500.');
  }
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 4000) {
    throw new Error('أدخل نص الإجراء النهائي من 1 إلى 4000 حرف.');
  }
  validatePeriodDate(actionDate, 'الإجراء');
  if (actionDate.slice(0, 7) !== monthKey) {
    throw new Error('يجب أن يقع تاريخ الإجراء ضمن الشهر المختار.');
  }
  if (typeof clauseNo !== 'string' || !clauseNo.trim() || clauseNo.trim().length > 100) {
    throw new Error('رقم بند الأمر مطلوب ويجب ألا يتجاوز 100 حرف.');
  }
}

function addPenalty(database, {
  monthKey,
  militaryNumber,
  penaltyType,
  days,
  reason,
  actionDate,
  clauseNo
}) {
  validateMonthKey(monthKey);
  ensureFinancialPeriodOpen(database, monthKey);
  validatePenaltyFields(database, {
    monthKey,
    militaryNumber,
    penaltyType,
    days,
    reason,
    actionDate,
    clauseNo
  });
  const actionTypeId = findActionTypeOption(database, 'penalties', penaltyType).option_value;

  const archived = getArchive(database, monthKey);
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    execute(database, `
      INSERT INTO penalties (
        military_number, penalty_type, days, reason, action_date, clause_no, period_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      militaryNumber.trim(),
      actionTypeId,
      days,
      reason.trim(),
      actionDate,
      clauseNo.trim(),
      monthKey
    ]);
    const [{ id }] = readRows(database, 'SELECT last_insert_rowid() AS id');
    if (archived) {
      execute(database, `
        INSERT INTO monthly_archive_audit (month_key, action, details)
        VALUES (?, 'data_changed', ?)
      `, [monthKey, `penalty-added id=${id} military_number=${militaryNumber.trim()}`]);
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
  return listMonthlyPenalties(database, monthKey);
}

function upsertMonthlySalary(database, { monthKey, militaryNumber, baseSalary, allowances }) {
  validateMonthKey(monthKey);
  ensureFinancialPeriodOpen(database, monthKey);
  if (!Number.isFinite(baseSalary) || baseSalary < 0 || !Number.isFinite(allowances) || allowances < 0) {
    throw new Error('يجب أن تكون الماهية والبدلات أرقاماً صحيحة غير سالبة.');
  }
  const archived = getArchive(database, monthKey);
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    execute(database, `
      INSERT INTO salaries_base (military_number, base_salary, allowances, effective_month)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(military_number, effective_month) DO UPDATE SET
        base_salary = excluded.base_salary,
        allowances = excluded.allowances
    `, [militaryNumber, baseSalary, allowances, monthKey]);
    if (archived) {
      execute(database, `
        INSERT INTO monthly_archive_audit (month_key, action, details)
        VALUES (?, 'data_changed', ?)
      `, [monthKey, `salary-upsert military_number=${militaryNumber}`]);
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
  return listMonthlySalaries(database, monthKey);
}

function listInvoiceCompanies(database) {
  const companies = readRows(database, `
    SELECT code, name, category, commercial_register, tax_card, address, phone, is_custom
    FROM invoice_companies ORDER BY is_custom DESC, category, name
  `);
  const products = readRows(database, `
    SELECT code, company_code, description, unit, unit_price
    FROM invoice_products ORDER BY sort_order, description
  `);
  return companies.map((company) => ({
    ...company,
    products: products.filter((product) => product.company_code === company.code)
  }));
}

function listTextTemplates(database, { includeArchived = false, scope = null } = {}) {
  const filters = [];
  const parameters = [];
  if (!includeArchived) filters.push('is_active = 1');
  if (scope) {
    filters.push('(scope = ? OR scope = ?)');
    parameters.push(scope, 'global');
  }
  const templates = readRows(database, `
    SELECT id, scope, kind, title, body, requires_days, sort_order,
      is_active, created_at, updated_at
    FROM text_templates
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY scope, sort_order, title COLLATE NOCASE, id
  `, parameters);
  return templates.map((template) => {
    if (!template.kind) return { ...template, kind_label: '' };
    const moduleIds = template.scope === 'global'
      ? null
      : template.scope === 'penalties'
        ? ['penalties']
        : readRows(database, 'SELECT module_id FROM custom_submodules WHERE id = ?', [template.scope]).map((row) => row.module_id);
    const [option] = moduleIds === null
      ? readRows(database, `
        SELECT label FROM dropdown_options
        WHERE group_id = 'action_type' AND option_value = ? LIMIT 1
      `, [template.kind])
      : readRows(database, `
        SELECT label FROM dropdown_options
        WHERE group_id = 'action_type' AND scope_id IN (${moduleIds.map(() => '?').join(', ')})
          AND option_value = ? LIMIT 1
      `, [...moduleIds, template.kind]);
    return { ...template, kind_label: option?.label || template.kind };
  });
}

function validateTextTemplate(database, input, { requireId = false } = {}) {
  const {
    id,
    scope,
    kind = '',
    title,
    body,
    requiresDays = input?.requires_days ?? 0,
    sortOrder = input?.sort_order ?? 100
  } = input ?? {};
  if (requireId && (!Number.isSafeInteger(Number(id)) || Number(id) < 1)) {
    throw new Error('معرّف النص الجاهز غير صالح.');
  }
  if (typeof scope !== 'string' || !scope.trim() || scope.trim().length > 120) {
    throw new Error('نطاق النص الجاهز غير صالح.');
  }
  const cleanScope = scope.trim();
  const previousTemplate = requireId
    ? readRows(database, 'SELECT scope, kind FROM text_templates WHERE id = ?', [Number(id)])[0]
    : null;
  if (!['global', 'penalties'].includes(cleanScope)
      && !readRows(database, 'SELECT id FROM custom_submodules WHERE id = ?', [cleanScope]).length) {
    throw new Error('القسم المرتبط بالنص الجاهز غير موجود.');
  }
  if (typeof kind !== 'string' || kind.trim().length > 80) {
    throw new Error('نوع النص الجاهز غير صالح.');
  }
  let normalizedKind = kind.trim();
  if (kind.trim()) {
    const typeScopes = cleanScope === 'global'
      ? null
      : cleanScope === 'penalties'
        ? ['penalties']
        : readRows(database, 'SELECT module_id FROM custom_submodules WHERE id = ?', [cleanScope]).map((row) => row.module_id);
    const option = typeScopes === null
      ? readRows(database, `
        SELECT option_value FROM dropdown_options
        WHERE group_id = 'action_type' AND (option_value = ? OR label = ?) AND is_active = 1 LIMIT 1
      `, [kind.trim(), kind.trim()])[0]
      : typeScopes.map((moduleId) => findActionTypeOption(database, moduleId, kind.trim())).find(Boolean);
    if (!option) {
      if (previousTemplate?.scope !== cleanScope || previousTemplate?.kind !== kind.trim()) {
        throw new Error('نوع الإجراء المحدد غير معروف في قائمة القسم.');
      }
    } else {
      normalizedKind = option.option_value;
    }
  }
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) {
    throw new Error('عنوان النص الجاهز يجب أن يتراوح بين 1 و120 حرفاً.');
  }
  if (typeof body !== 'string' || !body.trim() || body.trim().length > 4000) {
    throw new Error('نص القالب يجب أن يتراوح بين 1 و4000 حرف.');
  }
  if (![0, 1, false, true].includes(requiresDays)) {
    throw new Error('قيمة اشتراط المدة غير صالحة.');
  }
  if (!Number.isSafeInteger(Number(sortOrder)) || Number(sortOrder) < 0 || Number(sortOrder) > 100000) {
    throw new Error('ترتيب سبب الإجراء غير صالح.');
  }
  return {
    id: Number(id),
    scope: cleanScope,
    kind: normalizedKind,
    title: title.trim(),
    body: body.trim(),
    requiresDays: Number(Boolean(requiresDays)),
    sortOrder: Number(sortOrder)
  };
}

function addTextTemplate(database, input) {
  const template = validateTextTemplate(database, input);
  execute(database, `
    INSERT INTO text_templates
      (scope, kind, title, body, requires_days, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    template.scope,
    template.kind,
    template.title,
    template.body,
    template.requiresDays,
    template.sortOrder
  ]);
  persistDatabase(database);
  const [created] = readRows(database, 'SELECT * FROM text_templates WHERE id = last_insert_rowid()');
  return created;
}

function updateTextTemplate(database, input) {
  const template = validateTextTemplate(database, input, { requireId: true });
  const existing = readRows(database, 'SELECT id FROM text_templates WHERE id = ?', [template.id])[0];
  if (!existing) throw new Error('النص الجاهز غير موجود.');
  execute(database, `
    UPDATE text_templates
    SET scope = ?, kind = ?, title = ?, body = ?, requires_days = ?,
      sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    template.scope,
    template.kind,
    template.title,
    template.body,
    template.requiresDays,
    template.sortOrder,
    template.id
  ]);
  persistDatabase(database);
  return readRows(database, 'SELECT * FROM text_templates WHERE id = ?', [template.id])[0];
}

function archiveTextTemplate(database, id) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    throw new Error('معرّف النص الجاهز غير صالح.');
  }
  if (!readRows(database, 'SELECT id FROM text_templates WHERE id = ?', [Number(id)]).length) {
    throw new Error('النص الجاهز غير موجود.');
  }
  execute(database, `
    UPDATE text_templates
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [Number(id)]);
  persistDatabase(database);
  return readRows(database, 'SELECT * FROM text_templates WHERE id = ?', [Number(id)])[0];
}

function addInvoiceCompany(database, input) {
  const { name, category = 'شركة خاصة', commercialRegister = '', taxCard = '', address = '', phone = '' } = input ?? {};
  const fields = [name, category, commercialRegister, taxCard, address, phone];
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    throw new Error('أدخل اسم شركة من 1 إلى 120 حرفاً.');
  }
  if (typeof category !== 'string' || category.trim().length > 80) throw new Error('تخصص الشركة غير صالح.');
  if (fields.slice(2).some((value) => typeof value !== 'string' || value.length > 200)) {
    throw new Error('بيانات الشركة يجب ألا تتجاوز 200 حرف لكل حقل.');
  }
  const code = `CUS-${randomUUID()}`;
  execute(database, `
    INSERT INTO invoice_companies (
      code, name, category, commercial_register, tax_card, address, phone, is_custom
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `, [code, name.trim(), category.trim() || 'شركة خاصة', commercialRegister.trim(), taxCard.trim(), address.trim(), phone.trim()]);
  persistDatabase(database);
  return listInvoiceCompanies(database).find((company) => company.code === code);
}

function updateInvoiceCompany(database, input) {
  const { code, name, category = '', commercialRegister = '', taxCard = '', address = '', phone = '' } = input ?? {};
  if (typeof code !== 'string' || !code.startsWith('CUS-')) {
    throw new Error('يمكن تعديل بيانات الشركات الخاصة فقط.');
  }
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    throw new Error('أدخل اسم شركة من 1 إلى 120 حرفاً.');
  }
  if ([category, commercialRegister, taxCard, address, phone].some((value) => typeof value !== 'string' || value.length > 200)) {
    throw new Error('بيانات الشركة يجب ألا تتجاوز 200 حرف لكل حقل.');
  }
  execute(database, `
    UPDATE invoice_companies
    SET name = ?, category = ?, commercial_register = ?, tax_card = ?, address = ?, phone = ?
    WHERE code = ? AND is_custom = 1
  `, [name.trim(), category.trim(), commercialRegister.trim(), taxCard.trim(), address.trim(), phone.trim(), code]);
  if (!readRows(database, 'SELECT code FROM invoice_companies WHERE code = ?', [code]).length) {
    throw new Error('الشركة الخاصة غير موجودة.');
  }
  persistDatabase(database);
  return listInvoiceCompanies(database).find((company) => company.code === code);
}

function addInvoiceProduct(database, input) {
  const { companyCode, description, unit = 'قطعة', unitPrice } = input ?? {};
  if (typeof companyCode !== 'string' || !readRows(database, `
    SELECT code FROM invoice_companies WHERE code = ? AND is_custom = 1
  `, [companyCode]).length) {
    throw new Error('اختر شركة خاصة لإضافة صنف لها.');
  }
  if (typeof description !== 'string' || !description.trim() || description.trim().length > 200) {
    throw new Error('أدخل وصف صنف من 1 إلى 200 حرف.');
  }
  if (typeof unit !== 'string' || !unit.trim() || unit.trim().length > 40) {
    throw new Error('وحدة الصنف غير صالحة.');
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000000000) {
    throw new Error('أدخل سعر وحدة صحيحاً غير سالب.');
  }
  const code = `CUS-${randomUUID()}`;
  const sortOrder = readRows(database, `
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
    FROM invoice_products WHERE company_code = ?
  `, [companyCode])[0].next_order;
  execute(database, `
    INSERT INTO invoice_products (code, company_code, description, unit, unit_price, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [code, companyCode, description.trim(), unit.trim(), roundMoney(unitPrice), sortOrder]);
  persistDatabase(database);
  return listInvoiceCompanies(database).find((company) => company.code === companyCode);
}

function listInvoices(database, monthKey) {
  validateMonthKey(monthKey);
  const invoices = readRows(database, `
    SELECT i.id, i.invoice_number, i.company_code, c.name AS company_name,
      i.invoice_date, i.period_key, i.subtotal, i.vat_rate, i.vat_amount,
      i.grand_total, i.created_at, i.company_snapshot_json,
      i.header_fields_json, i.layout_json, i.template_id, i.document_type
    FROM invoices i
    JOIN invoice_companies c ON c.code = i.company_code
    WHERE i.period_key = ?
      AND NOT EXISTS (
        SELECT 1 FROM record_archives a
        WHERE a.entity_type = 'invoice'
          AND a.record_id = CAST(i.id AS TEXT)
          AND a.period_key = i.period_key
      )
    ORDER BY i.id DESC
  `, [monthKey]);
  const items = readRows(database, `
    SELECT ii.id, ii.invoice_id, ii.serial, ii.product_code, ii.description,
      ii.unit, ii.unit_price, ii.quantity, ii.total
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.period_key = ? ORDER BY ii.invoice_id, ii.serial
  `, [monthKey]);
  return invoices.map((invoice) => ({
    ...invoice,
    company: parseJson(invoice.company_snapshot_json, {
      name: invoice.company_name,
      category: '',
      commercial_register: '',
      tax_card: '',
      address: '',
      phone: ''
    }),
    company_name: parseJson(invoice.company_snapshot_json, { name: invoice.company_name }).name
      || invoice.company_name,
    headerFields: parseJson(invoice.header_fields_json, []),
    layout: parseJson(invoice.layout_json, []),
    items: items.filter((item) => item.invoice_id === invoice.id)
  }));
}

function getInvoice(database, invoiceId) {
  if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) throw new Error('رقم الفاتورة غير صالح.');
  const [invoice] = readRows(database, 'SELECT period_key FROM invoices WHERE id = ?', [invoiceId]);
  return invoice ? listInvoices(database, invoice.period_key).find((row) => row.id === invoiceId) ?? null : null;
}

function saveInvoice(database, input) {
  const {
    invoiceNumber,
    companyCode,
    invoiceDate,
    monthKey,
    supplierName = '',
    items,
    headerFields = [],
    layout = [],
    templateId = 'classic',
    documentType = 'invoice'
  } = input ?? {};
  validateMonthKey(monthKey);
  validatePeriodDate(invoiceDate, 'الفاتورة');
  if (invoiceDate.slice(0, 7) !== monthKey) {
    throw new Error('تاريخ الفاتورة يجب أن يقع داخل الشهر المحدد.');
  }
  if (typeof invoiceNumber !== 'string' || !invoiceNumber.trim() || invoiceNumber.trim().length > 50) {
    throw new Error('أدخل رقم فاتورة صحيحاً لا يتجاوز 50 حرفاً.');
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    throw new Error('يجب إضافة صنف واحد على الأقل، وبحد أقصى 200 صنف.');
  }
  const [company] = readRows(database, `
    SELECT code, name, category, commercial_register, tax_card, address, phone
    FROM invoice_companies WHERE code = ?
  `, [companyCode]);
  if (!company) throw new Error('الشركة المحددة غير موجودة في قائمة الموردين.');
  if (typeof supplierName !== 'string' || supplierName.trim().length > 120) {
    throw new Error('اسم المورد لهذه الفاتورة يجب ألا يتجاوز 120 حرفاً.');
  }
  if (!Array.isArray(headerFields) || headerFields.length > 30
    || headerFields.some((field) => typeof field?.id !== 'string' || !field.id
      || field.id.length > 120 || typeof field?.label !== 'string' || !field.label.trim()
      || field.label.length > 80 || typeof field.value !== 'string' || field.value.length > 500)
    || new Set(headerFields.map((field) => field.id)).size !== headerFields.length) {
    throw new Error('بيانات الترويسة غير صالحة أو تجاوزت الحد المسموح.');
  }
  const allowedTemplates = new Set(['classic', 'modern', 'framed', 'sidebar']);
  if (!allowedTemplates.has(templateId)) throw new Error('تصميم الفاتورة المحدد غير معروف.');
  if (!['invoice', 'quotation'].includes(documentType)) throw new Error('نوع المستند المحدد غير معروف.');
  const normalizedLayout = normalizeInvoiceLayout(layout, headerFields);
  const preparedItems = items.map((item, index) => {
    const quantity = Number(item?.quantity);
    const requestedUnitPrice = item?.unitPrice === undefined
      ? null
      : Number(item.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000000) {
      throw new Error(`كمية الصنف رقم ${index + 1} يجب أن تكون أكبر من صفر.`);
    }
    if (requestedUnitPrice !== null
      && (!Number.isFinite(requestedUnitPrice) || requestedUnitPrice < 0 || requestedUnitPrice > 1000000000000)) {
      throw new Error(`سعر الوحدة للصنف رقم ${index + 1} يجب أن يكون رقماً غير سالب.`);
    }
    const [product] = readRows(database, `
      SELECT code, description, unit, unit_price FROM invoice_products
      WHERE code = ? AND company_code = ?
    `, [item.productCode, companyCode]);
    if (!product) throw new Error(`الصنف رقم ${index + 1} غير تابع للشركة المختارة.`);
    const unitPrice = requestedUnitPrice === null ? product.unit_price : roundMoney(requestedUnitPrice);
    const total = roundMoney(unitPrice * quantity);
    return {
      serial: index + 1,
      ...product,
      unit_price: unitPrice,
      quantity,
      total
    };
  });
  const subtotal = roundMoney(preparedItems.reduce((sum, item) => sum + item.total, 0));
  const vatAmount = roundMoney(subtotal * 0.14);
  const grandTotal = roundMoney(subtotal + vatAmount);

  const invoiceId = withDatabaseTransaction(database, () => {
    ensureFinancialPeriodOpen(database, monthKey);
    execute(database, `
      INSERT INTO invoices (
        invoice_number, company_code, invoice_date, period_key,
        subtotal, vat_rate, vat_amount, grand_total, company_snapshot_json,
        header_fields_json, layout_json, template_id, document_type
      ) VALUES (?, ?, ?, ?, ?, 0.14, ?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceNumber.trim(), companyCode, invoiceDate, monthKey, subtotal, vatAmount, grandTotal,
      JSON.stringify({
        ...company,
        name: supplierName.trim() || company.name
      }), JSON.stringify(headerFields.map((field) => ({
        id: field.id,
        label: field.label.trim(),
        value: field.value.trim()
      }))),
      JSON.stringify(normalizedLayout),
      templateId,
      documentType
    ]);
    const [savedInvoice] = readRows(database, 'SELECT last_insert_rowid() AS id');
    for (const item of preparedItems) {
      execute(database, `
        INSERT INTO invoice_items (
          invoice_id, serial, product_code, description, unit,
          unit_price, quantity, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        savedInvoice.id, item.serial, item.code, item.description, item.unit,
        item.unit_price, item.quantity, item.total
      ]);
    }
    return savedInvoice.id;
  });
  persistDatabase(database);
  return listInvoices(database, monthKey).find((invoice) => invoice.id === invoiceId);
}

function normalizeInvoiceLayout(layout, headerFields) {
  if (!Array.isArray(layout) || layout.length > 60) throw new Error('ترتيب الترويسة غير صالح.');
  const validIds = new Set(headerFields.map((field) => field.id));
  const seenFields = new Set();
  const normalized = [];
  for (const block of layout) {
    if (block?.type === 'field' && validIds.has(block.id) && !seenFields.has(block.id)) {
      seenFields.add(block.id);
      normalized.push({ type: 'field', id: block.id });
    } else if (block?.type === 'divider') {
      normalized.push({ type: 'divider', id: String(block.id || randomUUID()) });
    } else {
      throw new Error('يحتوي ترتيب الترويسة على عنصر غير صالح.');
    }
  }
  for (const field of headerFields) {
    if (!seenFields.has(field.id)) normalized.push({ type: 'field', id: field.id });
  }
  return normalized;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getMonthData(database, monthKey) {
  validateMonthKey(monthKey);
  const period = getFinancialPeriod(database, monthKey);
  const submoduleRecords = readRows(database, `
    SELECT r.id, r.submodule_id, m.title AS module_title, s.title AS submodule_title,
      s.fields_json, r.data_json, r.created_at, r.period_key, r.military_number,
      p.full_name, p.rank, COALESCE(action_option.option_value, r.action_type) AS action_type_id,
      COALESCE(action_option.label, r.action_type) AS action_type,
      r.action_days, r.action_reason,
      r.action_date, r.clause_no
    FROM submodule_records r
    JOIN custom_submodules s ON s.id = r.submodule_id
    JOIN custom_modules m ON m.id = s.module_id
    LEFT JOIN personnel p ON p.military_number = r.military_number
    LEFT JOIN dropdown_options action_option
      ON action_option.group_id = 'action_type'
      AND action_option.scope_id = m.id
      AND (action_option.option_value = r.action_type OR action_option.label = r.action_type)
    WHERE r.period_key = ?
      AND NOT EXISTS (
        SELECT 1 FROM record_archives a
        WHERE a.entity_type = 'submodule_record'
          AND a.record_id = CAST(r.id AS TEXT)
          AND a.period_key = r.period_key
      )
    ORDER BY r.id
  `, [monthKey]).map((record) => ({
    ...record,
    data: JSON.parse(record.data_json)
  }));
  const recordsBySubmodule = new Map();
  for (const record of submoduleRecords) {
    if (!recordsBySubmodule.has(record.submodule_id)) recordsBySubmodule.set(record.submodule_id, []);
    recordsBySubmodule.get(record.submodule_id).push(record);
  }
  const customSections = readRows(database, `
    SELECT m.id AS module_id, m.title AS module_title,
      s.id AS submodule_id, s.title AS submodule_title, s.fields_json
    FROM custom_modules m
    JOIN custom_submodules s ON s.module_id = m.id
    ORDER BY m.sort_order, m.title, s.sort_order, s.title
  `).map((section) => ({
    ...section,
    fields: parseFieldDefinitions(section.fields_json),
    records: recordsBySubmodule.get(section.submodule_id) || []
  }));
  return {
    monthKey,
    periodRange: {
      start_date: period.start_date,
      end_date: period.end_date
    },
    personnel: listPersonnel(database),
    salaries: listMonthlySalaries(database, monthKey),
    penalties: listMonthlyPenalties(database, monthKey)
      .sort((left, right) => left.action_date.localeCompare(right.action_date) || left.id - right.id),
    supplyOrders: readRows(database, `
      SELECT id, order_number, order_date, supplier, description, amount, status, created_at, period_key
      FROM supply_orders o
      WHERE period_key = ?
        AND NOT EXISTS (
          SELECT 1 FROM record_archives a
          WHERE a.entity_type = 'supply_order'
            AND a.record_id = CAST(o.id AS TEXT)
            AND a.period_key = o.period_key
        )
      ORDER BY id
    `, [monthKey]),
    invoices: listInvoices(database, monthKey),
    submoduleRecords,
    customSections
  };
}

function listRecordArchives(database, monthKey) {
  validateMonthKey(monthKey);
  return readRows(database, `
    SELECT entity_type, record_id, period_key, snapshot_json, archived_at
    FROM record_archives
    WHERE period_key = ? OR period_key = ''
    ORDER BY archived_at DESC, entity_type, record_id
  `, [monthKey]).map((archive) => ({
    entity_type: archive.entity_type,
    record_id: archive.record_id,
    period_key: archive.period_key,
    archived_at: archive.archived_at,
    snapshot: JSON.parse(archive.snapshot_json)
  }));
}

function archiveRecords(database, { monthKey, records }) {
  validateMonthKey(monthKey);
  if (!Array.isArray(records) || records.length < 1 || records.length > 500) {
    throw new Error('اختر سجلاً واحداً على الأقل، وبحد أقصى 500 سجل في الدفعة.');
  }
  const allowedTypes = new Set(['personnel', 'salary', 'penalty', 'supply_order', 'invoice', 'submodule_record']);
  const normalized = records.map((item) => {
    const entityType = String(item?.entityType || '');
    const recordId = String(item?.recordId ?? '').trim();
    if (!allowedTypes.has(entityType) || !recordId) throw new Error('بيانات السجل المراد أرشفته غير صالحة.');
    return {
      entityType,
      recordId,
      periodKey: entityType === 'personnel' ? '' : monthKey
    };
  });
  const keys = normalized.map(({ entityType, recordId, periodKey }) => `${entityType}\u0000${recordId}\u0000${periodKey}`);
  if (new Set(keys).size !== keys.length) throw new Error('تتضمن القائمة سجلاً مكرراً.');
  if (normalized.some((item) => item.entityType !== 'personnel')) {
    if (getActiveFinancialPeriodKey(database) !== monthKey) {
      throw new Error('أرشفة سجلات الفترة متاحة للفترة النشطة فقط.');
    }
    ensureFinancialPeriodOpen(database, monthKey);
  }

  const monthData = getMonthData(database, monthKey);
  const sources = {
    personnel: monthData.personnel,
    salary: monthData.salaries,
    penalty: monthData.penalties,
    supply_order: monthData.supplyOrders,
    invoice: monthData.invoices,
    submodule_record: monthData.customSections.flatMap((section) => section.records.map((record) => ({
      ...record,
      module_id: section.module_id,
      module_title: section.module_title,
      submodule_id: section.submodule_id,
      submodule_title: section.submodule_title,
      fields: section.fields
    })))
  };
  const prepared = normalized.map((item) => {
    const snapshot = sources[item.entityType].find((record) => (
      String(item.entityType === 'personnel' || item.entityType === 'salary'
        ? record.military_number
        : record.id) === item.recordId
    ));
    if (!snapshot) throw new Error('أحد السجلات المحددة غير موجود أو مؤرشف بالفعل.');
    return { ...item, snapshot };
  });

  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    for (const item of prepared) {
      execute(database, `
        INSERT INTO record_archives (entity_type, record_id, period_key, snapshot_json)
        VALUES (?, ?, ?, ?)
      `, [item.entityType, item.recordId, item.periodKey, JSON.stringify(item.snapshot)]);
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
  return listRecordArchives(database, monthKey);
}

function restoreArchivedRecord(database, { entityType, recordId, periodKey }) {
  const normalizedType = String(entityType ?? '');
  const normalizedId = String(recordId ?? '').trim();
  const normalizedPeriod = String(periodKey ?? '');
  if (!normalizedType || !normalizedId) throw new Error('بيانات السجل المراد استرجاعه غير صالحة.');
  if (normalizedPeriod) {
    validateMonthKey(normalizedPeriod);
    if (getActiveFinancialPeriodKey(database) !== normalizedPeriod) {
      throw new Error('استرجاع سجلات الفترة متاح للفترة النشطة فقط.');
    }
    ensureFinancialPeriodOpen(database, normalizedPeriod);
  } else if (normalizedType !== 'personnel') {
    throw new Error('الفترة المرتبطة بالسجل غير صالحة.');
  }
  const existing = readRows(database, `
    SELECT entity_type FROM record_archives
    WHERE entity_type = ? AND record_id = ? AND period_key = ?
  `, [normalizedType, normalizedId, normalizedPeriod]);
  if (!existing.length) throw new Error('السجل المؤرشف غير موجود.');
  execute(database, `
    DELETE FROM record_archives
    WHERE entity_type = ? AND record_id = ? AND period_key = ?
  `, [normalizedType, normalizedId, normalizedPeriod]);
  persistDatabase(database);
  return listRecordArchives(database, normalizedPeriod || getActiveFinancialPeriodKey(database));
}

function listArchives(database) {
  return readRows(database, `
    SELECT a.month_key, a.revision, a.closed_at, a.updated_at, COALESCE(p.is_locked, 0) AS is_locked
    FROM monthly_archives a
    LEFT JOIN financial_periods p ON p.month_key = a.month_key
    ORDER BY a.month_key DESC
  `);
}

function getArchive(database, monthKey) {
  validateMonthKey(monthKey);
  const [archive] = readRows(database, `
    SELECT month_key, snapshot_json, revision, closed_at, updated_at
    FROM monthly_archives WHERE month_key = ?
  `, [monthKey]);
  return archive ? { ...archive, snapshot: JSON.parse(archive.snapshot_json) } : null;
}

function listArchiveRevisions(database, monthKey) {
  validateMonthKey(monthKey);
  return readRows(database, `
    SELECT month_key, revision, created_at FROM monthly_archive_revisions
    WHERE month_key = ? ORDER BY revision DESC
  `, [monthKey]);
}

function getArchiveRevision(database, monthKey, revision) {
  validateMonthKey(monthKey);
  if (!Number.isInteger(revision) || revision < 1) throw new Error('رقم إصدار الأرشيف غير صالح.');
  const [archive] = readRows(database, `
    SELECT month_key, revision, snapshot_json, created_at
    FROM monthly_archive_revisions WHERE month_key = ? AND revision = ?
  `, [monthKey, revision]);
  return archive ? { ...archive, snapshot: JSON.parse(archive.snapshot_json) } : null;
}

function archiveMonth(database, monthKey) {
  validateMonthKey(monthKey);
  withDatabaseTransaction(database, () => {
    ensureFinancialPeriodOpen(database, monthKey);
    const existing = getArchive(database, monthKey);
    const snapshot = getMonthData(database, monthKey);
    const period = getFinancialPeriod(database, monthKey);
    const revision = existing ? existing.revision + 1 : 1;
    execute(database, `
      INSERT INTO monthly_archives (month_key, snapshot_json, revision, closed_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(month_key) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        revision = excluded.revision,
        updated_at = CURRENT_TIMESTAMP
    `, [monthKey, JSON.stringify(snapshot), revision]);
    execute(database, `
      INSERT INTO monthly_archive_audit (month_key, action, details)
      VALUES (?, ?, ?)
    `, [monthKey, 'closed', `revision=${revision}; range=${period.start_date}..${period.end_date}`]);
    execute(database, `
      INSERT INTO monthly_archive_revisions (month_key, revision, snapshot_json)
      VALUES (?, ?, ?)
    `, [monthKey, revision, JSON.stringify(snapshot)]);
    execute(database, `
      INSERT INTO financial_periods (month_key, start_date, end_date, is_locked, locked_at)
      VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(month_key) DO UPDATE SET
        is_locked = 1,
        locked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [monthKey, period.start_date, period.end_date]);
  });
  persistDatabase(database);
  return getArchive(database, monthKey);
}

function listArchiveAudit(database, monthKey) {
  validateMonthKey(monthKey);
  return readRows(database, `
    SELECT id, action, details, created_at FROM monthly_archive_audit
    WHERE month_key = ? ORDER BY id DESC
  `, [monthKey]);
}

function findActionTypeId(database, moduleId, value) {
  const [option] = readRows(database, `
    SELECT option_value FROM dropdown_options
    WHERE group_id = 'action_type' AND scope_id = ? AND (option_value = ? OR label = ?)
    LIMIT 1
  `, [moduleId, value, value]);
  if (!option) throw new Error(`نوع الإجراء «${value}» غير موجود في قائمة القسم ولا يمكن نسخه.`);
  return option.option_value;
}

function getCurrentMonthSnapshot(database) {
  const [snapshot] = readRows(database, `
    SELECT month_key, revision, closed_at, updated_at
    FROM monthly_archives
    WHERE month_key = ?
  `, [getCurrentMonthKey()]);
  return snapshot ?? null;
}

function copyArchiveToMonth(database, sourceMonth, targetMonth) {
  validateMonthKey(sourceMonth);
  validateMonthKey(targetMonth);
  if (sourceMonth === targetMonth) throw new Error('اختر شهراً مختلفاً كوجهة للنسخ.');
  ensureFinancialPeriodOpen(database, targetMonth);
  const archive = getArchive(database, sourceMonth);
  if (!archive) throw new Error('لا يوجد أرشيف محفوظ للشهر المحدد.');
  const alreadyCopied = readRows(database, `
    SELECT source_month FROM monthly_archive_copies
    WHERE source_month = ? AND target_month = ?
  `, [sourceMonth, targetMonth]);
  if (alreadyCopied.length) throw new Error('تم نسخ هذا الشهر المصدر إلى الوجهة المحددة من قبل؛ لتجنب تكرار السجلات.');
  const snapshot = archive.snapshot;
  const missingClauseCount = [
    ...(snapshot.penalties || []),
    ...(snapshot.submoduleRecords || [])
  ].filter((row) => !String(row.clause_no || '').trim()).length;
  if (missingClauseCount) {
    throw new Error(`تعذر النسخ لأن ${missingClauseCount} سجلاً من الأرشيف لا يحتوي على رقم بند الأمر المطلوب.`);
  }
  const currentPersonnel = new Set(listPersonnel(database).map((person) => person.military_number));
  const missingPersonnel = [
    ...snapshot.salaries,
    ...snapshot.penalties,
    ...(snapshot.submoduleRecords || []).filter((row) => row.military_number)
  ]
    .map((row) => row.military_number)
    .filter((militaryNumber) => !currentPersonnel.has(militaryNumber));
  if (missingPersonnel.length) {
    const uniqueMissing = [...new Set(missingPersonnel)];
    throw new Error(`تعذر النسخ لأن ${uniqueMissing.length} فرداً من السجل المؤرشف غير موجودين في سجل الأفراد الحالي.`);
  }
  database.sqlite.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const salary = database.sqlite.prepare(`
      INSERT INTO salaries_base (military_number, base_salary, allowances, effective_month)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(military_number, effective_month) DO UPDATE SET
        base_salary = excluded.base_salary,
        allowances = excluded.allowances,
        effective_month = excluded.effective_month
    `);
    try {
      for (const row of snapshot.salaries) {
        salary.run([row.military_number, row.base_salary, row.allowances, targetMonth]);
        salary.reset();
      }
    } finally {
      salary.free();
    }

    const penalty = database.sqlite.prepare(`
      INSERT INTO penalties (
        military_number, penalty_type, days, deduction_amount, reason, action_date,
        clause_no, notes, period_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      for (const row of snapshot.penalties) {
        const penaltyTypeId = row.penalty_type_id || findActionTypeId(database, 'penalties', row.penalty_type);
        penalty.run([
          row.military_number,
          penaltyTypeId,
          row.days,
          row.deduction_amount,
          row.reason || row.penalty_type || '',
          row.action_date || `${targetMonth}-01`,
          row.clause_no || '',
          row.notes,
          targetMonth
        ]);
        penalty.reset();
      }
    } finally {
      penalty.free();
    }

    const submoduleRecord = database.sqlite.prepare(`
      INSERT INTO submodule_records (
        submodule_id, data_json, period_key, military_number, action_type,
        action_days, action_reason, action_date, clause_no
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      for (const row of snapshot.submoduleRecords) {
        const hasAction = Boolean(row.military_number && row.action_type);
        const submodule = getSubmodule(database, row.submodule_id);
        const actionTypeId = hasAction
          ? row.action_type_id || findActionTypeId(database, submodule.module_id, row.action_type)
          : null;
        submoduleRecord.run([
          row.submodule_id,
          JSON.stringify(row.data),
          targetMonth,
          hasAction ? row.military_number : null,
          actionTypeId,
          hasAction ? row.action_days : null,
          hasAction ? row.action_reason : null,
          hasAction ? row.action_date : null,
          row.clause_no
        ]);
        submoduleRecord.reset();
      }
    } finally {
      submoduleRecord.free();
    }
    const supplyOrder = database.sqlite.prepare(`
      INSERT INTO supply_orders (
        order_number, order_date, supplier, description, amount, status, period_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_number, period_key) DO UPDATE SET
        order_date = excluded.order_date,
        supplier = excluded.supplier,
        description = excluded.description,
        amount = excluded.amount,
        status = excluded.status
    `);
    try {
      for (const row of snapshot.supplyOrders) {
        supplyOrder.run([
          row.order_number,
          row.order_date,
          row.supplier,
          row.description,
          row.amount,
          row.status,
          targetMonth
        ]);
        supplyOrder.reset();
      }
    } finally {
      supplyOrder.free();
    }
    const insertInvoice = database.sqlite.prepare(`
      INSERT INTO invoices (
        invoice_number, company_code, invoice_date, period_key,
        subtotal, vat_rate, vat_amount, grand_total, company_snapshot_json,
        header_fields_json, layout_json, template_id, document_type
      ) VALUES (?, ?, ?, ?, ?, 0.14, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertInvoiceItem = database.sqlite.prepare(`
      INSERT INTO invoice_items (
        invoice_id, serial, product_code, description, unit,
        unit_price, quantity, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      for (const invoice of snapshot.invoices || []) {
        insertInvoice.run([
          invoice.invoice_number,
          invoice.company_code,
          invoice.invoice_date,
          targetMonth,
          invoice.subtotal,
          invoice.vat_amount,
          invoice.grand_total,
          JSON.stringify(invoice.company || { name: invoice.company_name }),
          JSON.stringify(invoice.headerFields || []),
          JSON.stringify(invoice.layout || []),
          invoice.template_id || 'classic',
          invoice.document_type || 'invoice'
        ]);
        const [savedInvoice] = readRows(database, 'SELECT last_insert_rowid() AS id');
        for (const item of invoice.items || []) {
          insertInvoiceItem.run([
            savedInvoice.id,
            item.serial,
            item.product_code,
            item.description,
            item.unit,
            item.unit_price,
            item.quantity,
            item.total
          ]);
          insertInvoiceItem.reset();
        }
        insertInvoice.reset();
      }
    } finally {
      insertInvoice.free();
      insertInvoiceItem.free();
    }
    execute(database, `
      INSERT INTO monthly_archive_copies (source_month, target_month, source_revision)
      VALUES (?, ?, ?)
    `, [sourceMonth, targetMonth, archive.revision]);
    execute(database, `
      INSERT INTO monthly_archive_audit (month_key, action, details)
      VALUES (?, 'copied', ?)
    `, [sourceMonth, `target=${targetMonth}`]);
    if (getArchive(database, targetMonth)) {
      execute(database, `
        INSERT INTO monthly_archive_audit (month_key, action, details)
        VALUES (?, 'data_changed', ?)
      `, [targetMonth, `archive-copied-from=${sourceMonth}`]);
    }
    database.sqlite.run('COMMIT');
  } catch (error) {
    database.sqlite.run('ROLLBACK');
    throw error;
  }
  persistDatabase(database);
  return getMonthData(database, targetMonth);
}

module.exports = {
  initializeDatabase,
  listPersonnel,
  listPersonnelColumns,
  updatePersonnelColumnPlaceholder,
  importPersonnel,
  listModules,
  listDropdownOptions,
  addActionTypeOption,
  updateDropdownOption,
  setDropdownOptionActive,
  reorderDropdownOptions,
  listSectionPresets,
  addModule,
  createModuleWithPreset,
  updateModule,
  archiveModule,
  restoreModule,
  reorderModules,
  copyModule,
  exportModuleDefinition,
  importModuleDefinition,
  setModuleTemplate,
  listDocumentTemplates,
  getDocumentTemplate,
  saveDocumentTemplate,
  setDocumentTemplateActive,
  addSubmodule,
  updateSubmodule,
  archiveSubmodule,
  deleteSubmodule,
  restoreSubmodule,
  setSubmoduleTemplate,
  getSubmodule,
  listSubmoduleRecords,
  addSubmoduleRecord,
  addSubmoduleRecords,
  updateSubmoduleRecord,
  deleteSubmoduleRecord,
  listSavedFieldValues,
  getSubmoduleRecord,
  getApplicationSetting,
  setApplicationSetting,
  getLegacySalaryScreenVisible,
  setLegacySalaryScreenVisible,
  validateMonthKey,
  listMonthlySalaries,
  listInvoiceCompanies,
  listTextTemplates,
  addTextTemplate,
  updateTextTemplate,
  archiveTextTemplate,
  listInvoices,
  getInvoice,
  addInvoiceCompany,
  updateInvoiceCompany,
  addInvoiceProduct,
  saveInvoice,
  listMonthlyPenalties,
  getPenalty,
  addPenalty,
  upsertMonthlySalary,
  getMonthData,
  listRecordArchives,
  archiveRecords,
  restoreArchivedRecord,
  listArchives,
  getArchive,
  listArchiveRevisions,
  getArchiveRevision,
  archiveMonth,
  getFinancialPeriod,
  getActiveFinancialPeriodKey,
  activateFinancialPeriod,
  setFinancialPeriodRange,
  isFinancialPeriodLocked,
  unlockFinancialPeriod,
  listArchiveAudit,
  copyArchiveToMonth,
  getCurrentMonthSnapshot
};
