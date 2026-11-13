const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const LEGACY_USER_DATA_DIRECTORY = 'local-finance-office';
app.setPath('userData', path.join(app.getPath('appData'), LEGACY_USER_DATA_DIRECTORY));
app.setName('مكتب الماليات');
const {
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
  getFinancialPeriod,
  getActiveFinancialPeriodKey,
  activateFinancialPeriod,
  setFinancialPeriodRange,
  isFinancialPeriodLocked,
  unlockFinancialPeriod,
  getMonthData,
  listArchives,
  getArchive,
  archiveMonth,
  listArchiveAudit,
  listArchiveRevisions,
  getArchiveRevision,
  copyArchiveToMonth,
  listRecordArchives,
  archiveRecords,
  restoreArchivedRecord,
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
  getPenalty,
  addPenalty,
  upsertMonthlySalary
} = require('./src/database/database');
const { readPersonnelWorkbook } = require('./src/services/excelImport');
const { createPersonnelDocument } = require('./src/services/wordDocument');
const {
  renderWordTemplate,
  renderWordTemplateBatch,
  createCommonTemplateData,
  createPenaltyTemplateData,
  createSubmoduleTemplateData
} = require('./src/services/docxTemplate');
const { renderHtmlDocument } = require('./src/services/htmlDocument');
const { buildDocumentTemplateData } = require('./src/services/documentTemplateData');
const htmlToDocx = require('html-to-docx');
const { createMonthlyReport } = require('./src/services/monthlyReport');
const { createInvoiceDocument } = require('./src/services/invoiceDocument');
const officialIdentity = require('./src/config/officialIdentity.json');

let mainWindow;
let database;
let lastExportedWordFilePath = '';
const isDevelopment = !app.isPackaged && process.argv.includes('--dev');
const INSTITUTION_LOGO_SETTING = 'institution_logo_path';
const PENALTY_TEMPLATE_SETTING = 'penalty_docx_template_path';
const MAX_INSTITUTION_LOGO_BYTES = 5 * 1024 * 1024;
const WORD_TEMPLATE_DIRECTORY = 'word-templates';

async function storeWordTemplate(sourcePath, bindingKey) {
  if (path.extname(sourcePath).toLowerCase() !== '.docx') {
    throw new Error('اختر ملف Word بصيغة DOCX.');
  }
  const source = path.resolve(sourcePath);
  const sourceInfo = await fs.stat(source);
  if (!sourceInfo.isFile()) throw new Error('ملف قالب Word غير صالح.');
  const templateDirectory = path.join(app.getPath('userData'), WORD_TEMPLATE_DIRECTORY);
  await fs.mkdir(templateDirectory, { recursive: true });
  const safeBindingKey = String(bindingKey).replace(/[^a-zA-Z0-9_-]/g, '-');
  const storedPath = path.join(templateDirectory, `${safeBindingKey}.docx`);
  if (source.toLowerCase() !== storedPath.toLowerCase()) {
    const temporaryPath = `${storedPath}.${randomUUID()}.tmp`;
    try {
      await fs.copyFile(source, temporaryPath);
      const copiedInfo = await fs.stat(temporaryPath);
      if (!copiedInfo.isFile() || copiedInfo.size !== sourceInfo.size) {
        throw new Error('نسخة قالب Word لم تُحفظ كاملة.');
      }
      await fs.rename(temporaryPath, storedPath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }
  const storedInfo = await fs.stat(storedPath);
  if (!storedInfo.isFile() || storedInfo.size !== sourceInfo.size) {
    throw new Error('تعذر التحقق من حفظ قالب Word الجديد.');
  }
  return storedPath;
}

async function saveDocxFile(filePath, output) {
  if (!(Buffer.isBuffer(output) || output instanceof Uint8Array) || output.byteLength === 0) {
    throw new Error('تعذر إنشاء محتوى ملف Word؛ لم يتم حفظ الملف.');
  }
  try {
    await fs.writeFile(filePath, output);
    const savedFile = await fs.stat(filePath);
    if (!savedFile.isFile() || savedFile.size !== output.byteLength) {
      throw new Error('الملف المحفوظ غير مكتمل أو فارغ.');
    }
  } catch (error) {
    const reason = error.code === 'EACCES' || error.code === 'EPERM'
      ? 'لا توجد صلاحية للكتابة في هذا الموقع.'
      : error.message;
    throw new Error(`تعذر حفظ ملف Word في "${filePath}": ${reason}`);
  }
  lastExportedWordFilePath = path.resolve(filePath);
  return lastExportedWordFilePath;
}

function getOfficialTemplateValues() {
  return {
    organization: officialIdentity.unitName,
    unit_commander: `${officialIdentity.commanderTitle}: ${officialIdentity.commanderName}`,
    finance_chief: `${officialIdentity.financeChiefTitle}: ${officialIdentity.financeChiefName}`,
    software_engineer: `${officialIdentity.softwareEngineerTitle}: ${officialIdentity.softwareEngineerName}`,
    operations_chief: `${officialIdentity.commanderTitle}: ${officialIdentity.commanderName}`,
    sergeant: `${officialIdentity.financeChiefTitle}: ${officialIdentity.financeChiefName}`,
    acting_official: `${officialIdentity.softwareEngineerTitle}: ${officialIdentity.softwareEngineerName}`
  };
}

function getLogoType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  throw new Error('ملف الشعار غير صالح. اختر صورة PNG أو JPEG.');
}

async function getInstitutionLogo() {
  const logoPath = getApplicationSetting(database, INSTITUTION_LOGO_SETTING);
  if (!logoPath) return null;
  const image = await readInstitutionLogoFile(logoPath);
  const type = getLogoType(image);
  return {
    type,
    data: image,
    dataUrl: `data:image/${type === 'jpg' ? 'jpeg' : type};base64,${image.toString('base64')}`
  };
}

async function readInstitutionLogoFile(logoPath) {
  const fileInfo = await fs.stat(logoPath);
  if (!fileInfo.isFile() || fileInfo.size > MAX_INSTITUTION_LOGO_BYTES) {
    throw new Error('اختر ملف صورة صالحاً لا يتجاوز حجمه 5 ميجابايت.');
  }
  return fs.readFile(logoPath);
}

async function saveFinancialArchive(monthKey) {
  validateMonthKey(monthKey);
  if (isFinancialPeriodLocked(database, monthKey)) {
    throw new Error('الفترة المالية مقفلة بالفعل. أعد فتحها بعد التأكيد إذا أردت تعديلها.');
  }
  const period = getFinancialPeriod(database, monthKey);
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['اعتماد وإقفال الفترة', 'إلغاء'],
    defaultId: 1,
    cancelId: 1,
    message: `هل تريد اعتماد وإقفال الفترة ${monthKey}؟`,
    detail: `الفترة من ${period.start_date} إلى ${period.end_date}. بعد التقفيل تصبح بياناتها للعرض فقط، ولا يمكن تعديلها إلا بعد إعادة فتحها بتأكيد صريح.`
  });
  if (response !== 0) return { canceled: true };
  const archive = archiveMonth(database, monthKey);
  return { canceled: false, archive, archives: listArchives(database) };
}

async function reopenFinancialPeriod(monthKey) {
  validateMonthKey(monthKey);
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['إلغاء التقفيلة وفتح الشهر', 'إلغاء'],
    defaultId: 1,
    cancelId: 1,
    message: 'هل أنت متأكد من رغبتك في إلغاء تقفيلة هذا الشهر وتعديل بياناته؟',
    detail: `سيتم فتح ${monthKey} للتعديل. لن يُحذف الأرشيف السابق، وسيُسجل طلب الفتح في سجل المراجعة.`
  });
  if (response !== 0) return { canceled: true };
  const period = unlockFinancialPeriod(database, monthKey);
  return {
    success: true,
    canceled: false,
    period,
    archive: getArchive(database, monthKey),
    audit: listArchiveAudit(database, monthKey),
    revisions: listArchiveRevisions(database, monthKey),
    data: getMonthData(database, monthKey),
    archives: listArchives(database)
  };
}

async function exportMonthlyReportDocx(monthKey) {
  validateMonthKey(monthKey);
  const archive = getArchive(database, monthKey);
  const locked = isFinancialPeriodLocked(database, monthKey);
  if (locked && !archive) {
    throw new Error('الفترة مقفلة لكن الأرشيف غير موجود؛ لم يتم إنشاء تقرير من بيانات غير موثوقة.');
  }
  const snapshot = locked && archive ? archive.snapshot : getMonthData(database, monthKey);
  const revision = locked ? archive?.revision ?? null : null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'تصدير التقرير المالي الشهري',
    defaultPath: `تقرير-مالي-${monthKey}.docx`,
    filters: [{ name: 'مستند Word', extensions: ['docx'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, await createMonthlyReport(
    monthKey,
    snapshot,
    revision,
    snapshot.periodRange ?? getFinancialPeriod(database, monthKey),
    (await getInstitutionLogo()) ?? null
  ));
  return { canceled: false, monthKey, revision };
}

async function exportInvoiceDocx(invoiceId) {
  const invoice = getInvoice(database, invoiceId);
  if (!invoice) throw new Error('المستند المطلوب غير موجود.');
  const safeNumber = invoice.invoice_number.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
  const documentLabel = invoice.document_type === 'quotation' ? 'بيان أسعار' : 'فاتورة إلكترونية';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `تصدير ${documentLabel} إلى Word`,
    defaultPath: `${documentLabel}-${safeNumber}.docx`,
    filters: [{ name: 'مستند Word', extensions: ['docx'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.writeFile(result.filePath, await createInvoiceDocument(invoice));
  return { canceled: false, filePath: result.filePath };
}

async function exportCurrentViewPdf() {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('نافذة التطبيق غير متاحة للطباعة.');
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    buttons: ['فتح نافذة الطباعة', 'إلغاء'],
    defaultId: 0,
    cancelId: 1,
    message: 'يمكن اختيار الطباعة أو الحفظ بصيغة PDF من نافذة الطباعة.'
  });
  if (response !== 0) return { canceled: true };
  await new Promise((resolve, reject) => {
    mainWindow.webContents.print({ copies: 1 }, (success, failureReason) => {
      if (success) resolve();
      else reject(new Error(failureReason || 'تعذرت الطباعة أو حفظ PDF.'));
    });
  });
  return { canceled: false };
}

function registerIpcHandlers() {
  const personnelImportPreviews = new Map();
  const ensureActivePeriodWrite = (monthKey) => {
    validateMonthKey(monthKey);
    if (monthKey !== getActiveFinancialPeriodKey(database)) {
      throw new Error('فعّل الفترة المالية المختارة قبل إدخال البيانات أو تعديلها.');
    }
    if (isFinancialPeriodLocked(database, monthKey)) {
      throw new Error('الفترة المالية مقفلة للقراءة فقط ولا يمكن تعديل بياناتها.');
    }
  };

  const handleAppRequest = (channel, handler) => {
    ipcMain.handle(channel, async (...args) => {
      try {
        return { ok: true, data: await handler(...args) };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'تعذر تنفيذ طلب التطبيق.';
        console.warn(`App IPC request failed (${channel}): ${message}`);
        return { ok: false, error: { message } };
      }
    });
  };

  const handlePeriodRequest = (channel, handler) => {
    ipcMain.handle(channel, async (...args) => {
      try {
        return { ok: true, data: await handler(...args) };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'تعذر تنفيذ طلب الفترة المالية.';
        console.warn(`Period IPC request failed (${channel}): ${message}`);
        return {
          ok: false,
          error: { message }
        };
      }
    });
  };

  handleAppRequest('word-export:reveal', async () => {
    if (!lastExportedWordFilePath) throw new Error('لا يوجد ملف Word مُصدّر لعرض موقعه.');
    const file = await fs.stat(lastExportedWordFilePath);
    if (!file.isFile()) throw new Error('ملف Word المُصدّر لم يعد موجوداً.');
    shell.showItemInFolder(lastExportedWordFilePath);
    return { filePath: lastExportedWordFilePath };
  });

  handleAppRequest('app:get-status', () => ({
    databasePath: database.filePath,
    isPackaged: app.isPackaged
  }));

  handleAppRequest('personnel:list', () => listPersonnel(database));
  handleAppRequest('personnel:columns:list', () => listPersonnelColumns(database));
  handleAppRequest('personnel:columns:placeholder:update', (_event, input) => (
    updatePersonnelColumnPlaceholder(database, input?.columnKey, input?.label)
  ));
  handleAppRequest('documentTemplates:list', () => listDocumentTemplates(database));
  handleAppRequest('documentTemplates:save', (_event, input) => saveDocumentTemplate(database, input));
  handleAppRequest('documentTemplates:active:set', (_event, input) => (
    setDocumentTemplateActive(database, input?.templateId, input?.isActive)
  ));
  handleAppRequest('modules:list', () => listModules(database));
  handleAppRequest('dropdownOptions:list', () => listDropdownOptions(database));
  handleAppRequest('dropdownOptions:action:add', (_event, input) => addActionTypeOption(database, input));
  handleAppRequest('dropdownOptions:update', (_event, input) => updateDropdownOption(database, input));
  handleAppRequest('dropdownOptions:active:set', (_event, input) => setDropdownOptionActive(database, input));
  handleAppRequest('dropdownOptions:reorder', (_event, input) => reorderDropdownOptions(database, input));
  handleAppRequest('modules:presets:list', () => listSectionPresets());
  handleAppRequest('textTemplates:list', (_event, options) => listTextTemplates(database, options));
  handleAppRequest('textTemplates:add', (_event, input) => addTextTemplate(database, input));
  handleAppRequest('textTemplates:update', (_event, input) => updateTextTemplate(database, input));
  handleAppRequest('textTemplates:archive', (_event, id) => archiveTextTemplate(database, id));
  handleAppRequest('settings:legacy-salaries-visible:get', () => getLegacySalaryScreenVisible(database));
  handleAppRequest('settings:legacy-salaries-visible:set', (_event, visible) => (
    setLegacySalaryScreenVisible(database, visible)
  ));
  handleAppRequest('branding:get-logo', async () => {
    const logo = await getInstitutionLogo();
    return logo?.dataUrl ?? null;
  });
  handleAppRequest('branding:select-logo', async () => {
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'اختيار شعار الفوج أو المؤسسة',
      properties: ['openFile'],
      filters: [{ name: 'صور الشعار', extensions: ['png', 'jpg', 'jpeg'] }]
    });
    if (selection.canceled || selection.filePaths.length === 0) return { canceled: true };

    const sourcePath = selection.filePaths[0];
    const source = await readInstitutionLogoFile(sourcePath);
    const type = getLogoType(source);
    const extension = type === 'png' ? '.png' : '.jpg';
    const logoDirectory = path.join(app.getPath('userData'), 'branding');
    const logoPath = path.join(logoDirectory, `institution-logo${extension}`);
    await fs.mkdir(logoDirectory, { recursive: true });

    if (path.resolve(sourcePath) !== path.resolve(logoPath)) {
      const temporaryPath = `${logoPath}.${randomUUID()}.tmp`;
      try {
        await fs.copyFile(sourcePath, temporaryPath);
        await fs.rename(temporaryPath, logoPath);
      } catch (error) {
        await fs.rm(temporaryPath, { force: true });
        throw error;
      }
    }

    setApplicationSetting(database, INSTITUTION_LOGO_SETTING, logoPath);
    const logo = await getInstitutionLogo();
    return { canceled: false, dataUrl: logo.dataUrl };
  });
  handlePeriodRequest('month:get-current', () => {
    return getActiveFinancialPeriodKey(database);
  });
  handlePeriodRequest('month:active:get', () => getActiveFinancialPeriodKey(database));
  handlePeriodRequest('month:active:set', (_event, monthKey) => {
    validateMonthKey(monthKey);
    if (isFinancialPeriodLocked(database, monthKey)) {
      throw new Error('أعد فتح الفترة المقفلة رسمياً قبل تفعيلها.');
    }
    return activateFinancialPeriod(database, monthKey);
  });
  handlePeriodRequest('month:data', (_event, monthKey) => {
    validateMonthKey(monthKey);
    return getMonthData(database, monthKey);
  });
  handlePeriodRequest('finance:load-data', (_event, monthKey) => {
    validateMonthKey(monthKey);
    return getMonthData(database, monthKey);
  });
  handlePeriodRequest('finance:save-data', (_event, monthKey) => saveFinancialArchive(monthKey));
  handlePeriodRequest('finance:toggle-archive-lock', async (_event, monthKey) => (
    isFinancialPeriodLocked(database, monthKey)
      ? reopenFinancialPeriod(monthKey)
      : saveFinancialArchive(monthKey)
  ));
  handlePeriodRequest('month:period:get', (_event, monthKey) => getFinancialPeriod(database, monthKey));
  handlePeriodRequest('month:period:set-range', (_event, input) => setFinancialPeriodRange(database, input ?? {}));
  handlePeriodRequest('salaries:list', (_event, monthKey) => {
    validateMonthKey(monthKey);
    return listMonthlySalaries(database, monthKey);
  });
  handlePeriodRequest('salaries:save', (_event, input) => {
    const { monthKey, militaryNumber, baseSalary, allowances } = input ?? {};
    ensureActivePeriodWrite(monthKey);
    if (!listPersonnel(database).some((person) => person.military_number === militaryNumber)) {
      throw new Error('الفرد غير موجود في سجل الأفراد.');
    }
    return upsertMonthlySalary(database, {
      monthKey,
      militaryNumber,
      baseSalary,
      allowances
    });
  });
  handlePeriodRequest('invoices:companies', () => listInvoiceCompanies(database));
  handlePeriodRequest('invoices:company:add', (_event, input) => addInvoiceCompany(database, input));
  handlePeriodRequest('invoices:company:update', (_event, input) => updateInvoiceCompany(database, input));
  handlePeriodRequest('invoices:product:add', (_event, input) => addInvoiceProduct(database, input));
  handlePeriodRequest('invoices:list', (_event, monthKey) => listInvoices(database, monthKey));
  handlePeriodRequest('invoices:save', (_event, input) => {
    ensureActivePeriodWrite(input?.monthKey);
    const invoice = saveInvoice(database, input);
    return {
      invoice,
      invoices: listInvoices(database, input.monthKey),
      monthData: getMonthData(database, input.monthKey)
    };
  });
  handlePeriodRequest('invoices:export-docx', (_event, invoiceId) => exportInvoiceDocx(invoiceId));
  handlePeriodRequest('penalties:add', (_event, input) => {
    const request = input ?? {};
    ensureActivePeriodWrite(request.monthKey);
    const penalties = addPenalty(database, request);
    return { penalties, monthData: getMonthData(database, request.monthKey) };
  });
  handlePeriodRequest('penalties:export-word', async (_event, input) => {
    const penaltyIds = Array.isArray(input) ? input : [input];
    if (!penaltyIds.length || penaltyIds.length > 500) {
      throw new Error('اختر سجلاً واحداً على الأقل، وبحد أقصى 500 سجل للطباعة.');
    }
    const uniqueIds = [...new Set(penaltyIds.map((id) => Number(id)))];
    if (uniqueIds.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error('معرّفات سجلات الجزاءات غير صالحة.');
    const penalties = uniqueIds.map((id) => getPenalty(database, id));
    if (penalties.some((penalty) => !penalty)) throw new Error('أحد سجلات الجزاءات المحددة غير موجود.');
    if (new Set(penalties.map((penalty) => penalty.period_key)).size !== 1) {
      throw new Error('يجب اختيار سجلات من الفترة المالية نفسها.');
    }
    const templatePath = getApplicationSetting(database, PENALTY_TEMPLATE_SETTING);
    if (!templatePath) throw new Error('اختر قالب Word للجزاءات أولاً.');
    await fs.access(templatePath);
    const personnel = listPersonnel(database);
    const safeMilitaryNumber = penalties.length === 1
      ? penalties[0].military_number.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      : `${penalties.length}-سجلات`;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: penalties.length === 1 ? 'حفظ قرار الجزاء' : `حفظ ${penalties.length} قرارات جزاء`,
      defaultPath: `جزاء-${safeMilitaryNumber}-${penalties[0].period_key}.docx`,
      filters: [{ name: 'مستند Word', extensions: ['docx'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const officialValues = getOfficialTemplateValues();
    const templateData = penalties.map((penalty) => {
      const linkedPerson = personnel.find((person) => person.military_number === penalty.military_number) || {};
      return {
        ...linkedPerson,
        ...createPenaltyTemplateData(penalty),
        ...officialValues
      };
    });
    const output = await renderWordTemplateBatch(templatePath, templateData, officialValues);
    const filePath = await saveDocxFile(result.filePath, output);
    return { canceled: false, filePath, exported: penalties.length };
  });
  handlePeriodRequest('month:archives:list', () => listArchives(database));
  handlePeriodRequest('month:archives:get', (_event, monthKey) => {
    validateMonthKey(monthKey);
    return {
      archive: getArchive(database, monthKey),
      audit: listArchiveAudit(database, monthKey),
      revisions: listArchiveRevisions(database, monthKey)
    };
  });
  handlePeriodRequest('month:archives:revision', (_event, monthKey, revision) => {
    validateMonthKey(monthKey);
    const archive = getArchiveRevision(database, monthKey, revision);
    if (!archive) throw new Error('إصدار الأرشيف المطلوب غير موجود.');
    return archive;
  });
  handlePeriodRequest('month:archives:save', (_event, monthKey) => saveFinancialArchive(monthKey));
  handlePeriodRequest('month:period:unlock', (_event, monthKey) => reopenFinancialPeriod(monthKey));
  handlePeriodRequest('month:archives:copy-to-current', async (_event, sourceMonth) => {
    validateMonthKey(sourceMonth);
    const targetMonth = getActiveFinancialPeriodKey(database);
    if (sourceMonth === targetMonth) throw new Error('الشهر المحدد هو الفترة النشطة بالفعل.');
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['نسخ إلى الفترة النشطة', 'إلغاء'],
      defaultId: 1,
      cancelId: 1,
      message: `نسخ بيانات ${sourceMonth} إلى ${targetMonth}؟`,
      detail: 'سيتم إضافة سجلات الجزاءات والأقسام الفرعية، واستبدال الماهيات وأوامر التوريد المطابقة للشهر. لا تُنسخ قائمة الأفراد الرئيسية.'
    });
    if (response !== 0) return { canceled: true };
    const data = copyArchiveToMonth(database, sourceMonth, targetMonth);
    return { canceled: false, targetMonth, data };
  });
  handlePeriodRequest('month:report:export-word', (_event, monthKey) => exportMonthlyReportDocx(monthKey));
  handlePeriodRequest('finance:export-docx', (_event, monthKey) => exportMonthlyReportDocx(monthKey));
  handleAppRequest('finance:export-pdf', () => exportCurrentViewPdf());
  handleAppRequest('documents:open-print-dialog', () => exportCurrentViewPdf());
  handleAppRequest('records:archives:list', (_event, monthKey) => listRecordArchives(database, monthKey));
  handleAppRequest('records:archive', (_event, input) => archiveRecords(database, input));
  handleAppRequest('records:archive:restore', (_event, input) => restoreArchivedRecord(database, input));

  handleAppRequest('modules:add', (_event, title, icon, presetId) => {
    const cleanTitle = String(title ?? '').trim();
    if (!cleanTitle || cleanTitle.length > 80) throw new Error('أدخل اسم قسم من 1 إلى 80 حرفاً.');
    const moduleId = randomUUID();
    const cleanIcon = typeof icon === 'string' ? icon.trim().slice(0, 8) : '';
    const created = createModuleWithPreset(database, {
      id: moduleId,
      title: cleanTitle,
      icon: cleanIcon || '▦',
      presetId: presetId || ''
    });
    return { modules: listModules(database), ...created };
  });

  handleAppRequest('modules:update', (_event, input) => {
    updateModule(database, input);
    return { modules: listModules(database) };
  });

  handleAppRequest('modules:archive', (_event, moduleId) => {
    archiveModule(database, moduleId);
    return { modules: listModules(database) };
  });

  handleAppRequest('modules:restore', (_event, moduleId) => {
    restoreModule(database, moduleId);
    return { modules: listModules(database) };
  });

  handleAppRequest('modules:reorder', (_event, orderedModuleIds) => {
    reorderModules(database, orderedModuleIds);
    return { modules: listModules(database) };
  });

  handleAppRequest('modules:copy', (_event, { moduleId, title }) => {
    const result = copyModule(database, moduleId, title);
    return { ...result, modules: listModules(database) };
  });

  handleAppRequest('modules:definition:export', async (_event, moduleId) => {
    const definition = exportModuleDefinition(database, moduleId);
    const safeTitle = definition.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'قسم';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'تصدير تعريف القسم',
      defaultPath: `${safeTitle}.json`,
      filters: [{ name: 'تعريف قسم JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, `${JSON.stringify(definition, null, 2)}\n`, 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  handleAppRequest('modules:definition:preview-import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختيار تعريف قسم JSON',
      properties: ['openFile'],
      filters: [{ name: 'تعريف قسم JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const definition = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8'));
    if (!definition || definition.format !== 'maly-section-definition' || definition.version !== 1) {
      throw new Error('ملف تعريف القسم غير مدعوم أو تالف.');
    }
    return {
      canceled: false,
      definition,
      preview: {
        title: String(definition.title || ''),
        submoduleCount: Array.isArray(definition.submodules) ? definition.submodules.length : 0,
        fieldCount: Array.isArray(definition.submodules)
          ? definition.submodules.reduce((total, item) => total + (Array.isArray(item.fields) ? item.fields.length : 0), 0)
          : 0,
        templateCount: Array.isArray(definition.submodules)
          ? definition.submodules.reduce((total, item) => total + (Array.isArray(item.templates) ? item.templates.length : 0), 0)
          : 0,
        nameConflict: listModules(database).some((module) => module.title.toLocaleLowerCase('ar') === String(definition.title || '').trim().toLocaleLowerCase('ar'))
      }
    };
  });

  handleAppRequest('modules:definition:import', (_event, { definition, title }) => {
    const result = importModuleDefinition(database, definition, title);
    return { ...result, modules: listModules(database) };
  });

  handleAppRequest('modules:template:select', async (_event, moduleId) => {
    const module = listModules(database).find((item) => item.id === moduleId);
    if (!module) throw new Error('القسم الرئيسي غير موجود.');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `اختيار قالب Word للقسم: ${module.title}`,
      properties: ['openFile'],
      filters: [{ name: 'قالب Word', extensions: ['docx'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const templatePath = await storeWordTemplate(result.filePaths[0], `module-${moduleId}`);
    setModuleTemplate(database, moduleId, templatePath);
    return { canceled: false, modules: listModules(database) };
  });

  handlePeriodRequest('modules:template:export', async (_event, moduleId, monthKey, recordIds) => {
    validateMonthKey(monthKey);
    const module = listModules(database).find((item) => item.id === moduleId);
    if (!module) throw new Error('القسم الرئيسي غير موجود.');
    if (!module.template_path) throw new Error('اختر قالب Word لهذا القسم أولاً.');
    await fs.access(module.template_path);

    const isLocked = isFinancialPeriodLocked(database, monthKey);
    const archive = isLocked ? getArchive(database, monthKey) : null;
    if (isLocked && !archive) {
      throw new Error('الفترة مقفلة لكن الأرشيف غير موجود؛ تعذر تصدير تقرير موثوق.');
    }
    const monthData = archive?.snapshot ?? getMonthData(database, monthKey);
    const recordsByModule = {
      home: [{
        personnel_count: monthData.personnel.length,
        salary_count: monthData.salaries.length,
        penalty_count: monthData.penalties.length,
        supply_order_count: monthData.supplyOrders.length,
        invoice_count: monthData.invoices.length
      }],
      personnel: monthData.personnel,
      salaries: monthData.salaries,
      penalties: monthData.penalties,
      supplies: monthData.supplyOrders,
      invoices: monthData.invoices
    };
    const sourceRecords = recordsByModule[moduleId] ?? monthData.customSections
      .filter((section) => section.module_id === moduleId)
      .flatMap((section) => section.records.map((record) => ({
        ...(monthData.personnel.find((person) => person.military_number === record.military_number) || {}),
        ...record.data,
        ...section.fields.reduce((aliases, field) => {
          const rawValue = record.data[field.key] ?? '';
          const value = field.type === 'person'
            ? record.full_name || rawValue
            : field.type === 'percentage' && rawValue
              ? `${rawValue}%`
              : rawValue;
          aliases[field.key] = value;
          aliases[field.label] = value;
          aliases[field.label.replace(/\s+/g, '_')] = value;
          if (field.type === 'person' && record.military_number) {
            aliases['الاسم'] = record.full_name || '';
            aliases['الرتبة'] = record.rank || '';
            aliases['الرقم_العسكري'] = record.military_number;
            aliases.NAME = record.full_name || '';
            aliases.RANK = record.rank || '';
            aliases.MILITARY_ID = record.military_number;
          }
          return aliases;
        }, {}),
        submodule_title: section.submodule_title,
        created_at: record.created_at,
        military_number: record.military_number,
        full_name: record.full_name,
        rank: record.rank,
        action_type: record.action_type,
        action_days: record.action_days,
        action_reason: record.action_reason,
        action_date: record.action_date,
        clause_no: record.clause_no
      })));
    const personnelColumns = listPersonnelColumns(database);
    const records = sourceRecords.map((record) => {
      const linkedPerson = monthData.personnel.find((person) => person.military_number === record.military_number) || {};
      return createCommonTemplateData(
        { ...linkedPerson, ...record },
        linkedPerson,
        personnelColumns,
        getOfficialTemplateValues()
      );
    });
    let recordsToExport = records;
    if (recordIds !== undefined) {
      if (!Array.isArray(recordIds) || recordIds.length === 0 || recordIds.length > 500) {
        throw new Error('اختر سجلاً واحداً على الأقل، وبحد أقصى 500 سجل للطباعة.');
      }
      const requestedIds = new Set(recordIds.map((id) => String(id)));
      const recordKey = (record) => String(record.id ?? record.military_number ?? record.invoice_number ?? '');
      recordsToExport = records.filter((record) => requestedIds.has(recordKey(record)));
      if (recordsToExport.length !== requestedIds.size || [...requestedIds].some((id) => !records.some((record) => recordKey(record) === id))) {
        throw new Error('أحد السجلات المحددة غير موجود في القسم أو الفترة الحالية.');
      }
    }

    const period = getFinancialPeriod(database, monthKey);
    const templateData = {
      moduleTitle: module.title,
      moduleId: module.id,
      monthKey,
      periodStart: period.start_date,
      periodEnd: period.end_date,
      periodId: monthKey,
      totalRecords: recordsToExport.length || records.length,
      records: recordsToExport,
      organization: officialIdentity.unitName,
      unit_commander: `${officialIdentity.commanderTitle}: ${officialIdentity.commanderName}`,
      finance_chief: `${officialIdentity.financeChiefTitle}: ${officialIdentity.financeChiefName}`,
      software_engineer: `${officialIdentity.softwareEngineerTitle}: ${officialIdentity.softwareEngineerName}`,
      MODULE_TITLE: module.title,
      MODULE_ID: module.id,
      MONTH_KEY: monthKey,
      PERIOD_START: period.start_date,
      PERIOD_END: period.end_date,
      PERIOD_ID: monthKey,
      TOTAL_RECORDS: recordsToExport.length || records.length
    };
    const sharedTemplateData = { ...templateData };
    delete sharedTemplateData.records;
    const safeTitle = module.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'تقرير';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: recordIds === undefined ? `تصدير تقرير Word: ${module.title}` : `تصدير ${recordsToExport.length} سجلات: ${module.title}`,
      defaultPath: `${safeTitle}-${monthKey}${recordIds === undefined ? '' : `-${recordsToExport.length}-سجلات`}.docx`,
      filters: [{ name: 'مستند Word', extensions: ['docx'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const outputs = recordIds === undefined
      ? await renderWordTemplate(module.template_path, templateData)
      : await renderWordTemplateBatch(module.template_path, recordsToExport.map((record) => ({
        ...sharedTemplateData,
        ...record,
        totalRecords: recordsToExport.length,
        TOTAL_RECORDS: recordsToExport.length
      })), sharedTemplateData);
    const filePath = await saveDocxFile(result.filePath, outputs);
    return { canceled: false, filePath, exported: recordsToExport.length };
  });

  handlePeriodRequest('documentTemplates:export', async (_event, input) => {
    const { templateId, monthKey, recordId = '' } = input || {};
    validateMonthKey(monthKey);
    const template = getDocumentTemplate(database, templateId);
    if (!template || template.is_active !== 1) throw new Error('قالب المستند غير موجود أو مخفي.');
    const module = listModules(database).find((item) => item.id === template.module_id);
    if (!module) throw new Error('القسم المرتبط بالقالب غير موجود.');
    const isLocked = isFinancialPeriodLocked(database, monthKey);
    const archive = isLocked ? getArchive(database, monthKey) : null;
    if (isLocked && !archive) throw new Error('الفترة مقفلة لكن الأرشيف غير موجود؛ تعذر إنشاء مستند موثوق.');
    const monthData = archive?.snapshot ?? getMonthData(database, monthKey);
    const documentData = buildDocumentTemplateData({
      template,
      module,
      monthData,
      personnelColumns: listPersonnelColumns(database),
      recordId
    });
    const html = renderHtmlDocument(template.content_html, {
      ...documentData,
      organization: officialIdentity.unitName,
      unit_commander: `${officialIdentity.commanderTitle}: ${officialIdentity.commanderName}`,
      finance_chief: `${officialIdentity.financeChiefTitle}: ${officialIdentity.financeChiefName}`,
      software_engineer: `${officialIdentity.softwareEngineerTitle}: ${officialIdentity.softwareEngineerName}`,
      operations_chief: `${officialIdentity.commanderTitle}: ${officialIdentity.commanderName}`,
      sergeant: `${officialIdentity.financeChiefTitle}: ${officialIdentity.financeChiefName}`,
      acting_official: `${officialIdentity.softwareEngineerTitle}: ${officialIdentity.softwareEngineerName}`
    });
    const safeTitle = template.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'مستند';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: `حفظ المستند: ${template.title}`,
      defaultPath: `${safeTitle}-${monthKey}.docx`,
      filters: [{ name: 'مستند Word', extensions: ['docx'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const output = await htmlToDocx(html, null, {
      orientation: 'portrait',
      pageSize: { width: 11906, height: 16838 },
      margins: { top: 720, right: 850, bottom: 720, left: 850 },
      title: template.title,
      font: 'Tahoma',
      lang: 'ar-SA',
      table: { row: { cantSplit: true } }
    });
    await fs.writeFile(result.filePath, output);
    return { canceled: false, filePath: result.filePath, title: template.title };
  });

  handleAppRequest('submodules:add', (_event, { moduleId, title, fieldLabels, fields: fieldDefinitions }) => {
    const module = listModules(database).find((item) => item.id === moduleId);
    const cleanTitle = String(title ?? '').trim();
    if (!module) throw new Error('القسم الرئيسي غير موجود.');
    if (!cleanTitle || cleanTitle.length > 80) throw new Error('أدخل اسم قسم فرعي من 1 إلى 80 حرفاً.');
    const fields = Array.isArray(fieldDefinitions) ? fieldDefinitions : Array.isArray(fieldLabels)
      ? fieldLabels.map((label, index) => ({ key: `field_${index + 1}`, label: String(label ?? '').trim(), type: 'text' }))
      : null;
    if (!fields) throw new Error('أضف حقلاً واحداً على الأقل إلى النموذج.');
    const submoduleId = randomUUID();
    addSubmodule(database, { id: submoduleId, moduleId, title: cleanTitle, fields });
    return { modules: listModules(database), submoduleId };
  });

  handleAppRequest('submodules:update', (_event, input) => {
    updateSubmodule(database, input);
    return { modules: listModules(database) };
  });

  handleAppRequest('submodules:archive', (_event, submoduleId) => {
    archiveSubmodule(database, submoduleId);
    return { modules: listModules(database) };
  });

  handleAppRequest('submodules:delete', (_event, submoduleId) => {
    deleteSubmodule(database, submoduleId);
    return { modules: listModules(database) };
  });

  handleAppRequest('submodules:restore', (_event, submoduleId) => {
    restoreSubmodule(database, submoduleId);
    return { modules: listModules(database) };
  });

  handlePeriodRequest('submodule:records:list', (_event, submoduleId, monthKey) => {
    if (!getSubmodule(database, submoduleId)) throw new Error('القسم الفرعي غير موجود.');
    validateMonthKey(monthKey);
    return listSubmoduleRecords(database, submoduleId, monthKey);
  });

  handlePeriodRequest('submodule:records:add', (_event, {
    submoduleId,
    data,
    monthKey,
    action,
    clauseNo,
    militaryNumber
  }) => {
    ensureActivePeriodWrite(monthKey);
    const submodule = getSubmodule(database, submoduleId);
    if (!submodule) throw new Error('القسم الفرعي غير موجود.');
    validateMonthKey(monthKey);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('بيانات السجل غير صالحة.');
    const allowedKeys = new Set(submodule.fields.map((field) => field.key));
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) throw new Error('يتضمن السجل حقلاً غير معرّف.');
    }
    const normalizedData = Object.fromEntries(
      submodule.fields.map((field) => [field.key, String(data[field.key] ?? '').trim()])
    );
    if (Object.values(normalizedData).some((value) => value.length > 4000)) {
      throw new Error('يجب ألا يتجاوز طول قيمة الحقل 4000 حرف.');
    }
    if (Object.values(normalizedData).every((value) => !value) && !action && !militaryNumber) {
      throw new Error('أدخل بيانات في حقل واحد على الأقل.');
    }
    addSubmoduleRecord(database, { submoduleId, data: normalizedData, monthKey, action, clauseNo, militaryNumber });
    return listSubmoduleRecords(database, submoduleId, monthKey);
  });

  handlePeriodRequest('submodule:records:add-bulk', (_event, { submoduleId, records, monthKey }) => {
    ensureActivePeriodWrite(monthKey);
    const recordIds = addSubmoduleRecords(database, { submoduleId, records, monthKey });
    return { recordIds, records: listSubmoduleRecords(database, submoduleId, monthKey) };
  });

  handlePeriodRequest('submodule:records:update', (_event, { recordId, data, monthKey, clauseNo, militaryNumber }) => {
    ensureActivePeriodWrite(monthKey);
    updateSubmoduleRecord(database, { recordId, data, monthKey, clauseNo, militaryNumber });
    const record = getSubmoduleRecord(database, recordId);
    return listSubmoduleRecords(database, record.submoduleId, monthKey);
  });

  handlePeriodRequest('submodule:records:delete', (_event, { recordId, monthKey }) => {
    ensureActivePeriodWrite(monthKey);
    const record = getSubmoduleRecord(database, recordId);
    if (!record) throw new Error('السجل غير موجود.');
    deleteSubmoduleRecord(database, { recordId, monthKey });
    return listSubmoduleRecords(database, record.submoduleId, monthKey);
  });

  handleAppRequest('submodule:field-values:list', (_event, submoduleId, fieldKey, query) => (
    listSavedFieldValues(database, submoduleId, fieldKey, query)
  ));

  handleAppRequest('submodule:template:select', async (_event, submoduleId) => {
    if (!getSubmodule(database, submoduleId)) throw new Error('القسم الفرعي غير موجود.');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختيار قالب Word للقسم الفرعي',
      properties: ['openFile'],
      filters: [{ name: 'قالب Word', extensions: ['docx'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const templatePath = await storeWordTemplate(result.filePaths[0], `submodule-${submoduleId}`);
    setSubmoduleTemplate(database, submoduleId, templatePath);
    return { canceled: false, modules: listModules(database) };
  });

  handleAppRequest('submodule:template:render', async (_event, input) => {
    const request = input && typeof input === 'object' && !Array.isArray(input)
      ? input
      : { recordIds: [input] };
    const recordIds = Array.isArray(request.recordIds) ? request.recordIds : [];
    if (!recordIds.length || recordIds.length > 500) {
      throw new Error('اختر سجلاً واحداً على الأقل، وبحد أقصى 500 سجل للطباعة.');
    }
    if (request.monthKey) validateMonthKey(request.monthKey);
    const records = [...new Set(recordIds.map((id) => Number(id)))].map((recordId) => getSubmoduleRecord(database, recordId));
    if (records.some((record) => !record)) throw new Error('أحد السجلات المحددة غير موجود.');
    if (new Set(records.map((record) => record.submoduleId)).size !== 1) {
      throw new Error('يجب اختيار سجلات من النموذج الفرعي نفسه.');
    }
    if (request.monthKey && records.some((record) => record.periodKey !== request.monthKey)) {
      throw new Error('أحد السجلات المحددة لا ينتمي إلى الفترة الحالية.');
    }
    const record = records[0];
    if (!record.templatePath) throw new Error('لم يتم إرفاق قالب Word بهذا القسم الفرعي أو بقسمه الرئيسي.');
    await fs.access(record.templatePath);
    const safeTitle = record.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'مستند';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: records.length === 1 ? 'حفظ المستند المعبأ' : `حفظ ${records.length} مستندات في ملف واحد`,
      defaultPath: `${safeTitle}${records.length === 1 ? '' : `-${records.length}-سجلات`}.docx`,
      filters: [{ name: 'مستند Word', extensions: ['docx'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const personnel = listPersonnel(database);
    const personnelColumns = listPersonnelColumns(database);
    const officialValues = getOfficialTemplateValues();
    const templateData = records.map((currentRecord) => {
      const linkedPerson = personnel.find((person) => person.military_number === currentRecord.military_number) || {};
      return createSubmoduleTemplateData(
        currentRecord,
        linkedPerson,
        personnelColumns,
        officialValues
      );
    });
    const output = await renderWordTemplateBatch(record.templatePath, templateData, officialValues);
    const filePath = await saveDocxFile(result.filePath, output);
    return { canceled: false, filePath, exported: records.length };
  });

  handleAppRequest('personnel:export-word', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ كشف الأفراد',
      defaultPath: 'كشف-الأفراد.docx',
      filters: [{ name: 'مستند Word', extensions: ['docx'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const records = listPersonnel(database);
    await fs.writeFile(result.filePath, await createPersonnelDocument(
      records,
      (await getInstitutionLogo()) ?? null,
      listPersonnelColumns(database)
    ));
    return { canceled: false, exported: records.length };
  });

  handleAppRequest('penalties:template:get', () => (
    getApplicationSetting(database, PENALTY_TEMPLATE_SETTING)
  ));
  handleAppRequest('penalties:template:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختيار قالب Word للجزاءات',
      properties: ['openFile'],
      filters: [{ name: 'قالب Word', extensions: ['docx'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const templatePath = await storeWordTemplate(result.filePaths[0], 'penalties');
    setApplicationSetting(database, PENALTY_TEMPLATE_SETTING, templatePath);
    return { canceled: false, templatePath };
  });

  handleAppRequest('personnel:import:preview', async (_event, monthKey) => {
    personnelImportPreviews.clear();
    ensureActivePeriodWrite(monthKey);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختيار ملف كشف الأفراد',
      properties: ['openFile'],
      filters: [{ name: 'Excel وCSV', extensions: ['xlsx', 'csv'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const parsed = await readPersonnelWorkbook(filePath, { allowUnmapped: true });
    const previewId = randomUUID();
    const now = Date.now();
    personnelImportPreviews.set(previewId, { filePath, monthKey, createdAt: now });
    return {
      canceled: false,
      previewId,
      headers: parsed.headers,
      mappings: parsed.mappings,
      rowCount: parsed.rowCount,
      previewRows: parsed.records.slice(0, 5).map((record) => record.sourceData)
    };
  });

  handleAppRequest('personnel:import:cancel', async (_event, previewId) => {
    if (typeof previewId === 'string') personnelImportPreviews.delete(previewId);
    return { canceled: false };
  });

  handleAppRequest('personnel:import:commit', async (_event, { previewId, mappings }) => {
    const preview = personnelImportPreviews.get(previewId);
    if (!preview || Date.now() - preview.createdAt > 15 * 60 * 1000) {
      personnelImportPreviews.delete(previewId);
      throw new Error('انتهت صلاحية معاينة الملف. أعد اختيار ملف Excel.');
    }
    ensureActivePeriodWrite(preview.monthKey);
    const parsed = await readPersonnelWorkbook(preview.filePath, { mappings });
    const inserted = importPersonnel(database, parsed.records, preview.monthKey, parsed.headers);
    personnelImportPreviews.delete(previewId);
    return {
      imported: inserted,
      rejected: parsed.errors.length,
      errors: parsed.errors,
      columns: listPersonnelColumns(database)
    };
  });

  handleAppRequest('personnel:import', async (_event, monthKey) => {
    ensureActivePeriodWrite(monthKey);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'اختيار ملف كشف الأفراد',
      properties: ['openFile'],
      filters: [{ name: 'Excel وCSV', extensions: ['xlsx', 'csv'] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, imported: 0, rejected: 0, errors: [] };
    }
    const parsed = await readPersonnelWorkbook(result.filePaths[0]);
    const inserted = importPersonnel(database, parsed.records, monthKey, parsed.headers);
    return {
      canceled: false,
      imported: inserted,
      rejected: parsed.errors.length,
      errors: parsed.errors
    };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    title: 'مكتب الماليات',
    icon: path.join(app.getAppPath(), 'build', 'icons', 'icon.ico'),
    backgroundColor: '#f4f6f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = isDevelopment
      ? url.startsWith('http://127.0.0.1:5173/')
      : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });

  if (!isDevelopment) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
  }
}

app.whenReady().then(async () => {
  try {
    database = await initializeDatabase(path.join(app.getPath('userData'), 'finance_system.db'));
    registerIpcHandlers();
    createWindow();
  } catch (error) {
    dialog.showErrorBox('تعذر تشغيل قاعدة البيانات', error.message);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (database && database.open) database.close();
});
