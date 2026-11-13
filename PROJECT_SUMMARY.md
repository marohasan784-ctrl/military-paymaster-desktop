# ملخص مشروع مكتب الماليات

> هذا الملخص مبني على ملفات المشروع الموجودة في `D:\Maly`، وليس على افتراضات عن وظائف مستقبلية.  
> ملاحظة المسارات: المسارات بين backticks نسبية إلى جذر المشروع، إلا إذا كُتب مسار مطلق.

## 1. نظرة عامة والتقنيات والتشغيل

تطبيق سطح مكتب محلي باللغة العربية لإدارة سجل الأفراد والماهيات والجزاءات والفواتير، والفترات المالية الشهرية، والأرشيف، والأقسام والنماذج المخصصة. لا يوجد خادم تطبيق منفصل؛ تعمل واجهة React داخل Electron وتتصل بعملية Electron الرئيسية عبر IPC وواجهة محدودة في preload. تخزن البيانات في ملف SQLite بواسطة `sql.js` (WebAssembly). ( `package.json`، `main.js`، `preload.js`، `src/renderer/App.jsx`، `src/database/database.js` )

الاسم الظاهر للتطبيق هو «مكتب الماليات» في عنوان النافذة والواجهة والقائمة؛ بقي `package.json` الاسم التقني `local-finance-office`، وثُبّت `userData` صراحةً على مجلده السابق للمحافظة على قاعدة `finance_system.db`. الصورة الأصلية مربعة، لذا تُستخدم كاملة بلا قص أو حشوة إضافية؛ تُولّد الأيقونات عبر `tools/generate-icons.ps1` إلى `build/icons/`، ويستخدمها `BrowserWindow`، وتُنسخ نسخة favicon من `public/` إلى بناء Vite. لا يوجد حالياً إعداد تعبئة؛ عند إضافته يجب تضمين `build/icons/icon.ico` وتعيينه كأيقونة لحزمة/مثبّت Windows والاختصار. ( `package.json`، `main.js`، `index.html`، `vite.config.js` )

| التقنية | النطاق المعلن في `package.json` | المثبت محلياً وقت إعداد الملخص |
|---|---:|---:|
| Node.js | README يوصي بـ 22.12 أو أحدث؛ لا يوجد `engines` في `package.json` | 24.15.0 |
| Electron | `^45.2.3` | 45.2.3 |
| React / React DOM | `^18.3.1` | 18.3.1 |
| Vite | `^6.1.0` | 6.4.6 |
| `sql.js` | `^1.13.0` | 1.15.2 |
| `docx` | `^9.5.1` | 9.15.3 |
| `docxtemplater` | `^3.66.5` | 3.71.1 |
| `pizzip` | `^3.2.0` | 3.3.0 |
| `exceljs` | `^4.4.0` | 4.4.0 |
| Tailwind CSS | `^3.4.17` | 3.4.19 |
| `@vitejs/plugin-react` | `^4.3.4` | 4.7.0 |

الإصدارات المثبتة هي ناتج `npm list --depth=0` في بيئة المشروع؛ النطاقات المعلنة هي مرجع الاعتماديات في manifest. التفاصيل الكاملة موجودة في `package.json` و`package-lock.json`.

```powershell
npm install
powershell -ExecutionPolicy Bypass -File .\tools\generate-icons.ps1 # توليد الأيقونات (Windows)
npm run dev       # Vite على 127.0.0.1:5173 مع Electron
npm run build     # بناء واجهة الإنتاج إلى dist/
npm start         # بناء ثم تشغيل Electron
npm test          # اختبارات Node المدمجة
```

يستضيف Vite التطوير على loopback فقط (`127.0.0.1`) والمنفذ ثابت. التطبيق المبني يحمّل `dist/index.html`. ( `vite.config.js`، `main.js`، `package.json` )

## 2. هيكل المشروع

```text
D:\Maly
├── main.js                         عملية Electron الرئيسية وIPC والتصدير
├── preload.js                      واجهة financeApp الآمنة للـ renderer
├── package.json / package-lock.json الاعتماديات والأوامر وإصدارات القفل
├── index.html                      نقطة دخول HTML وCSP وخصائص العربية/RTL
├── vite.config.js                  إعداد Vite وReact ومضيف التطوير
├── build/icons/                    الأيقونة PNG وICO المشتقة لاستخدام Electron والتعبئة
├── public/favicon.png              أيقونة المتصفح المنسوخة إلى dist عند البناء
├── tools/generate-icons.ps1        توليد ملفات الأيقونات من صورة الشعار باستخدام PowerShell
├── tailwind.config.js              إعداد Tailwind والخطوط العربية
├── postcss.config.cjs              إعداد PostCSS/Tailwind
├── README.md                       توثيق الاستخدام الموجود
├── PROJECT_SUMMARY.md              هذا الملف
├── project-code.txt                لقطة/تجميع نصي للمشروع؛ غير مستورد في مسار التشغيل
├── dist/                           نواتج بناء الواجهة (مولّدة)
├── src/
│   ├── config/officialIdentity.json هوية الجهة والمسؤولين المستخدمة في المطبوعات
│   ├── data/mockInvoiceCatalog.js  كتالوج شركات وأصناف تجريبي
│   ├── database/database.js        إنشاء SQLite والترحيلات والاستعلامات والقفل والأرشيف
│   ├── pc/                         أصل صورة ثابتة؛ لا يظهر استخدامه في منطق التطبيق
│   ├── renderer/
│   │   ├── main.jsx                React root واستيراد CSS
│   │   ├── App.jsx                 صفحات التطبيق وحالة التنقل والفترات والنماذج
│   │   ├── styles.css              أنماط مشتركة وRTL/الطباعة
│   │   ├── components/
│   │   │   │   ├── Sidebar.jsx         القائمة الجانبية المدمجة والديناميكية
│   │   │   │   ├── OfficialHeader.jsx  الترويسة واختيار الشعار
│   │   │   │   ├── PenaltyForm.jsx     نموذج الفرد والإجراء/الجزاء ومعاينة النص
│   │   │   │   ├── PersonPicker.jsx    بحث واختيار الأفراد بالاسم/الرقم/الوحدة
│   │   │   │   ├── TemplatePicker.jsx  البحث في مكتبة النصوص وإضافة قالب ومعاينته
│   │   │   ├── TextTemplateManager.jsx إدارة النصوص وتعديل ترتيبها وإخفاؤها
│   │   │   └── DropdownOptionsManager.jsx إدارة القوائم التشغيلية والخيارات التقنية
│   │   └── sections/
│   │   │   ├── FieldDefinitionEditor.jsx تعريف حقول النماذج الفرعية وأنواعها
│   │   │   ├── RecordFieldInput.jsx   واجهات الحقول الديناميكية حسب النوع
│   │   │   ├── SectionManager.jsx     إدارة الأقسام والنماذج واستيراد تعريفاتها
│   │   │   └── SettingsPanel.jsx      إعداد إظهار شاشة الماهيات القديمة
│   └── services/
│       ├── arabicSearch.js         تطبيع العربية وترتيب نتائج بحث الأفراد
│       ├── sectionPresets.cjs      مقترحات اختيارية لحقول ونصوص الأقسام
│       ├── textTemplate.js         تعبئة عناصر النص العربي والمرادفات الإنجليزية
│       ├── docxTemplate.js         تعبئة قوالب Word ومفاتيح الجزاءات
│       ├── excelImport.js          استيراد الأفراد من XLSX/CSV
│       ├── invoiceDocument.js      إنشاء مستند الفاتورة
│       ├── monthlyReport.js        التقرير المالي الشهري
│       ├── payroll.js              دالة حساب صافي راتب؛ غير موصولة بمسار الواجهة الحالي
│       ├── wordDocument.js         مستند كشف الأفراد
│       └── wordReportStyle.js      تنسيق Word الرسمي والجداول والترويسة
└── tests/
    ├── database.test.js
    ├── docxTemplate.test.js
    ├── excelImport.test.js
    ├── monthlyReport.test.js
    ├── arabicSearch.test.js
    ├── textTemplate.test.js
    └── wordDocument.test.js
```

`node_modules/` اعتماديات مثبتة، وهو مجلد مولّد وغير مفصل أعلاه. ويستثني `.gitignore` كلاً من `node_modules/` و`dist/` وملفات قاعدة البيانات وملفات البيئة. ( `.gitignore` )

## 3. قاعدة البيانات والجداول والعلاقات والترحيلات

### المحرك ومكان الملف

- قاعدة SQLite عبر `sql.js` WebAssembly، وتُحمّل في الذاكرة عند بدء Electron. تُصدر قاعدة البيانات إلى ملف عند الحفظ، باستعمال ملف مؤقت ثم إعادة تسميته. ( `src/database/database.js` )
- المسار الفعلي: `path.join(app.getPath('userData'), 'finance_system.db')`. بالتالي مجلد التخزين يحدده Electron/نظام التشغيل للمستخدم الحالي، وليس مجلد المشروع. ( `main.js` )
- تفعّل `PRAGMA foreign_keys = ON`. الحقول الزمنية في المخطط غالباً `TEXT` مع `CURRENT_TIMESTAMP`؛ لا يوجد طبقة ORM أو ملف migrations منفصل، فالترحيلات البرمجية تنفذ أثناء `initializeDatabase`. ( `src/database/database.js` )
- المفتاح المالي في البيانات هو الشهر النصي `YYYY-MM` مثل `period_key` أو `effective_month` أو `month_key`؛ لا يوجد عمود FK عام باسم `period_id`. الفترة الفعالة تحفظ في `application_settings` باسم `active_period_key`. ( `src/database/database.js` )

### الجداول

تسرد الأنواع أدناه كما عُرّفت في SQL؛ لا يصرح SQLite بنوع منفصل للتاريخ، بل يخزن التاريخ كنص.

| الجدول | الأعمدة والأنواع والقيود المهمة | العلاقات والاستخدام |
|---|---|---|
| `personnel` | `military_number TEXT PK`، `full_name TEXT NOT NULL`، `rank TEXT DEFAULT ''`، `category TEXT NOT NULL DEFAULT ''`، `unit TEXT DEFAULT ''`، `notes TEXT DEFAULT ''`، `created_at TEXT`، `updated_at TEXT` | سجل الأفراد الرئيسي؛ يقبل الفئة النصية كما استوردت، وهو مرجع للماهيات والجزاءات والسجلات الفرعية. السجل العام ليس نسخة منفصلة لكل شهر. |
| `salaries_base` | `id INTEGER PK AUTOINCREMENT`، `military_number TEXT NOT NULL`، `base_salary REAL >= 0`، `allowances REAL >= 0`، `effective_month TEXT DEFAULT ''`، `UNIQUE(military_number,effective_month)` | FK إلى `personnel.military_number ON DELETE CASCADE`؛ راتب وبدلات للشخص في شهر. |
| `penalties` | `id INTEGER PK AUTOINCREMENT`، `military_number TEXT NOT NULL`، `penalty_type TEXT DEFAULT ''`، `days INTEGER >= 0`، `deduction_amount REAL >= 0`، `reason TEXT DEFAULT ''`، `action_date TEXT DEFAULT ''`، `clause_no TEXT DEFAULT ''`، `notes TEXT DEFAULT ''`، `created_at TEXT`، `period_key TEXT DEFAULT ''` | FK إلى الأفراد مع `ON DELETE CASCADE`؛ سجل إجراء شهري. أنواع الإجراءات من قائمة مستقلة قابلة للإدارة لكل قسم؛ يُشترط رقم بند الأمر عند الإنشاء. |
| `supply_orders` | `id INTEGER PK AUTOINCREMENT`، `order_number TEXT NOT NULL`، `order_date TEXT NOT NULL`، `supplier TEXT DEFAULT ''`، `description TEXT DEFAULT ''`، `amount REAL >= 0`، `status TEXT DEFAULT 'مسودة'`، `created_at TEXT`، `period_key TEXT DEFAULT ''`، `UNIQUE(order_number,period_key)` | بيانات أوامر التوريد؛ تظهر في قراءة التقرير الشهري والنسخ والأرشيف، لكن لا توجد شاشة/واجهة IPC لإدخالها في النسخة الحالية. |
| `dynamic_schemas` | `id INTEGER PK AUTOINCREMENT`، `schema_name TEXT UNIQUE NOT NULL`، `fields_json TEXT DEFAULT '[]'`، `created_at TEXT`، `updated_at TEXT` | لا يظهر استخدام فعلي له خارج إنشائه. الأقسام الديناميكية الفعلية تستخدم الجداول التالية. |
| `custom_modules` | `id TEXT PK`، `title TEXT UNIQUE NOT NULL`، `icon TEXT DEFAULT '▦'`، `is_builtin INTEGER CHECK 0/1`، `is_active INTEGER DEFAULT 1`، `sort_order INTEGER DEFAULT 100`، `created_at TEXT`، `updated_at TEXT`، `template_path TEXT NULL` | أقسام رئيسية مدمجة ومخصصة؛ الإخفاء يحفظ البيانات ولا يحذفها، والقسم الفرعي يشير إليها. |
| `custom_submodules` | `id TEXT PK`، `module_id TEXT NOT NULL`، `title TEXT NOT NULL`، `fields_json TEXT DEFAULT '[]'`، `template_path TEXT NULL`، `is_active INTEGER DEFAULT 1`، `sort_order INTEGER DEFAULT 100`، `created_at TEXT`، `updated_at TEXT`، `UNIQUE(module_id,title)` | FK إلى `custom_modules(id) ON DELETE CASCADE`؛ `fields_json` إصدار 2 بالشكل `{version,fields}` مع قراءة متوافقة لتعريفات `field_1...` القديمة. |
| `submodule_records` | `id INTEGER PK AUTOINCREMENT`، `submodule_id TEXT NOT NULL`، `data_json TEXT NOT NULL`، `created_at TEXT`، `period_key TEXT DEFAULT ''`، `military_number TEXT NULL`، `action_type TEXT NULL`، `action_days INTEGER NULL`، `action_reason TEXT NULL`، `action_date TEXT NULL`، `clause_no TEXT NULL` | FK إلى النموذج الفرعي `ON DELETE CASCADE`؛ `military_number` FK اختياري إلى الأفراد `ON DELETE SET NULL`. `data_json` يحمل قيم الحقول الديناميكية؛ رقم بند الأمر مطلوب للسجلات الجديدة، وتبقى السجلات القديمة قابلة للقراءة. |
| `custom_field_values` | `submodule_id TEXT`، `field_key TEXT`، `value TEXT`، `last_used_at TEXT`، `PK(submodule_id,field_key,value)` | اقتراح القيم السابقة لحقول «قيمة محفوظة»؛ FK إلى النموذج الفرعي مع `ON DELETE CASCADE`. |
| `audit_log` | `id INTEGER PK AUTOINCREMENT`، `entity_type TEXT`، `entity_id TEXT`، `action TEXT`، `period_key TEXT DEFAULT ''`، `details_json TEXT DEFAULT '{}'`، `created_at TEXT` | تسجيل إنشاء/تعديل/حذف سجلات النماذج؛ لا يتضمن هوية مستخدم لعدم وجود تسجيل دخول. |
| `application_settings` | `setting_key TEXT PK`، `setting_value TEXT NOT NULL`، `updated_at TEXT` | إعدادات عامة، منها `active_period_key` و`penalty_docx_template_path` و`institution_logo_path`. |
| `text_templates` | `id INTEGER PK AUTOINCREMENT`، `scope TEXT NOT NULL`، `kind TEXT DEFAULT ''`، `title TEXT NOT NULL`، `body TEXT NOT NULL`، `requires_days INTEGER CHECK 0/1 DEFAULT 0`، `sort_order INTEGER DEFAULT 100`، `is_active INTEGER CHECK 0/1 DEFAULT 1`، `created_at TEXT`، `updated_at TEXT` | مكتبة نصوص رئيسية خارج الفترة؛ النطاق `global` أو `penalties` أو معرّف قسم فرعي. إخفاء النص لا يحذف القوالب ولا يمس النص النهائي المخزن في السجلات. |
| `dropdown_options` | `option_id TEXT PK`، `group_id TEXT NOT NULL`، `scope_id TEXT DEFAULT ''`، `option_value TEXT NOT NULL`، `label TEXT NOT NULL`، `sort_order INTEGER DEFAULT 100`، `is_active INTEGER CHECK 0/1 DEFAULT 1`، `is_system INTEGER CHECK 0/1 DEFAULT 0`، `UNIQUE(group_id,scope_id,option_value)` | يخزن قوائم أنواع الإجراءات مستقلة لكل قسم وتفضيلات عرض الخيارات التقنية؛ القيم التقنية لا تُضاف أو تُحذف، بل يعاد تسميتها أو ترتيبها أو إخفاؤها. |
| `financial_periods` | `month_key TEXT PK`، `start_date TEXT NOT NULL`، `end_date TEXT NOT NULL`، `is_locked INTEGER CHECK 0/1 DEFAULT 0`، `locked_at TEXT NULL`، `created_at TEXT`، `updated_at TEXT`، `CHECK(start_date <= end_date)` | سجل نطاق وحالة كل فترة شهرية. الربط من جداول البيانات نصي وليس FK. |
| `monthly_archives` | `month_key TEXT PK`، `snapshot_json TEXT NOT NULL`، `revision INTEGER DEFAULT 1`، `closed_at TEXT`، `updated_at TEXT` | لقطة JSON الحالية المعتمدة للشهر؛ مفتاحها يطابق الفترة. |
| `monthly_archive_audit` | `id INTEGER PK AUTOINCREMENT`، `month_key TEXT NOT NULL`، `action TEXT NOT NULL`، `details TEXT DEFAULT ''`، `created_at TEXT` | FK إلى `monthly_archives(month_key) ON DELETE CASCADE`. يتضمن الإقفال وإعادة الفتح والتعديلات بعد الأرشفة والنسخ. تمنع triggers التعديل والحذف. |
| `monthly_archive_revisions` | `month_key TEXT NOT NULL`، `revision INTEGER NOT NULL`، `snapshot_json TEXT NOT NULL`، `created_at TEXT`، `PK(month_key,revision)` | FK إلى الأرشيف `ON DELETE CASCADE`؛ سجل اللقطات السابقة. |
| `monthly_archive_copies` | `source_month TEXT`، `target_month TEXT`، `source_revision INTEGER`، `copied_at TEXT`، `PK(source_month,target_month,source_revision)` | يسجل النسخ مرة لكل إصدار مصدر ووجهة؛ لا توجد FK معرفة في المخطط. |
| `invoice_companies` | `code TEXT PK`، `name TEXT NOT NULL`، `category TEXT NOT NULL`، `commercial_register TEXT DEFAULT ''`، `tax_card TEXT DEFAULT ''`، `address TEXT DEFAULT ''`، `phone TEXT DEFAULT ''`، `is_custom INTEGER CHECK 0/1 DEFAULT 0` | شركة/مورد كتالوج؛ بيانات رئيسية مستقلة عن الشهر. |
| `invoice_products` | `code TEXT PK`، `company_code TEXT NOT NULL`، `description TEXT NOT NULL`، `unit TEXT NOT NULL`، `unit_price REAL >= 0`، `sort_order INTEGER DEFAULT 0` | FK إلى `invoice_companies(code) ON DELETE CASCADE`. |
| `invoices` | `id INTEGER PK AUTOINCREMENT`، `invoice_number TEXT NOT NULL`، `company_code TEXT NOT NULL`، `invoice_date TEXT NOT NULL`، `period_key TEXT NOT NULL`، `subtotal REAL >= 0`، `vat_rate REAL DEFAULT 0.14 CHECK = 0.14`، `vat_amount REAL >= 0`، `grand_total REAL >= 0`، `company_snapshot_json TEXT DEFAULT '{}'`، `header_fields_json TEXT DEFAULT '[]'`، `layout_json TEXT DEFAULT '[]'`، `template_id TEXT DEFAULT 'classic'`، `created_at TEXT`، `UNIQUE(invoice_number,period_key)` | FK إلى الشركة. يحتفظ بنسخة بيانات الشركة والترويسة والتصميم وقت إنشاء الفاتورة. |
| `invoice_items` | `id INTEGER PK AUTOINCREMENT`، `invoice_id INTEGER NOT NULL`، `serial INTEGER NOT NULL`، `product_code TEXT NOT NULL`، `description TEXT NOT NULL`، `unit TEXT NOT NULL`، `unit_price REAL >= 0`، `quantity REAL > 0`، `total REAL >= 0`، `UNIQUE(invoice_id,serial)` | FK إلى الفاتورة `ON DELETE CASCADE` وإلى الصنف. يحتفظ بوصف وسعر لقطة الصنف. |

### الترحيلات والحماية

- `migrateSalaryBase`: ينقل جدول الرواتب القديم ذي سجل واحد للشخص إلى مخطط يسمح بسجل لكل شهر، مع الحفاظ على الصفوف. ( `src/database/database.js` )
- `migrateSupplyOrders`: ينقل القيد القديم الذي كان يجعل رقم الأمر فريداً كلياً إلى التفرد لكل شهر، ويحافظ على الصفوف. ( `src/database/database.js` )
- `migratePenalties`: يزيل قيد أنواع الجزاء القديم ويضيف السبب والتاريخ والبند ومفتاح الشهر؛ يحاول ترحيل القيمة القديمة من `notes`/`penalty_type`. ( `src/database/database.js` )
- تهيئة `dropdown_options` تزرع أنواع الإجراءات مستقلة لكل قسم وتحوّل قيم السجلات القديمة إلى مفاتيح ثابتة؛ مشغلات SQLite والتحقق الخلفي يفرضان رقم بند الأمر في الجزاءات والسجلات الفرعية الجديدة، دون تغيير السجلات التاريخية. ( `src/database/database.js` )
- ترحيل محرك الأقسام: قبل أول تحديث لمخطط الأقسام تنسخ قاعدة موجودة إلى ملف بجوار الأصل باسم مؤرخ `*.pre-section-engine-<timestamp>.bak`. تضيف التهيئة أعمدة الإخفاء والتحديث، وتحوّل تعريفات الحقول القديمة إلى `{version:2,fields:[...]}` دون تغيير `submodule_records.data_json` أو مفاتيح `field_1...`؛ يسجل الإصدار في `application_settings.section_engine_schema_version` لمنع تكرار النسخة الاحتياطية. ( `src/database/database.js` )
- `addColumnIfMissing`: يضيف أعمدة الفترة للجداول القديمة، وحقول ربط/بيانات الإجراء للسجلات الفرعية، و`custom_modules.template_path`، وحقول الشركات ولقطات الفواتير وحقول layout/template. ( `src/database/database.js` )
- `migrateFinancialPeriods`: ينشئ سجلات فترات مقفلة للأرشيفات القديمة، مع نطاق ميلادي افتراضي. تُرحّل revisions للأرشيفات بحسب حالة القفل. ( `src/database/database.js` )
- تنشأ `text_templates` بطريقة `CREATE TABLE IF NOT EXISTS`؛ إذا وُجدت بيانات من جدول وسيط `action_templates` تُنسخ إلى النطاق `penalties`. لا تزرع التهيئة أسباباً أو أقساماً/نماذج فرعية للمستخدم تلقائياً؛ النماذج والنصوص المقترحة لا تُحفظ إلا باختيار المستخدم عند إنشاء قسم. لا تحذف التهيئة بيانات قديمة موجودة. ( `src/database/database.js`، `src/services/sectionPresets.cjs` )
- `updateUnassignedMonths`: يعيّن الشهر الحالي للسجلات القديمة ذات الشهر الفارغ إذا لم تكن الفترة الحالية مقفلة؛ يتجنب تعديل السجلات القديمة إذا كانت مقفلة. ( `src/database/database.js` )
- عند غياب `active_period_key` ينشأ إعداد للفترة الميلادية الحالية. تفعيل شهر آخر ينشئ سجل نطاقه الافتراضي ويحفظ المفتاح في الإعدادات. ( `src/database/database.js` )
- مشغلات SQLite تمنع insert/update/delete للسجلات الشهرية المقفلة، بما فيها عناصر الفاتورة بالتحقق من فاتورتها، وتحمي الأرشيف والإصدارات وسجل المراجعة. كما تسجل مشغلة إعادة فتح الفترة حدث `unlocked`. لا توجد مشغلات تمنع تعديل الأفراد الرئيسيين بناء على فترة شهرية. ( `src/database/database.js` )

## 4. الأقسام والحقول وسلوك التسجيل

ملفات الواجهة الرئيسية والمنطق هي `src/renderer/App.jsx` و`src/renderer/components/*`؛ قواعد البيانات والتحقق في `src/database/database.js`؛ وتسجيل IPC/الملفات في `main.js`.

| القسم | الحقول المتغيرة عند التسجيل | الثابت/المشتق | المستند والتصدير والحالة |
|---|---|---|---|
| لوحة المتابعة | اختيار الشهر والنطاق، اسم القسم المخصص، اختيار «فارغ» أو أحد النماذج الجاهزة اختيارياً | مؤشرات السجلات تُقرأ من الفترة؛ بطاقة الماهيات تعرض مجموع الأساسي والبدلات المدخلة كما لو كان إجمالياً. هذا قد يكون مضللاً لأن المكتب لا يحسب المبالغ | تصدير التقرير الشهري العام؛ النماذج المقترحة لا تُنشأ إلا عند اختيارها. توجد إعدادات لإخفاء شاشة الماهيات القديمة دون حذف البيانات. ( `src/renderer/App.jsx`، `src/renderer/components/Sidebar.jsx`، `src/renderer/sections/SettingsPanel.jsx`، `src/database/database.js` ) |
| سجل الأفراد | استيراد XLSX/CSV مع حفظ رؤوس الأعمدة الأصلية والحقول الإضافية؛ تحديث الاسم والرتبة والفئة والوحدة والملاحظات عند تكرار الرقم | الرقم العسكري هو مفتاح الهوية؛ الفئة اختيارية وتقبل أي قيمة نصية. السجل العام لا يتبع شهراً بعينه | بحث واجهة بالاسم أو الرقم العسكري، كشف Word رسمي وطباعة؛ الاستيراد عبر الواجهة يتطلب تفعيل شهر مفتوح لكنه يحدث جدول أفراد مشتركاً. ( `src/renderer/App.jsx`، `src/services/excelImport.js`، `src/services/wordDocument.js`، `src/database/database.js` ) |
| الماهيات | اختيار الفرد بمكوّن بحث، `base_salary`, `allowances`; الشهر يأتي من الفترة المعروضة/النشطة | `military_number` و`effective_month` مفتاحا منع التكرار؛ المبالغ غير سالبة. لا توجد خصومات محسوبة | الحفظ upsert للشخص والشهر. الإجمالي في dashboard هو الأساسي + البدلات؛ `src/services/payroll.js` يحسب الأساسي + البدلات - الخصومات لكنه غير مستعمل في مسار الرواتب الحالي. لا يوجد تصدير رواتب منفصل؛ تظهر في التقرير الشهري. ( `src/renderer/App.jsx`، `src/renderer/components/PersonPicker.jsx`، `src/services/payroll.js`، `src/database/database.js`، `src/services/monthlyReport.js` ) |
| الجزاءات والشطب | اختيار الفرد بمكوّن بحث، نوع الإجراء، نص من مكتبة `text_templates` أو نص حر، والمدة/التاريخ/رقم البند | النص النهائي قابل للتعديل لهذا السجل وحده ويحفظ في `penalties.reason`؛ تعديل أو إخفاء قالب لا يغير الجزاءات أو snapshots القديمة. المكتبة بيانات رئيسية خارج الفترة. | توليد نصوص من عناصر عربية مثل `{الاسم}` و`{المدة}`، مع معاينة وإمكانية إضافة قالب. إدارة المكتبة من لوحة المتابعة. تصدير DOCX للجزاءات مستمر. ( `src/renderer/components/PenaltyForm.jsx`، `src/renderer/components/TemplatePicker.jsx`، `src/renderer/components/TextTemplateManager.jsx`، `src/database/database.js`، `main.js`، `src/services/textTemplate.js`، `src/services/docxTemplate.js` ) |
| أوامر التوريد | المخطط القديم `supply_orders`: رقم الأمر، التاريخ، المورد، البيان، القيمة، الحالة، الشهر. وفق تعريف المستخدم، أمر التوريد هنا إخطار استرداد مبالغ من فرد (رفد/إنهاء خدمة أو جزاء)، وليس مشتريات | لا يضيف محرك الأقسام حساباً أو معادلة؛ لا تزال أعمدة وقيم الجدول القديم كما هي | لا توجد واجهة تشغيلية أو قناة IPC لإضافة/تعديل أمر توريد. توجد قراءة قديمة ضمن `getMonthData` والتقرير والنسخ؛ بطاقة لوحة المتابعة تجمع `amount` المسجل حالياً، وقد لا يلائم معنى الإخطار. نموذج «أمر توريد» في المعرض اختياري وقابل للتعديل ولا ينفذ حساباً. ( `src/database/database.js`، `src/services/monthlyReport.js`، `src/services/sectionPresets.cjs`، `src/renderer/App.jsx` ) |
| الفواتير الإلكترونية | رقم الفاتورة، الشركة، تاريخها، المورد الظاهر، حقول الترويسة وترتيبها، تصميم الفاتورة، الأصناف والأسعار والكميات | VAT ثابت 14%؛ الأسعار والكميات والإجماليات تتحقق وتحسب في قاعدة البيانات؛ رقم الفاتورة فريد في الشهر. كتالوج البداية تجريبي، ويمكن إضافة شركة/أصناف خاصة | تخزين فاتورة وعناصرها في معاملة واحدة ولقطة بيانات الشركة/الترويسة. إخراج PDF عبر نافذة طباعة Electron أو DOCX مولد بتنسيق مستقل. التصاميم: classic/modern/framed/sidebar. لا يوجد قالب DOCX مستخدم لاستبدال placeholders في الفواتير. ( `src/renderer/App.jsx`، `src/database/database.js`، `src/data/mockInvoiceCatalog.js`، `src/services/invoiceDocument.js`، `main.js` ) |
| الأقسام الرئيسية المخصصة | إنشاء القسم بالاسم (وأيقونة اختيارية) ينشئ قسماً فارغاً بلا نموذج فرعي؛ يمكن اختيار نموذج من المعرض اختيارياً: إخطار خصم بالأيام أو بالنسبة، أمر توريد لرفد/إنهاء خدمة، أو أمر توريد لجزاء. | لا تُنشأ النماذج أو نصوصها المقترحة تلقائياً؛ لا تُحذف البيانات الموجودة مسبقاً. تعريف الحقول في `fields_json` بصيغة إصدار 2، والسجلات تحفظ JSON بمفاتيح متوافقة `field_1...` و`period_key`. | يمكن تعريف حتى 100 حقل، والبحث والتصفية والتعديل والحذف، وسجل المراجعة، والتسجيل الجماعي الذري، وDOCX، والإخفاء وإعادة التسمية والنسخ وتبادل JSON. زر الجزاء ينقل إلى نموذج آخر ويملأ الفرد ورابط الجزاء. لا توجد معادلات أو احتساب مبالغ. ( `src/renderer/App.jsx`، `src/renderer/sections/`، `src/renderer/components/PersonPicker.jsx`، `src/renderer/components/TemplatePicker.jsx`، `src/services/sectionPresets.cjs`، `src/database/database.js`، `main.js` ) |
| نماذج الجزاءات الفرعية | لا تُزرع نماذج جزاءات جديدة في قاعدة جديدة؛ عند اختيار «إنشاء سجل في قسم آخر» تظهر النماذج التي تضم حقلي فرد وربط بسجل، ويُملأ الفرد ومعرّف الجزاء المرتبط | رابط الجزاء يحفظ بصيغة `penalty:<id>` في حقل `linked_record`؛ يتحقق backend من وجود الجزاء ضمن الفترة نفسها. النماذج القديمة الموجودة لا تُحذف | المستخدم يكمل بقية الحقول ويحفظ السجل في النموذج المستهدف. ( `src/renderer/App.jsx`، `src/database/database.js`، `src/renderer/sections/RecordFieldInput.jsx` ) |

### الفترة النشطة والقفل

الشهر المختار في التحكم ليس تلقائياً فعالاً بمجرد عرضه: يلزم حفظ النطاق المعدل ثم **فتح بداية الشهر**. يحفظ المفتاح في `application_settings.active_period_key`، وتتحقق عملية Electron الرئيسية من أنه الشهر النشط وغير المقفل عند حفظ الرواتب والفواتير والجزاءات وسجلات النماذج واستيراد الأفراد. الشاشة تعرض الفترات غير النشطة للقراءة فقط. إقفال الشهر ينشئ snapshot JSON ويقفل الفترة؛ إعادة الفتح تتطلب تأكيداً. يمكن تقنياً إقفال فترة مفتوحة مختارة حتى إن لم تكن الفترة النشطة. ( `src/renderer/App.jsx`، `main.js`، `src/database/database.js` )

## 5. ربط الواجهة بعملية Electron (IPC)

لا يستدعي renderer قاعدة البيانات مباشرة. يرسل `preload.js` طلبات `ipcRenderer.invoke` مسماة؛ `main.js` يرد بغلاف داخلي `{ ok: true, data }` أو `{ ok: false, error: { message } }`، و`preload.js` يعيد `data` أو يرمي الخطأ. لا يوجد HTTP API أو backend server. ( `preload.js`، `main.js` )

### قنوات الاستعلام والعمليات

| قناة IPC | مدخلات | نتيجة النجاح |
|---|---|---|
| `app:get-status` | لا شيء | مسار قاعدة البيانات وحالة packaging |
| `personnel:list` | لا شيء | صفوف سجل الأفراد |
| `modules:list` | لا شيء | الأقسام مع النماذج الفرعية والحقول ومسارات القوالب |
| `branding:get-logo` | لا شيء | data URL للشعار أو `null` |
| `branding:select-logo` | لا شيء | اختيار ملف، ثم `{ canceled, dataUrl }` |
| `month:get-current`, `month:active:get` | لا شيء | مفتاح الفترة النشطة |
| `month:active:set` | `monthKey` | الفترة بعد تفعيلها؛ يرفض الفترة المقفلة |
| `month:data`, `finance:load-data` | `monthKey` | بيانات الشهر: أفراد، رواتب، جزاءات، توريد، فواتير، سجلات مخصصة |
| `month:period:get` | `monthKey` | نطاق الفترة وحالة القفل |
| `month:period:set-range` | `{ monthKey, startDate, endDate }` | الفترة بعد حفظ النطاق |
| `salaries:list` | `monthKey` | رواتب الشهر |
| `salaries:save` | `{ monthKey, militaryNumber, baseSalary, allowances }` | قائمة رواتب الشهر بعد upsert |
| `invoices:companies` | لا شيء | الشركات وكل شركة وأصنافها |
| `invoices:company:add` | بيانات الشركة | الشركة المحفوظة |
| `invoices:company:update` | بيانات الشركة مع `code` | الشركة المحدثة؛ يسمح بتحديث الشركات الخاصة فقط |
| `invoices:product:add` | `{ companyCode, description, unit, unitPrice }` | بيانات الشركة/أصنافها بعد الإضافة |
| `invoices:list` | `monthKey` | فواتير الشهر وعناصرها وبيانات اللقطة |
| `invoices:save` | رقم/تاريخ/شركة/شهر/أصناف/ترويسة/layout/template | `{ invoice, invoices, monthData }` |
| `invoices:export-docx` | `invoiceId` | `{ canceled }` أو مسار الملف |
| `penalties:add` | `{ monthKey, militaryNumber, penaltyType, days, reason, actionDate, clauseNo }` | الجزاءات وبيانات الشهر |
| `textTemplates:list` | `{ includeArchived?, scope? }` أو لا شيء | قائمة النصوص الجاهزة مع إمكانية تصفية النطاق أو تضمين المخفي |
| `textTemplates:add` | `{ scope, kind, title, body, requiresDays, sortOrder }` | النص المحفوظ بعد تحقق قاعدة البيانات |
| `textTemplates:update` | بيانات النص مع `id` | النص بعد تحديث النطاق/النوع/المحتوى/الترتيب |
| `textTemplates:archive` | `id` | إخفاء النص وتعيين `is_active=0` دون حذف |
| `penalties:template:get` | لا شيء | مسار قالب الجزاءات أو null |
| `penalties:template:select` | لا شيء | اختيار DOCX ونسخه إلى مجلد قوالب AppData وربطه بإعداد الجزاءات |
| `penalties:export-word` | `penaltyId` أو قائمة معرّفات | إنشاء ملف DOCX من القالب؛ تضمّن الدفعة المحددة نسخة من النموذج لكل سجل |
| `month:archives:list` | لا شيء | قائمة الأرشيفات وإصداراتها وحالة القفل |
| `month:archives:get` | `monthKey` | `{ archive, audit, revisions }` |
| `month:archives:revision` | `monthKey, revision` | إصدار snapshot المطلوب |
| `month:archives:save`, `finance:save-data` | `monthKey` | تأكيد إقفال ثم `{ canceled, archive, archives }` |
| `month:period:unlock`, `finance:toggle-archive-lock` | `monthKey` | تأكيد إعادة الفتح وبيانات الشهر والأرشيف والتدقيق |
| `month:archives:copy-to-current` | `sourceMonth` | نسخ إلى الفترة النشطة بعد تأكيد؛ `{ targetMonth, data }` |
| `month:report:export-word`, `finance:export-docx` | `monthKey` | إنشاء تقرير شهري DOCX |
| `finance:export-pdf`, `documents:open-print-dialog` | لا شيء | فتح طباعة العرض الحالي أو إلغاء |
| `settings:legacy-salaries-visible:get/set` | لا شيء للقراءة، وقيمة boolean للكتابة | تفضيل محلي لإظهار شاشة الماهيات القديمة؛ إخفاؤها لا يحذف الجدول أو البيانات |
| `modules:presets:list` | لا شيء | معرفات وعناوين المقترحات المتاحة؛ لا تُنشأ بيانات عند الاستعلام |
| `modules:add` | عنوان، أيقونة اختيارية، ومعرف نموذج اختياري | `{ modules, moduleId, submoduleId }`؛ ينشئ القسم فارغاً افتراضياً، أو ينشئ النموذج والنصوص داخل معاملة عند اختيار اقتراح |
| `modules:update`, `modules:archive`, `modules:restore`, `modules:copy` | معرّف القسم وحقول العملية | تحديث الاسم/الأيقونة، إخفاء أو إظهار، أو نسخ الحقول والنصوص |
| `modules:definition:export`, `modules:definition:preview-import`, `modules:definition:import` | معرّف التصدير أو تعريف JSON واسم | تصدير JSON أو معاينة الملف وتأكيد استيراده باسم غير متعارض |
| `modules:template:select` | `moduleId` | اختيار DOCX ونسخه إلى مجلد قوالب AppData وربطه بالقسم الرئيسي |
| `modules:template:export` | `moduleId, monthKey, recordIds?` | تصدير التقرير، أو إنشاء ملف متعدد الصفحات من السجلات المحددة |
| `submodules:add`, `submodules:update`, `submodules:archive`, `submodules:restore` | تعريف النموذج والحقول وأنواعها | إدارة النموذج وحالته دون حذف سجلاته |
| `submodule:records:list` | `submoduleId, monthKey` | سجلات النموذج |
| `submodule:records:add` | `{ submoduleId, data, monthKey, action? }` | قائمة سجلات النموذج بعد الإضافة |
| `submodule:records:add-bulk`, `submodule:records:update`, `submodule:records:delete` | سجلات الدفعة أو معرّف السجل وبياناته والفترة | تسجيل ذري أو تعديل/حذف مع سجل مراجعة؛ تخضع لفتح الفترة النشطة |
| `submodule:field-values:list` | `submoduleId, fieldKey, query` | اقتراح القيم السابقة |
| `submodule:template:select` | `submoduleId` | اختيار DOCX ونسخه إلى مجلد قوالب AppData وربطه بالنموذج الفرعي |
| `submodule:template:render` | `{ recordIds, monthKey }` أو `recordId` قديم | قالب `{#records}` يكرر صفوفه المحددة؛ القالب القديم دون حلقة يخرج صفحة لكل سجل |
| `personnel:import` | `monthKey` | `{ canceled, imported, rejected, errors }` |
| `personnel:import:cancel` | `previewId` | إلغاء معاينة الاستيراد وإزالة بياناتها المؤقتة |
| `personnel:export-word` | لا شيء | `{ canceled, exported }` |

القنوات معرفة ومسجلة في `main.js`، وتغليفها في `preload.js`. قناتا `finance:*` وبعض قنوات الشهر بدائل توافقية لمسارات أقدم. إعدادات الشركات والأصناف قنوات كتابة رئيسية ولا ترتبط بشهر؛ إنشاء فاتورة نفسه مرتبط بالفترة النشطة.

## 6. القوالب والمستندات

### قوالب DOCX القابلة للتعبئة

- تعتمد `renderWordTemplate` على `docxtemplater` و`pizzip`: تقرأ الملف DOCX وتستبدل الوسوم داخل محتوى القالب ثم تكتب DOCX جديداً. الصفوف ذات الوسوم `{#records}` و`{/records}` تكرر بيانات جميع السجلات المحددة؛ وتُضبط خصائص RTL/Bidi لفقرات وحقول النص العربي دون عكس سلسلة الاسم. الملف الأصلي لا يُستبدل؛ الحقول غير المتوافقة أو قالب تالف يعيدان خطأ. الحفاظ على كل جوانب تنسيق Word بنسبة 100% غير مضمون من الكود أو الاختبارات. ( `src/services/docxTemplate.js` )
- ملفات القوالب ليست مخزنة داخل SQLite كـ binary؛ تحفظ مساراتها فقط. مسار جزاءات عام في `application_settings.penalty_docx_template_path`، ومسار للقسم الرئيسي في `custom_modules.template_path`، ومسار للنموذج الفرعي في `custom_submodules.template_path`. إن لم يعين قالب فرعي، يمكنه وراثة قالب القسم الرئيسي. ( `main.js`، `src/database/database.js` )
- مكتبة النصوص الجاهزة منفصلة عن ملفات DOCX: تحفظ النصوص في `text_templates` بنطاق عام أو جزاءات أو قسم فرعي، ولا تتأثر بقفل الفترة. العناصر العربية المدعومة تشمل `{الاسم}` و`{الرتبة}` و`{الرقم_العسكري}` و`{المدة}` و`{رقم_البند}` و`{التاريخ}`؛ وتدعم خدمة تعبئة النص كذلك مرادفات DOCX الإنجليزية مثل `{NAME}` و`{MILITARY_ID}` و`{PENALTY_REASON}` و`{GENERATED_TEXT}`، إضافة إلى حقول القسم بصيغة `{اسم_الحقل}`. يحفظ السجل الناتج نصاً نهائياً في `penalties.reason` أو `submodule_records.action_reason` كي لا تتغير البيانات التاريخية بتعديل القالب. ( `src/database/database.js`، `src/services/textTemplate.js`، `src/renderer/components/TemplatePicker.jsx`، `src/renderer/components/PenaltyForm.jsx` )
- قالب الجزاءات يدعم: `{NAME}`، `{MILITARY_ID}`، `{RANK}`، `{PENALTY_REASON}`، `{PENALTY_DAYS}`، `{PENALTY_TYPE}`، `{DATE}`، `{CLAUSE_NO}`، `{GENERATED_TEXT}`، `{PENALTY_TEXT}`. مفاتيح الهوية التي تضاف للتصدير تشمل `{organization}`، `{unit_commander}`، `{finance_chief}`، `{software_engineer}`. سجلات النماذج المرتبطة بالإجراء تضيف `{operations_chief}` و`{sergeant}` و`{acting_official}`. ( `src/services/docxTemplate.js`، `main.js` )
- قالب النموذج الفرعي يدعم مفاتيح كل حقل التي يولدها تعريف النموذج مثل `{field_1}`، مع مفاتيح الجزاء/الهوية أعلاه عند توفرها. مفاتيح السجل قيم نصية محفوظة في `data_json`. ( `src/renderer/App.jsx`، `main.js` )
- قالب التقرير العام للقسم يدعم `{moduleTitle}`، `{moduleId}`، `{monthKey}`، `{periodStart}`، `{periodEnd}`، `{periodId}`، `{totalRecords}`. للتكرار يستخدم Docxtemplater صيغة `{#records}...{/records}`، وتكون مفاتيح خصائص كل سجل هي أسماء أعمدة السجل أو الحقول المخصصة. كما تتوفر صيغ uppercase للبيانات الأساسية: `{MODULE_TITLE}`، `{MODULE_ID}`، `{MONTH_KEY}`، `{PERIOD_START}`، `{PERIOD_END}`، `{PERIOD_ID}`، `{TOTAL_RECORDS}`؛ وحقول هوية الجهة الصغيرة. ( `main.js`، `src/renderer/App.jsx` )
- الاختبارات تتحقق من تعبئة placeholders وتكرار سجلين داخل منطقة `records`؛ ولا تثبت التوافق مع كل تنسيقات/أجزاء DOCX الممكنة. ( `tests/docxTemplate.test.js` )

### ترويسات ومستندات مولدة وليست قوالب مرفقة

- التقرير المالي الشهري وكشف الأفراد ينشآن من الصفر باستخدام مكتبة `docx`: اتجاه RTL، خط Arial، إطار وهوامش وجداول مظللة وترويسة وهوية وتوقيعات، مع شعار اختياري في التقارير. ( `src/services/monthlyReport.js`، `src/services/wordDocument.js`، `src/services/wordReportStyle.js` )
- الفاتورة تحفظ الترويسة كقائمة `header_fields_json` وlayout بعناصر حقول/فواصل؛ التصاميم الأربعة تنشأ برمجياً في DOCX أو CSS للطباعة، ولا تستخدم ملف DOCX خارجي. الترويسة المستقلة لا تأخذ هوية الفوج. ( `src/renderer/App.jsx`، `src/services/invoiceDocument.js`، `src/database/database.js` )
- شعار المؤسسة صورة PNG/JPEG، تحفظ نسخة في مجلد branding داخل `app.getPath('userData')`، والمسار يخزن في الإعدادات؛ الحد الأقصى للتحقق من حجم ملف الشعار 5 ميجابايت. ( `main.js` )

## 7. الاستيراد والتصدير

- **استيراد الأفراد:** موجود فعلياً بصيغتي `.xlsx` و`.csv` عبر ExcelJS، ويقرأ ورقة العمل الأولى وصف العناوين. يلزم ربط الرقم العسكري والاسم؛ الفئة اختيارية وتقبل أي نص. الاستيراد آمن بنمط upsert: يحدث الرقم العسكري المطابق ويضيف الجديد، ولا يحذف الأشخاص الغائبين أو الرواتب والجزاءات والسجلات التاريخية. تُستبدل بيانات الأعمدة المستوردة للسجلات المحدّثة وتُزال رؤوس الأعمدة غير الموجودة من إعدادات الشيت النشط لمنع ظهور قيم قديمة في الطباعة؛ وتبقى بيانات الأشخاص الآخرين محفوظة. ( `src/services/excelImport.js`، `src/database/database.js`، `main.js` )
- **تكرار صف جدول DOCX:** للطباعة المجمعة، يوضع `{#records}` في أول خلية من صف البيانات و`{/records}` في آخر خلية من الصف نفسه. تُعبأ الحقول من سجل الحلقة نفسه؛ القوالب القديمة بلا الحلقة تحتفظ بسلوك الصفحة لكل سجل. ( `src/services/docxTemplate.js` )
- **Word DOCX:** تصدير التقرير الشهري، كشف الأفراد، قرار الجزاء من قالب، سجل فرعي من قالب، تقرير قسم من قالب، وفاتورة مولدة. ( `main.js`، `src/services/*.js` )
- **PDF/طباعة:** لا ينشأ PDF من خدمة خارجية؛ تفتح نافذة الطباعة المدمجة في Electron ويمكن للمستخدم اختيار الطباعة أو الحفظ PDF. بعض الشاشات لها صفحات طباعة خاصة. ( `main.js`، `src/renderer/App.jsx`، `src/renderer/styles.css` )
- لا يظهر تصدير Excel/CSV للبيانات، ولا استيراد فواتير أو أوامر توريد. قوالب Word المرفقة DOCX فقط. ( `main.js`، `src/services/excelImport.js` )

## 8. الأفراد واختيارهم في الواجهات

يوجد جدول `personnel` يحفظ الرقم العسكري (المفتاح)، الاسم، الرتبة، الفئة، الوحدة، الملاحظات والطوابع الزمنية. الاستيراد هو مسار الإضافة/التحديث الظاهر؛ لا توجد شاشة CRUD يدوية للأفراد. ( `src/database/database.js`، `src/renderer/App.jsx` )

- صفحة سجل الأفراد فيها حقل بحث/تصفية بالاسم أو الرقم العسكري أو الوحدة. ( `src/renderer/App.jsx` )
- نماذج الماهيات والجزاءات والسجلات الفرعية المرتبطة بإجراء تستخدم `PersonPicker`: بحث فوري بالاسم أو الرقم العسكري أو الوحدة، مع تطبيع الحروف العربية والأرقام وترتيب نتائج أولوية بدايات الأسماء. ( `src/renderer/components/PersonPicker.jsx`، `src/services/arabicSearch.js`، `src/renderer/App.jsx`، `src/renderer/components/PenaltyForm.jsx` )
- يعرض الاختيار الرتبة والاسم والرقم والوحدة؛ ويمكن التنقل بالأسهم وEnter وEscape، وTab يختار النتيجة الوحيدة. البحث مقيّد بثمانية نتائج مع حساب memoized. ( `src/renderer/components/PersonPicker.jsx` )
- الأفراد كيان رئيسي عالمي مشترك، وليس snapshot مستقل لكل فترة في جدول التشغيل؛ snapshot الأرشيف يحفظ قائمة الأفراد كما كانت عند إقفال الفترة. قد يتأثر سجل الفترة المؤرشف بتغييرات سجل الأفراد العام في العرض الحي خارج snapshot. ( `src/database/database.js` )

## 9. المكونات المشتركة وإعادة الاستخدام

- `OfficialHeader`: رأس التطبيق والشعار، قابل لإعادة الاستخدام. ( `src/renderer/components/OfficialHeader.jsx` )
- `Sidebar`: قائمة ثابتة للأقسام الأساسية وتستقبل الأقسام الديناميكية من DB. ( `src/renderer/components/Sidebar.jsx` )
- `PenaltyForm`: اختيار الفرد وحقول الإجراء واختيار نص جاهز/نص حر وتعديل النص النهائي لهذا السجل؛ يستخدمه مسار الجزاءات والسجلات الفرعية المرتبطة. ( `src/renderer/components/PenaltyForm.jsx` )
- `TemplatePicker` و`TextTemplateManager`: البحث والإضافة والمعاينة في مكتبة النصوص، وإدارة العناوين والنطاقات والترتيب والإخفاء. ( `src/renderer/components/TemplatePicker.jsx`، `src/renderer/components/TextTemplateManager.jsx` )
- `PersonPicker` مع `arabicSearch.js`: اختيار فرد قابل للبحث بلوحة المفاتيح وتطبيع/ترتيب نص عربي مستقل عن DOM. ( `src/renderer/components/PersonPicker.jsx`، `src/services/arabicSearch.js` )
- محرك الأقسام في `src/renderer/sections/`: `SectionManager` لإعادة التسمية والإخفاء والنسخ وتبادل JSON، و`FieldDefinitionEditor` لتعريف أنواع الحقول، و`RecordFieldInput` لواجهات الإدخال حسب النوع. يدير App الفترة وIPC، بينما الحفظ والتحقق والمعاملات في قاعدة البيانات. ( `src/renderer/sections/SectionManager.jsx`، `src/renderer/sections/FieldDefinitionEditor.jsx`، `src/renderer/sections/RecordFieldInput.jsx`، `src/renderer/App.jsx` )
- في `App.jsx` توجد مكونات داخلية مشتركة مثل `StatCard` و`MonthlyControls` و`ArchiveSnapshot` و`ModuleView` و`SubmoduleWorkspace` و`ModuleTemplateControls` و`InvoicePrintSheet`.
- لا توجد مجلدات hooks أو utils مشتركة مستقلة، ولا اعتماد على React Router. استدعاءات preload تمر عبر `window.financeApp` ودالة التوافق `callFinanceApp`. ( `src/renderer/App.jsx`، `preload.js` )
- خدمات قابلة لإعادة الاستخدام: تطبيع/بحث عربي، تعبئة نصوص جاهزة، استيراد Excel/CSV، حساب صافي راتب غير موصول، توليد قوالب Word، إنشاء تقارير وفواتير وكشف أفراد. ( `src/services/` )

## 10. حالة المشروع، النواقص والأخطاء المعروفة من الكود

**الموجود ويعمل:** إدارة أفراد بالاستيراد والبحث والتصدير؛ تسجيل ماهية شهرية؛ تسجيل جزاءات؛ إنشاء الفواتير وحساب الضريبة والتحقق؛ إنشاء وإدارة أقسام ونماذج مخصصة بحقول typed، وقوالب ونصوص مرتبطة، وسجلات فردية/جماعية؛ اختيار القوالب وتوليد DOCX؛ إدارة الفترة والإقفال والأرشيف والتدقيق. ( `src/renderer/App.jsx`، `src/renderer/sections/`، `main.js`، `src/database/database.js` )

**ناقص أو جزئي:**

1. `supply_orders` موجود في قاعدة البيانات ويدخل في التقرير الشهري ونسخ الأرشيف، لكن لا توجد واجهة أو handler لإضافة أو تحرير أمر توريد؛ القسم ليس دورة أوامر مكتملة. ( `src/database/database.js`، `src/services/monthlyReport.js`، `main.js` )
2. إخفاء الأقسام والنماذج لا يحذفها، وتظل سجلاتها التاريخية في قاعدة البيانات؛ سجل `audit_log` يسجل تغييرات السجلات دون هوية منفذ لأن التطبيق لا يملك حسابات مستخدمين. ( `src/database/database.js`، `main.js` )
3. جدول `dynamic_schemas` منشأ لكنه غير مستخدم في منطق التشغيل؛ النظام الديناميكي الحالي مبني على `custom_modules`, `custom_submodules`, `submodule_records`. ( `src/database/database.js` )
4. `src/services/payroll.js` يحتوي حساباً لصافي الراتب، لكن واجهة الماهيات ومخزنها لا يستخدمانه ولا يطبق خصومات أو جزاءات تلقائياً. ( `src/services/payroll.js`، `src/renderer/App.jsx` )
5. قائمة `custom_modules` تتضمن `templates` المدمج، لكن لا توجد له شاشة قابلة للاستخدام في القائمة الرئيسية؛ مسار تصميم القوالب المرنة كقسم مستقل غير مكتمل. ( `src/database/database.js`، `src/renderer/components/Sidebar.jsx`، `src/renderer/App.jsx` )
6. لا توجد حسابات خصم/تسوية تلقائية، صلاحيات مستخدمين أو مصادقة، ولا سجل يثبت هوية من اعتمد أو أعاد فتح الفترة. سجل عمليات سجلات الأقسام موجود لكنه لا يعرّف المستخدم. ( `src/renderer/App.jsx`، `main.js`، `src/database/database.js`، `README.md` )
7. حقل `penalties.deduction_amount` موجود لكن نموذج الجزاء لا يطلبه؛ لا توجد قاعدة احتساب خصم من مدة الجزاء. ( `src/database/database.js`، `src/renderer/components/PenaltyForm.jsx` )
8. قفل الفترة الصلب يغطي بيانات الفترة المذكورة، لكن جدول الأفراد عام وليس مربوطاً بمفتاح شهر عبر triggers؛ القفل المرتبط باستيراد الأفراد مفروض من endpoint والواجهة، لا من trigger شهري على `personnel`. ( `src/database/database.js`، `main.js` )
9. ينشأ backup واحد مؤرخ بجوار ملف قاعدة البيانات قبل أول ترحيل لمحرك الأقسام؛ لا توجد آلية backup دورية أو شاشة استعادة. الأرشيف الشهري snapshot داخل قاعدة البيانات وليس نسخة احتياطية مستقلة. ( `src/database/database.js` )
10. عمليات إدخال الشركات والأصناف هي إدارة بيانات رئيسية خارج الفترة؛ قفل الشهر يخص إنشاء/تعديل سجلات الفاتورة وعناصرها، وليس تحديث دليل الموردين. ( `src/database/database.js`، `main.js` )

لم يظهر استخدام تعليقات `TODO` أو `FIXME` في ملفات المصدر الأساسية عند الفحص. لا أعتبر ذلك دليلاً على خلو المشروع من العيوب. يوجد تكرار مقصود/ملحوظ في aliases لقنوات الفترة/التصدير القديمة والجديدة، وفي بناء سياق الهوية للقوالب الرسمية. ( `main.js`، `preload.js` )

## 11. النسخ والأرشيف وسجل المراجعة والإصدارات

- الإقفال ينفذ داخل معاملة SQLite: يجمع `getMonthData`، يحفظ JSON في `monthly_archives`، يضيف حدث `closed`، يحفظ نسخة في `monthly_archive_revisions`، ثم يضع `financial_periods.is_locked = 1`. ( `src/database/database.js` )
- عند الإقفال مجدداً بعد إعادة الفتح، يزداد `revision` وتحفظ اللقطة الجديدة دون مسح اللقطات القديمة. تقارير الفترة المقفلة تستخدم snapshot المؤرشف، لا البيانات الحية. ( `src/database/database.js`، `main.js` )
- عند إضافة راتب أو جزاء أو سجل فرعي إلى فترة أعيد فتحها ولها أرشيف، يسجل حدث `data_changed`؛ لا يعدّل ذلك اللقطة القديمة تلقائياً. ( `src/database/database.js` )
- إعادة الفتح تحتاج تأكيداً من نافذة Electron؛ trigger يسجل `unlocked` ويحافظ على الأرشيف السابق. ( `main.js`، `src/database/database.js` )
- يمكن استعراض الإصدارات وسجل الأحداث من `ArchiveSnapshot`. ( `src/renderer/App.jsx` )
- نسخ الأرشيف ينقل بيانات الشهر (الرواتب، الجزاءات، التوريد، السجلات الفرعية والفواتير) إلى **الفترة النشطة** بعد التأكيد، ويسجل مصدر/وجهة/إصدار لمنع تكرار النقل. لا ينسخ سجل الأفراد، ويرفض عند وجود مراجع أفراد مفقودة. هذا نسخ بيانات داخل SQLite، لا backup لملف DB. ( `main.js`، `src/database/database.js` )

## 12. قيود وقرارات تصميم وأمان

- **محلي/اتصال:** README يصف التشغيل الاعتيادي بأنه دون خدمة خلفية أو إنترنت بعد تثبيت التبعيات وElectron. التطوير يستخدم Vite على `127.0.0.1`; لا تعتمد عمليات العمل على API سحابي. تثبيت الحزم/Electron أول مرة قد يحتاج تنزيلات. ( `README.md`، `vite.config.js`، `main.js` )
- **Electron:** `contextIsolation: true`، `nodeIntegration: false`، `sandbox: true`، `webSecurity: true`. `preload.js` يكشف مجموعة وظائف محددة بدلاً من كائنات Node كاملة. يمنع فتح النوافذ الجديدة والتنقل إلى origins غير مسموحة؛ أثناء التطوير يسمح loopback، وفي الإنتاج `file://`. ( `main.js`، `preload.js` )
- **CSP:** `default-src 'self'`؛ السكربتات من self فقط؛ الأنماط تسمح بـ `'unsafe-inline'`؛ الصور من self و`data:`؛ الاتصال self وWebSocket الخاص بـ Vite؛ ويحظر `object-src` ويقيد `base-uri` و`form-action`. ( `index.html` )
- **البيانات الحساسة:** التطبيق يعرض تنبيهاً صريحاً بأن SQLite على القرص غير مشفرة؛ لا يوجد تشفير قاعدة بيانات أو إدارة مفاتيح. ملفات `.db` مستثناة من Git في `.gitignore`، لكن هذا لا يشفرها. ( `src/renderer/App.jsx`، `.gitignore` )
- **العربية والطباعة:** مستند HTML عربي و`dir="rtl"`، والواجهة تستخدم خطوط Cairo/Tajawal/Noto Sans Arabic عند توفرها مع fallback إلى Tahoma/Arial. CSS يهيئ A4 للطباعة؛ تقارير Word تستخدم RTL وArial. ( `index.html`، `src/renderer/styles.css`، `tailwind.config.js`، `src/services/wordReportStyle.js` )
- **الكتالوج:** بيانات الشركات والأصناف المزروعة في قاعدة البيانات تجريبية وليست بيانات أسعار سوق أو موردين فعلية. ( `src/data/mockInvoiceCatalog.js`، `README.md` )
- **التواريخ والفترات:** مفاتيح الشهر الميلادي `YYYY-MM`؛ تاريخ المستند يجب أن يقع في الشهر المختار في الجزاءات والفواتير. لا يعاد تصنيف سجل تلقائياً بناءً على تاريخه، ولا يوجد كيان `period_id` رقمي. ( `src/database/database.js` )

## مراجع الملفات

- عملية Electron: `main.js`، `preload.js`
- واجهة التطبيق: `src/renderer/App.jsx`، `src/renderer/main.jsx`، `src/renderer/styles.css`
- المكونات: `src/renderer/components/`
- قاعدة البيانات: `src/database/database.js`
- خدمات المستندات والاستيراد: `src/services/`
- الإعدادات والبيانات: `src/config/officialIdentity.json`، `src/data/mockInvoiceCatalog.js`
- الاختبارات: `tests/`
- الإعدادات والتشغيل: `package.json`، `package-lock.json`، `vite.config.js`، `tailwind.config.js`، `postcss.config.cjs`، `index.html`
