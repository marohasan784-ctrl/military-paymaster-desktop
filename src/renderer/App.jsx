import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import OfficialHeader from './components/OfficialHeader';
import Sidebar from './components/Sidebar';
import PenaltyForm from './components/PenaltyForm';
import PersonPicker from './components/PersonPicker';
import ReportCenter from './components/ReportCenter';
import TextTemplateManager from './components/TextTemplateManager';
import DocumentTemplateManager from './components/DocumentTemplateManager';
import DropdownOptionsManager from './components/DropdownOptionsManager';
import PersonnelImportDialog from './components/PersonnelImportDialog';
import SectionManager from './sections/SectionManager';
import RecordFieldInput from './sections/RecordFieldInput';
import SettingsPanel from './sections/SettingsPanel';
import { Button, Checkbox, ConfirmDialog, DataTable, ErrorState, PageHeader, Skeleton, ToastHost, notifyToast, useToastErrorState } from './components/ui/index.jsx';
import { matchesPersonnelSearch } from '../services/arabicSearch.js';
import { formatDate, formatDateTime, formatMoney, formatMonth, formatNumber } from '../services/formatters.js';
import { personnelValueForField } from '../services/personnelFieldMapping.js';
import { renderTextTemplate } from '../services/textTemplate.js';
import officialIdentity from '../config/officialIdentity.json';

function callFinanceApp(primaryMethod, fallbackMethod, ...args) {
  const api = window.financeApp;
  const method = api?.[primaryMethod] ?? api?.[fallbackMethod];
  if (typeof method !== 'function') {
    throw new Error('واجهات التطبيق غير محدثة. أغلق Electron بالكامل ثم أعد تشغيله.');
  }
  return method(...args);
}

function App() {
  const [activeSection, setActiveSection] = useState('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem('finance.sidebar.collapsed') === 'true'
  );
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(
    () => window.matchMedia('(max-width: 1023px)').matches
  );
  const navigationToggleRef = useRef(null);
  const previousMobileNavigationOpen = useRef(false);
  const [customModuleId, setCustomModuleId] = useState(null);
  const [activeSubmoduleId, setActiveSubmoduleId] = useState(null);
  const [modules, setModules] = useState([]);
  const [dropdownOptions, setDropdownOptions] = useState([]);
  const [sectionPresets, setSectionPresets] = useState([]);
  const [legacySalaryScreenVisible, setLegacySalaryScreenVisible] = useState(true);
  const [pendingPenaltyRecord, setPendingPenaltyRecord] = useState(null);
  const [personnel, setPersonnel] = useState([]);
  const [personnelColumns, setPersonnelColumns] = useState([]);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [personnelImportPreview, setPersonnelImportPreview] = useState(null);
  const [personnelImportSelectionRevision, setPersonnelImportSelectionRevision] = useState(0);
  const [textTemplates, setTextTemplates] = useState([]);
  const [submoduleRecords, setSubmoduleRecords] = useState([]);
  const [monthKey, setMonthKey] = useState('');
  const [activePeriodKey, setActivePeriodKey] = useState('');
  const [monthData, setMonthData] = useState(null);
  const [financialPeriod, setFinancialPeriod] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodLoadError, setPeriodLoadError] = useState(null);
  const [periodRefreshToken, setPeriodRefreshToken] = useState(0);
  const [archives, setArchives] = useState([]);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [viewedArchive, setViewedArchive] = useState(null);
  const [archiveAudit, setArchiveAudit] = useState([]);
  const [archiveRevisions, setArchiveRevisions] = useState([]);
  const [recordArchives, setRecordArchives] = useState([]);
  const [showArchiveSnapshot, setShowArchiveSnapshot] = useState(false);
  const [databasePath, setDatabasePath] = useState('');
  const [institutionLogo, setInstitutionLogo] = useState(null);
  const [penaltyTemplatePath, setPenaltyTemplatePath] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [appLoading, setAppLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closingPeriod, setClosingPeriod] = useState(false);
  const [unlockingPeriod, setUnlockingPeriod] = useState(false);
  const [, setFormattingRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [showTextTemplateManager, setShowTextTemplateManager] = useState(false);
  const [showDocumentTemplateManager, setShowDocumentTemplateManager] = useState(false);
  const [showSectionManager, setShowSectionManager] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showDropdownOptionsManager, setShowDropdownOptionsManager] = useState(false);

  function setNotice(message) {
    if (!message) return;
    const hasFailure = /تعذر|فشل/.test(message);
    const variant = hasFailure ? 'danger' : 'success';
    const action = message.includes('حفظه هنا:')
      ? { label: 'فتح مجلد الملف', onClick: revealLastWordExport }
      : undefined;
    notifyToast(message, variant, action);
  }

  useEffect(() => {
    window.localStorage.setItem('finance.sidebar.collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const refreshFormatters = () => setFormattingRevision((revision) => revision + 1);
    window.addEventListener('finance:formatting-preferences-change', refreshFormatters);
    return () => window.removeEventListener('finance:formatting-preferences-change', refreshFormatters);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const updateViewport = (event) => {
      setCompactViewport(event.matches);
      setMobileNavigationOpen(false);
    };
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    let cleanup;
    if (compactViewport && mobileNavigationOpen) {
      document.querySelector('#app-navigation button:not(:disabled)')?.focus();
      const closeOnEscape = (event) => {
        if (event.key === 'Escape') setMobileNavigationOpen(false);
      };
      document.addEventListener('keydown', closeOnEscape);
      cleanup = () => document.removeEventListener('keydown', closeOnEscape);
    } else if (compactViewport && previousMobileNavigationOpen.current) {
      navigationToggleRef.current?.focus();
    }
    previousMobileNavigationOpen.current = mobileNavigationOpen;
    return cleanup;
  }, [compactViewport, mobileNavigationOpen]);
  const dropdownOptionsByGroup = useMemo(() => {
    const groups = {};
    for (const option of dropdownOptions) {
      if (option.is_active !== 1) continue;
      const key = option.group_id;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ value: option.option_value, label: option.label, optionId: option.option_id });
    }
    return groups;
  }, [dropdownOptions]);
  const actionTypesByModule = useMemo(() => dropdownOptions.reduce((groups, option) => {
    if (option.group_id !== 'action_type' || option.is_active !== 1) return groups;
    if (!groups[option.scope_id]) groups[option.scope_id] = [];
    groups[option.scope_id].push({ value: option.option_value, label: option.label });
    return groups;
  }, {}), [dropdownOptions]);
  const personCategories = useMemo(() => [
    { value: 'all', label: 'الكل' },
    ...Array.from(new Set(personnel.map((person) => String(person.category || '').trim()).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'ar'))
      .map((value) => ({ value, label: value }))
  ], [personnel]);

  async function refreshPersonnel() {
    const records = await window.financeApp.listPersonnel();
    setPersonnel(records);
  }

  async function selectInstitutionLogo() {
    setLogoBusy(true);
    try {
      const result = await callFinanceApp('selectInstitutionLogo', null);
      if (result.canceled) return;
      setInstitutionLogo(result.dataUrl);
      setNotice('تم حفظ شعار المؤسسة محلياً وسيظهر في الترويسة والتقارير الجديدة.');
    } catch (error) {
      setNotice(`تعذر حفظ شعار المؤسسة: ${error.message}`);
    } finally {
      setLogoBusy(false);
    }
  }

  useEffect(() => {
    if (!window.financeApp) {
      setNotice('وضع معاينة الواجهة فقط: شغّل التطبيق من Electron لاستخدام قاعدة البيانات والعمليات المحلية.');
      setAppLoading(false);
      return undefined;
    }

    let active = true;
    Promise.all([
      window.financeApp.getStatus(),
      window.financeApp.listPersonnel(),
      window.financeApp.listPersonnelColumns(),
      window.financeApp.listDocumentTemplates(),
      window.financeApp.listModules(),
      window.financeApp.listDropdownOptions(),
      window.financeApp.listSectionPresets(),
      window.financeApp.getLegacySalaryScreenVisible(),
      window.financeApp.listTextTemplates({ includeArchived: true }),
      callFinanceApp('getActivePeriodKey', 'getCurrentMonth'),
      window.financeApp.listArchives(),
      typeof window.financeApp.getPenaltyTemplate === 'function'
        ? window.financeApp.getPenaltyTemplate()
        : Promise.resolve('')
    ]).then(([status, records, loadedPersonnelColumns, loadedDocumentTemplates, loadedModules, loadedDropdownOptions, loadedSectionPresets, showLegacySalaries, loadedTextTemplates, currentMonth, loadedArchives, loadedPenaltyTemplate]) => {
        if (!active) return;
        setDatabasePath(status.databasePath);
        setPersonnel(records);
        setPersonnelColumns(loadedPersonnelColumns);
        setDocumentTemplates(loadedDocumentTemplates);
        setModules(loadedModules);
        setDropdownOptions(loadedDropdownOptions);
        setSectionPresets(loadedSectionPresets);
        setLegacySalaryScreenVisible(showLegacySalaries);
        setTextTemplates(loadedTextTemplates);
        setMonthKey(currentMonth);
        setActivePeriodKey(currentMonth);
        setArchives(loadedArchives);
        setPenaltyTemplatePath(loadedPenaltyTemplate || '');
      })
      .catch((error) => {
        if (active) setNotice(`تعذر تحميل بيانات التطبيق: ${error.message}`);
      })
      .finally(() => {
        if (active) setAppLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof window.financeApp?.getInstitutionLogo !== 'function') return undefined;
    let active = true;
    window.financeApp.getInstitutionLogo()
      .then((logo) => { if (active) setInstitutionLogo(logo); })
      .catch((error) => { if (active) setNotice(`تعذر تحميل شعار المؤسسة: ${error.message}`); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!monthKey || !activeSubmoduleId) {
      setSubmoduleRecords([]);
      return undefined;
    }

    let active = true;
    window.financeApp.listSubmoduleRecords(activeSubmoduleId, monthKey)
      .then((records) => { if (active) setSubmoduleRecords(records); })
      .catch((error) => { if (active) setNotice(`تعذر تحميل بيانات القسم الفرعي: ${error.message}`); });
    return () => { active = false; };
  }, [activeSubmoduleId, monthKey]);

  useEffect(() => {
    if (!monthKey) {
      setPeriodLoading(false);
      return undefined;
    }
    let active = true;
    async function loadPeriod() {
      setPeriodLoading(true);
      setPeriodLoadError(null);
      try {
        const [data, archiveResult, period, loadedRecordArchives] = await Promise.all([
          callFinanceApp('loadData', 'getMonthData', monthKey),
          window.financeApp.getArchive(monthKey),
          window.financeApp.getFinancialPeriod(monthKey),
          window.financeApp.listRecordArchives(monthKey)
        ]);
        if (!active) return;
        setMonthData(period.is_locked && archiveResult.archive
          ? archiveResult.archive.snapshot
          : data);
        setFinancialPeriod(period);
        setSelectedArchive(archiveResult.archive);
        setViewedArchive(archiveResult.archive);
        setArchiveAudit(archiveResult.audit);
        setArchiveRevisions(archiveResult.revisions);
        setRecordArchives(loadedRecordArchives);
        setShowArchiveSnapshot(false);
      } catch (error) {
        if (active) {
          setPeriodLoadError({ monthKey, message: error.message });
          setNotice(`تعذر تحميل بيانات الشهر: ${error.message}`);
        }
      } finally {
        if (active) setPeriodLoading(false);
      }
    }

    loadPeriod();
    return () => { active = false; };
  }, [monthKey, periodRefreshToken]);

  const activeModule = modules.find((module) => module.id === (customModuleId || activeSection));
  const activeSubmodule = activeModule?.submodules.find((submodule) => submodule.id === activeSubmoduleId && submodule.is_active !== 0);
  const pageTitle = activeSubmodule?.title || activeModule?.title || 'لوحة المتابعة';
  const pageDescriptions = {
    home: 'ملخص الفترة المالية والتقارير والأرشيف وإعدادات الأقسام.',
    personnel: 'استعرض بيانات الأفراد أو استورد كشفاً وحدد سجلات للتصدير.',
    salaries: 'سجّل الماهيات والبدلات للأفراد ضمن الفترة المالية.',
    accessions: 'أدر سجلات الضم والنماذج المرتبطة بها.',
    deletions: 'أدر سجلات الشطب والنماذج المرتبطة بها.',
    penalties: 'سجّل الإجراءات والجزاءات واستخدم قوالب Word المرتبطة بها.',
    supplies: 'أدر أوامر التوريد وسجلاتها ضمن الفترة المالية.',
    invoices: 'أنشئ فاتورة إلكترونية أو بيان أسعار وتابع مستندات الفترة.'
  };
  const pageDescription = activeSubmodule
    ? `إدارة سجلات نموذج ${activeSubmodule.title} ضمن الفترة المالية الحالية.`
    : customModuleId
      ? `إدارة نماذج وسجلات قسم ${activeModule?.title || ''}.`
      : pageDescriptions[activeSection] || '';
  const breadcrumbs = customModuleId
    ? [
      { label: 'لوحة المتابعة', onClick: () => navigate('home') },
      ...(activeSubmodule
        ? [{ label: activeModule?.title || 'القسم', onClick: () => navigate(customModuleId) }, { label: activeSubmodule.title }]
        : [{ label: activeModule?.title || pageTitle }])
    ]
    : activeSubmodule
      ? [
        { label: activeModule?.title || 'القسم', onClick: () => navigate(activeModule.id) },
        { label: activeSubmodule.title }
      ]
      : [];
  const periodIsLocked = financialPeriod?.is_locked === 1;
  const isActivePeriod = Boolean(monthKey && monthKey === activePeriodKey);
  const periodIsReadOnly = periodIsLocked || !isActivePeriod;
  const personnelForMonth = financialPeriod?.is_locked === 1
    ? selectedArchive?.snapshot?.personnel || personnel
    : personnel;
  const salariesForMonth = monthData?.salaries || [];

  const visiblePersonnel = useMemo(() => {
    return personnelForMonth.filter((person) => matchesPersonnelSearch(person, search));
  }, [personnelForMonth, search]);

  const visibleSubmoduleRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ar');
    if (!query || !activeSubmodule) return submoduleRecords;
    return submoduleRecords.filter((record) =>
      activeSubmodule.fields.some((field) =>
        String(record.data[field.key] ?? '').toLocaleLowerCase('ar').includes(query)
      )
    );
  }, [activeSubmodule, search, submoduleRecords]);

  function navigate(moduleId, submoduleId = null) {
    if (['home', 'personnel', 'salaries', 'accessions', 'deletions', 'penalties', 'supplies', 'invoices'].includes(moduleId)) {
      setActiveSection(moduleId);
      setCustomModuleId(null);
    } else {
      setActiveSection('home');
      setCustomModuleId(moduleId);
    }
    setActiveSubmoduleId(submoduleId);
    setSearch('');
    setNotice('');
  }

  function openSectionManager() {
    navigate('home');
    setShowSectionManager(true);
  }

  function selectMonth(value) {
    if (value === monthKey) {
      if (value) retryPeriodLoad();
      return;
    }
    setMonthKey(value);
    setSelectedArchive(null);
    setViewedArchive(null);
    setArchiveAudit([]);
    setArchiveRevisions([]);
    setMonthData(null);
    setFinancialPeriod(null);
    setPeriodLoading(Boolean(value));
    setPeriodLoadError(null);
    setSubmoduleRecords([]);
    setRecordArchives([]);
    setShowArchiveSnapshot(false);
    setNotice('');
  }

  function retryPeriodLoad() {
    setPeriodLoadError(null);
    setNotice('');
    setPeriodRefreshToken((value) => value + 1);
  }

  async function createModule(title, icon, presetId) {
    try {
      const result = await window.financeApp.addModule(title, icon, presetId);
      setModules(result.modules);
      setActiveSection('home');
      setCustomModuleId(result.moduleId);
      setActiveSubmoduleId(result.submoduleId || null);
      setShowSectionManager(false);
      setNotice(result.submoduleId
        ? 'تم إنشاء القسم من النموذج الجاهز المختار.'
        : 'تم إنشاء القسم فارغاً؛ يمكنك إضافة نموذج وحقوله لاحقاً.');
    } catch (error) {
      setNotice(`تعذر إنشاء القسم: ${error.message}`);
      throw error;
    }
  }

  async function createSubmodule(moduleId, { title, fields }) {
    try {
      const result = await window.financeApp.addSubmodule({ moduleId, title, fields });
      setModules(result.modules);
      navigate(moduleId, result.submoduleId);
      setNotice('تم إنشاء القسم الفرعي بنجاح.');
    } catch (error) {
      setNotice(`تعذر إنشاء القسم الفرعي: ${error.message}`);
      throw error;
    }
  }

  async function addSubmoduleRecord(records, action = null, clauseNo = '', militaryNumber = null) {
    try {
      if (Array.isArray(records)) {
        const result = await window.financeApp.addSubmoduleRecordsBulk({
          submoduleId: activeSubmoduleId,
          records: records.map(({ data, militaryNumber: recordMilitaryNumber }) => ({
            data,
            clauseNo,
            militaryNumber: recordMilitaryNumber
          })),
          monthKey
        });
        setSubmoduleRecords(result.records);
        setNotice(`تم حفظ ${result.recordIds.length} سجل${result.recordIds.length === 1 ? '' : 'ات'} بنجاح.`);
      } else {
        const updatedRecords = await window.financeApp.addSubmoduleRecord({
          submoduleId: activeSubmoduleId,
          data: records,
          action,
          clauseNo,
          militaryNumber,
          monthKey
        });
        setSubmoduleRecords(updatedRecords);
        setNotice('تم حفظ السجل بنجاح.');
      }
      setMonthData(await callFinanceApp('loadData', 'getMonthData', monthKey));
    } catch (error) {
      setNotice(`تعذر حفظ السجل: ${error.message}`);
      throw error;
    }
  }

  async function updateSubmoduleRecord(recordId, data, clauseNo, militaryNumber) {
    const records = await window.financeApp.updateSubmoduleRecord({ recordId, data, clauseNo, militaryNumber, monthKey });
    setSubmoduleRecords(records);
    setMonthData(await callFinanceApp('loadData', 'getMonthData', monthKey));
    setNotice('تم تحديث السجل بنجاح.');
  }

  async function deleteSubmoduleRecord(recordId) {
    const records = await window.financeApp.deleteSubmoduleRecord({ recordId, monthKey });
    setSubmoduleRecords(records);
    setMonthData(await callFinanceApp('loadData', 'getMonthData', monthKey));
    setNotice('تم حذف السجل بنجاح.');
  }

  async function renameModule(moduleId, title) {
    const result = await window.financeApp.updateModule({ moduleId, title });
    setModules(result.modules);
    setNotice('تم تحديث اسم القسم.');
  }

  async function hideModule(moduleId) {
    const result = await window.financeApp.archiveModule(moduleId);
    setModules(result.modules);
    if (customModuleId === moduleId) navigate('home');
    setNotice('تم إخفاء القسم.');
  }

  async function restoreModule(moduleId) {
    const result = await window.financeApp.restoreModule(moduleId);
    setModules(result.modules);
    setNotice('تم إظهار القسم.');
  }

  async function reorderModules(moduleIds) {
    const result = await window.financeApp.reorderModules(moduleIds);
    setModules(result.modules);
    setNotice('تم حفظ ترتيب الأقسام.');
  }

  async function copyModule(moduleId, title) {
    const result = await window.financeApp.copyModule({ moduleId, title });
    setModules(result.modules);
    setNotice('تم نسخ القسم وحقوله والنصوص المرتبطة به.');
  }

  async function exportModuleDefinition(moduleId) {
    const result = await window.financeApp.exportModuleDefinition(moduleId);
    if (!result.canceled) setNotice('تم تصدير تعريف القسم بصيغة JSON.');
  }

  async function previewModuleDefinitionImport() {
    return window.financeApp.previewModuleDefinitionImport();
  }

  async function importModuleDefinition(definition, title) {
    const result = await window.financeApp.importModuleDefinition({ definition, title });
    setModules(result.modules);
    setNotice('تم استيراد تعريف القسم بنجاح.');
  }

  async function updateSectionSubmodule(submoduleId, input) {
    const result = await window.financeApp.updateSubmodule({ submoduleId, ...input });
    setModules(result.modules);
    setNotice('تم تحديث تعريف النموذج والحقول.');
  }

  async function hideSectionSubmodule(submoduleId) {
    const result = await window.financeApp.archiveSubmodule(submoduleId);
    setModules(result.modules);
    if (activeSubmoduleId === submoduleId) setActiveSubmoduleId(null);
    setNotice('تم إخفاء النموذج الفرعي.');
  }

  async function restoreSectionSubmodule(submoduleId) {
    const result = await window.financeApp.restoreSubmodule(submoduleId);
    setModules(result.modules);
    setNotice('تم إظهار النموذج الفرعي.');
  }

  async function deleteSectionSubmodule(submoduleId) {
    const result = await window.financeApp.deleteSubmodule(submoduleId);
    setModules(result.modules);
    if (activeSubmoduleId === submoduleId) setActiveSubmoduleId(null);
    setNotice('تم حذف القسم الفرعي وسجلاته وقوالبه المرتبطة.');
  }

  async function saveSalary(input) {
    try {
      const salaries = await window.financeApp.saveMonthlySalary({ ...input, monthKey });
      setMonthData(await callFinanceApp('loadData', 'getMonthData', monthKey));
      setNotice(`تم حفظ ماهية الفرد لشهر ${monthKey}.`);
      return salaries;
    } catch (error) {
      setNotice(`تعذر حفظ الماهية: ${error.message}`);
      throw error;
    }
  }

  async function updateLegacySalaryScreenVisibility(visible) {
    try {
      const savedValue = await window.financeApp.setLegacySalaryScreenVisible(visible);
      setLegacySalaryScreenVisible(savedValue);
      if (!savedValue && activeSection === 'salaries') navigate('home');
      setNotice(savedValue
        ? 'تم إظهار شاشة الماهيات القديمة دون تغيير بياناتها.'
        : 'تم إخفاء شاشة الماهيات القديمة من التنقل فقط؛ بياناتها محفوظة.');
    } catch (error) {
      setNotice(`تعذر حفظ إعداد شاشة الماهيات: ${error.message}`);
    }
  }

  function createRecordFromPenalty(penalty, moduleId, submoduleId) {
    setPendingPenaltyRecord({
      moduleId,
      submoduleId,
      militaryNumber: penalty.military_number,
      linkedValue: `penalty:${penalty.id}`,
      clauseNo: penalty.clause_no || ''
    });
    navigate(moduleId, submoduleId);
  }

  async function saveInvoice(input) {
    try {
      const result = await window.financeApp.saveInvoice({ ...input, monthKey });
      setMonthData(result.monthData);
      const documentName = result.invoice.document_type === 'quotation' ? 'بيان الأسعار' : 'الفاتورة';
      setNotice(`تم حفظ ${documentName} ${result.invoice.invoice_number} وإضافتها إلى أرشيف الفترة.`);
      return result.invoice;
    } catch (error) {
      setNotice(`تعذر حفظ الفاتورة: ${error.message}`);
      throw error;
    }
  }

  async function savePenalty(input) {
    try {
      const result = await window.financeApp.addPenalty({ ...input, monthKey });
      setMonthData(result.monthData);
      setNotice(`تم تسجيل الإجراء للفرد ${input.militaryNumber} ضمن ${monthKey}.`);
    } catch (error) {
      setNotice(`تعذر تسجيل الجزاء: ${error.message}`);
      throw error;
    }
  }

  async function createTextTemplate(input) {
    const created = await window.financeApp.addTextTemplate(input);
    setTextTemplates((current) => [...current.filter((template) => template.id !== created.id), created]);
    setNotice('تم حفظ النص في المكتبة واختياره لهذا السجل.');
    return created;
  }

  async function updateTextTemplate(input) {
    const updated = await window.financeApp.updateTextTemplate(input);
    setTextTemplates((current) => current.map((template) => (
      template.id === updated.id ? updated : template
    )));
    setNotice('تم تحديث النص الجاهز؛ السجلات السابقة لم تتغير.');
    return updated;
  }

  async function archiveTextTemplate(id) {
    const archived = await window.financeApp.archiveTextTemplate(id);
    setTextTemplates((current) => current.map((template) => (
      template.id === archived.id ? archived : template
    )));
    setNotice('تم إخفاء النص من قوائم الاختيار دون حذف السجلات المرتبطة به.');
    return archived;
  }

  async function addActionTypeOption(input) {
    setDropdownOptions(await window.financeApp.addActionTypeOption(input));
    setNotice('تمت إضافة الخيار بنجاح.');
  }

  async function renameDropdownOption(optionId, label) {
    setDropdownOptions(await window.financeApp.updateDropdownOption({ optionId, label }));
    setTextTemplates(await window.financeApp.listTextTemplates({ includeArchived: true }));
    setMonthData(await callFinanceApp('loadData', 'getMonthData', monthKey));
    if (activeSubmoduleId) {
      setSubmoduleRecords(await window.financeApp.listSubmoduleRecords(activeSubmoduleId, monthKey));
    }
    setNotice('تم تحديث الخيار بنجاح.');
  }

  async function setDropdownOptionActive(optionId, isActive) {
    setDropdownOptions(await window.financeApp.setDropdownOptionActive({ optionId, isActive }));
    setNotice(isActive ? 'تم إظهار الخيار.' : 'تم إخفاء الخيار.');
  }

  async function reorderDropdownOptions(input) {
    setDropdownOptions(await window.financeApp.reorderDropdownOptions(input));
    setNotice('تم حفظ ترتيب الخيارات.');
  }

  async function selectPenaltyTemplate() {
    try {
      const result = await window.financeApp.selectPenaltyTemplate();
      if (result.canceled) return;
      setPenaltyTemplatePath(result.templatePath);
      setNotice('تم حفظ قالب Word للجزاءات.');
    } catch (error) {
      setNotice(`تعذر اختيار قالب الجزاءات: ${error.message}`);
    }
  }

  async function exportPenaltyWord(penaltyIds) {
    try {
      const ids = Array.isArray(penaltyIds) ? penaltyIds : [penaltyIds];
      const result = await window.financeApp.exportPenaltyWord(ids);
      if (!result.canceled) setNotice(`تم إنشاء مستند Word من القالب المحدد يضم ${formatNumber(result.exported || ids.length)} سجلاً وحفظه هنا: ${result.filePath}`);
    } catch (error) {
      setNotice(`تعذر إنشاء مستند الجزاء: ${error.message}`);
    }
  }

  async function revealLastWordExport() {
    try {
      const result = await window.financeApp.revealLastWordExport();
      setNotice(`تم فتح مجلد الملف: ${result.filePath}`);
    } catch (error) {
      setNotice(`تعذر فتح مجلد ملف Word: ${error.message}`);
    }
  }

  async function savePeriodRange(startDate, endDate) {
    setNotice('');
    try {
      const period = await window.financeApp.setFinancialPeriodRange({ monthKey, startDate, endDate });
      setFinancialPeriod(period);
      setNotice(`تم حفظ نطاق الفترة من ${period.start_date} إلى ${period.end_date}.`);
    } catch (error) {
      setNotice(`تعذر حفظ نطاق الفترة: ${error.message}`);
    }
  }

  async function activatePeriod() {
    setNotice('');
    try {
      const period = await window.financeApp.activateFinancialPeriod(monthKey);
      setActivePeriodKey(monthKey);
      setFinancialPeriod(period);
      setNotice(`تم فتح بداية ${monthKey} كفترة مالية نشطة، وستُربط بها المدخلات الجديدة.`);
    } catch (error) {
      setNotice(`تعذر تفعيل الفترة المالية: ${error.message}`);
    }
  }

  async function saveMonthlyArchive() {
    setNotice('');
    setClosingPeriod(true);
    try {
      const result = await callFinanceApp('saveData', 'saveArchive', monthKey);
      if (result.canceled) return;
      setSelectedArchive(result.archive);
      setViewedArchive(result.archive);
      setArchives(result.archives);
      const [archiveResult, period] = await Promise.all([
        window.financeApp.getArchive(monthKey),
        window.financeApp.getFinancialPeriod(monthKey)
      ]);
      setMonthData(result.archive.snapshot);
      setFinancialPeriod(period);
      setArchiveAudit(archiveResult.audit);
      setArchiveRevisions(archiveResult.revisions);
      setNotice(`تم حفظ وتقفيل ${monthKey} نهائياً - الإصدار ${result.archive.revision}.`);
    } catch (error) {
      setNotice(`تعذر حفظ الأرشيف: ${error.message}`);
    } finally {
      setClosingPeriod(false);
    }
  }

  async function unlockMonth() {
    setNotice('');
    setUnlockingPeriod(true);
    try {
      const result = await callFinanceApp('toggleArchiveLock', 'unlockFinancialPeriod', monthKey);
      if (result.canceled) return;
      setFinancialPeriod(result.period);
      setSelectedArchive(result.archive);
      setViewedArchive(result.archive);
      setArchives(result.archives);
      setArchiveAudit(result.audit);
      setArchiveRevisions(result.revisions);
      setMonthData(result.data);
      setShowArchiveSnapshot(false);
      if (activeSubmoduleId) {
        setSubmoduleRecords(await window.financeApp.listSubmoduleRecords(activeSubmoduleId, monthKey));
      }
      setNotice(`تم فتح ${monthKey} للتعديل. الأرشيف السابق محفوظ، وتم تسجيل العملية في سجل المراجعة.`);
    } catch (error) {
      setNotice(`تعذر فتح الشهر: ${error.message}`);
    } finally {
      setUnlockingPeriod(false);
    }
  }

  async function copyMonthlyArchive() {
    setNotice('');
    try {
      const result = await window.financeApp.copyArchiveToCurrent(monthKey);
      if (result.canceled) return;
      setNotice(`تم نسخ بيانات ${monthKey} إلى ${result.targetMonth}.`);
      setArchives(await window.financeApp.listArchives());
      const archiveResult = await window.financeApp.getArchive(monthKey);
      setArchiveAudit(archiveResult.audit);
    } catch (error) {
      setNotice(`تعذر نسخ الأرشيف: ${error.message}`);
    }
  }

  async function archiveSelectedRecords(records) {
    const updatedArchives = await window.financeApp.archiveRecords({ monthKey, records });
    const [updatedPersonnel, currentArchives] = await Promise.all([
      window.financeApp.listPersonnel(),
      window.financeApp.listRecordArchives(monthKey)
    ]);
    setPersonnel(updatedPersonnel);
    setRecordArchives(currentArchives.length ? currentArchives : updatedArchives);
    if (!periodIsLocked) {
      setMonthData(await callFinanceApp('loadData', 'getMonthData', monthKey));
      if (activeSubmoduleId) {
        setSubmoduleRecords(await window.financeApp.listSubmoduleRecords(activeSubmoduleId, monthKey));
      }
    }
    setNotice(`تمت أرشفة ${records.length} سجل. يمكنك استرجاعه من السجلات المؤرشفة.`);
  }

  async function restoreArchivedRecord(archive) {
    await window.financeApp.restoreArchivedRecord(archive);
    const [updatedPersonnel, currentArchives] = await Promise.all([
      window.financeApp.listPersonnel(),
      window.financeApp.listRecordArchives(monthKey)
    ]);
    setPersonnel(updatedPersonnel);
    setRecordArchives(currentArchives);
    if (!periodIsLocked) {
      setMonthData(await callFinanceApp('loadData', 'getMonthData', monthKey));
      if (activeSubmoduleId) {
        setSubmoduleRecords(await window.financeApp.listSubmoduleRecords(activeSubmoduleId, monthKey));
      }
    }
    setNotice('تم استرجاع السجل إلى بياناته النشطة.');
  }

  async function exportMonthlyReport() {
    try {
      const result = await callFinanceApp('exportDocx', 'exportMonthlyReport', monthKey);
      if (!result.canceled) {
        setNotice(result.revision
          ? `تم تصدير تقرير الأرشيف ${result.monthKey} بالإصدار ${result.revision}.`
          : `تم تصدير تقرير بيانات ${result.monthKey} الحالية.`);
      }
    } catch (error) {
      setNotice(`تعذر تصدير التقرير الشهري: ${error.message}`);
    }
  }

  function openArchiveSnapshot() {
    setViewedArchive(selectedArchive);
    setShowArchiveSnapshot(true);
  }

  async function selectArchiveRevision(revision) {
    try {
      setViewedArchive(await window.financeApp.getArchiveRevision(monthKey, Number(revision)));
    } catch (error) {
      setNotice(`تعذر فتح إصدار الأرشيف: ${error.message}`);
    }
  }

  async function chooseTemplate() {
    try {
      const result = await window.financeApp.selectSubmoduleTemplate(activeSubmoduleId);
      if (result.canceled) return;
      setModules(result.modules);
      setNotice('تم حفظ ارتباط قالب Word بهذا القسم الفرعي.');
    } catch (error) {
      setNotice(`تعذر حفظ القالب: ${error.message}`);
    }
  }

  async function chooseModuleTemplate(moduleId) {
    try {
      const result = await window.financeApp.selectModuleTemplate(moduleId);
      if (result.canceled) return;
      setModules(result.modules);
      setNotice('تم حفظ قالب Word للقسم الرئيسي.');
    } catch (error) {
      setNotice(`تعذر اختيار قالب القسم: ${error.message}`);
    }
  }

  async function exportModuleTemplate(moduleId, recordIds) {
    try {
      const result = await window.financeApp.exportModuleTemplate(moduleId, monthKey, recordIds);
      const reportModuleTitle = modules.find((module) => module.id === moduleId)?.title || 'القسم';
      if (!result.canceled) setNotice(recordIds
        ? `تم إنشاء مستند Word من قالب ${reportModuleTitle} يضم ${formatNumber(result.exported || recordIds.length)} سجلاً وحفظه هنا: ${result.filePath}`
        : `تم تصدير تقرير ${reportModuleTitle} من قالب Word وحفظه هنا: ${result.filePath}`);
    } catch (error) {
      setNotice(`تعذر تصدير تقرير القسم: ${error.message}`);
    }
  }

  async function renderTemplate(input) {
    try {
      const request = Array.isArray(input)
        ? { recordIds: input, monthKey }
        : typeof input === 'object'
          ? { ...input, monthKey }
          : { recordIds: [input], monthKey };
      const result = await window.financeApp.renderSubmoduleTemplate(request);
      if (!result.canceled) setNotice(`تم إنشاء مستند Word يضم ${formatNumber(result.exported || request.recordIds.length)} سجلاً وحفظه هنا: ${result.filePath}`);
    } catch (error) {
      setNotice(`تعذر إنشاء المستند: ${error.message}`);
    }
  }

  async function printReportRows(rows) {
    if (!rows?.length) {
      await exportPdf({ reportOnly: true });
      return;
    }
    const first = rows[0];
    const sameTemplateScope = rows.every((row) => (
      row.moduleId === first.moduleId
      && row.submoduleId === first.submoduleId
      && row.entityType === first.entityType
    ));
    if (sameTemplateScope) {
      const module = modules.find((item) => item.id === first.moduleId);
      if (first.submoduleId) {
        const submodule = module?.submodules.find((item) => item.id === first.submoduleId);
        if (submodule?.template_path || module?.template_path) {
          await renderTemplate({ recordIds: rows.map((row) => row.recordId), monthKey });
          return;
        }
      } else if (first.entityType === 'penalty' && penaltyTemplatePath) {
        await exportPenaltyWord(rows.map((row) => row.recordId));
        return;
      } else if (module?.template_path) {
        await exportModuleTemplate(first.moduleId, rows.map((row) => row.recordId));
        return;
      }
    }
    await exportPdf({ reportOnly: true });
  }

  async function importFile() {
    setBusy(true);
    setNotice('');
    setPersonnelImportPreview(null);
    try {
      const preview = await window.financeApp.previewPersonnelImport(monthKey);
      if (!preview.canceled) {
        setSearch('');
        setPersonnelImportSelectionRevision((revision) => revision + 1);
        setPersonnelImportPreview(preview);
      }
    } catch (error) {
      setNotice(`فشل الاستيراد: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function closePersonnelImportPreview() {
    const previewId = personnelImportPreview?.previewId;
    setPersonnelImportPreview(null);
    if (!previewId) return;
    try {
      await window.financeApp.cancelPersonnelImportPreview(previewId);
    } catch (error) {
      setNotice(`تعذر تنظيف معاينة الاستيراد: ${error.message}`);
    }
  }

  async function commitPersonnelImport(previewId, mappings) {
    setBusy(true);
    setNotice('');
    try {
      const result = await window.financeApp.commitPersonnelImport({ previewId, mappings });
      const [updatedPersonnel, columns, updatedMonthData] = await Promise.all([
        window.financeApp.listPersonnel(),
        window.financeApp.listPersonnelColumns(),
        callFinanceApp('loadData', 'getMonthData', monthKey)
      ]);
      setPersonnel(updatedPersonnel);
      setPersonnelColumns(columns);
      setMonthData(updatedMonthData);
      setPersonnelImportSelectionRevision((revision) => revision + 1);
      if (activeSubmoduleId) {
        setSubmoduleRecords(await window.financeApp.listSubmoduleRecords(activeSubmoduleId, monthKey));
      }
      setPersonnelImportPreview(null);
      const summary = `تم تحديث ${result.imported} سجل.`;
      setNotice(result.errors.length
        ? `${summary} تعذر استيراد ${result.rejected} صف. ${result.errors.slice(0, 3).join(' ')}`
        : summary);
    } finally {
      setBusy(false);
    }
  }

  async function saveDocumentTemplate(input) {
    const saved = await window.financeApp.saveDocumentTemplate(input);
    setDocumentTemplates(await window.financeApp.listDocumentTemplates());
    setNotice('تم حفظ قالب المستند وربطه بالقسم المحدد.');
    return saved;
  }

  async function setDocumentTemplateActive(templateId, isActive) {
    setDocumentTemplates(await window.financeApp.setDocumentTemplateActive({ templateId, isActive }));
    setNotice(isActive ? 'تم تفعيل قالب المستند.' : 'تم إخفاء قالب المستند.');
  }

  async function updatePersonnelColumnLabel(columnKey, label) {
    setPersonnelColumns(await window.financeApp.updatePersonnelColumnPlaceholder({ columnKey, label }));
    setNotice('تم تحديث اسم متغير Excel.');
  }

  async function exportSmartDocument(templateId, recordId = '') {
    try {
      const result = await window.financeApp.exportDocumentTemplate({ templateId, monthKey, recordId });
      if (!result.canceled) setNotice(`تم إنشاء المستند من القالب ${result.title}.`);
    } catch (error) {
      setNotice(`تعذر إنشاء المستند من القالب: ${error.message}`);
    }
  }

  async function exportWord() {
    setNotice('');
    try {
      const result = await window.financeApp.exportPersonnelWord();
      if (!result.canceled) setNotice(`تم حفظ مستند Word ويتضمن ${result.exported} سجل.`);
    } catch (error) {
      setNotice(`فشل تصدير مستند Word: ${error.message}`);
    }
  }

  async function exportPdf({ reportOnly = false } = {}) {
    setExportingPdf(true);
    if (reportOnly) document.body.classList.add('print-report-only');
    try {
      const result = await callFinanceApp('exportPdf', 'printReport');
      if (!result.canceled) setNotice(reportOnly ? 'اكتملت طباعة نتائج التقرير أو حفظها PDF.' : 'اكتملت الطباعة أو عملية حفظ PDF.');
    } catch (error) {
      setNotice(`تعذر الطباعة أو حفظ PDF: ${error.message}`);
    } finally {
      document.body.classList.remove('print-report-only');
      setExportingPdf(false);
    }
  }

  return (
    <div dir="rtl" className="relative min-h-screen bg-slate-100 text-slate-900">
      <ToastHost />
      {institutionLogo && (
        <img
          className="institution-watermark"
          src={institutionLogo}
          alt=""
          aria-hidden="true"
        />
      )}
      <div className="relative z-10 flex min-h-screen">
        {compactViewport && mobileNavigationOpen && (
          <button
            className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
            type="button"
            onClick={() => setMobileNavigationOpen(false)}
            aria-label="إغلاق القائمة الجانبية"
          />
        )}
        <Sidebar
          activeSection={customModuleId || activeSection}
          modules={modules}
          onNavigate={(section) => {
            navigate(section);
            setMobileNavigationOpen(false);
          }}
          logo={institutionLogo}
          legacySalaryScreenVisible={legacySalaryScreenVisible}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileNavigationOpen}
          compactViewport={compactViewport}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <OfficialHeader
            logo={institutionLogo}
            onSelectLogo={selectInstitutionLogo}
            logoBusy={logoBusy}
            onToggleNavigation={() => {
              if (compactViewport) setMobileNavigationOpen((open) => !open);
              else setSidebarCollapsed((collapsed) => !collapsed);
            }}
            navigationExpanded={compactViewport ? mobileNavigationOpen : !sidebarCollapsed}
            navigationToggleRef={navigationToggleRef}
          />
          <main dir="rtl" className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-8 lg:px-10">
            <PageHeader
              as="h1"
              eyebrow="مكتب الماليات"
              title={pageTitle}
              description={pageDescription}
              breadcrumbs={breadcrumbs}
            />

            {periodIsLocked && (
              <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                <span className="font-bold">هذه الفترة مقفلة — يعرض التقرير الأرشيف المحفوظ فقط.</span>
                <span>تم التقفيل: {financialPeriod.locked_at}</span>
              </div>
            )}
            {!periodIsLocked && !isActivePeriod && monthKey && (
              <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                الفترة المعروضة ليست نشطة؛ الإدخال متوقف حتى تختار «فتح بداية الشهر» لهذه الفترة.
              </div>
            )}

            {appLoading && (
              <div role="status" className="mb-5 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                <Skeleton className="h-4 w-4 rounded-full" />
                جارٍ تحميل بيانات النظام...
              </div>
            )}

            {activeSection === 'home' && !customModuleId && !showDocumentTemplateManager && !showDropdownOptionsManager && !showSectionManager && !showTextTemplateManager && !showSettingsPanel && (
              <Dashboard
                key={personnelImportSelectionRevision}
                modules={modules}
                documentTemplates={documentTemplates}
                monthData={monthData}
                selectedArchive={selectedArchive}
                isLocked={periodIsLocked}
                isReadOnly={periodIsReadOnly}
                onImport={importFile}
                busy={busy}
                onCreateModule={createModule}
                onViewArchive={openArchiveSnapshot}
                onCopyArchive={copyMonthlyArchive}
                onExportReport={exportMonthlyReport}
                onPrintReportRows={printReportRows}
                exportingPdf={exportingPdf}
                onExportPersonnelWord={exportWord}
                onChooseModuleTemplate={chooseModuleTemplate}
                onExportModuleTemplate={exportModuleTemplate}
                period={financialPeriod}
                periodLoading={periodLoading}
                periodLoadError={periodLoadError?.monthKey === monthKey ? periodLoadError.message : ''}
                onRetryPeriod={retryPeriodLoad}
                onMonthChange={selectMonth}
                activePeriodKey={activePeriodKey}
                onActivatePeriod={activatePeriod}
                onSaveRange={savePeriodRange}
                archives={archives}
                onSaveArchive={saveMonthlyArchive}
                closingPeriod={closingPeriod}
                onUnlockPeriod={unlockMonth}
                unlockingPeriod={unlockingPeriod}
                viewedArchive={viewedArchive}
                archiveAudit={archiveAudit}
                archiveRevisions={archiveRevisions}
                onSelectArchiveRevision={selectArchiveRevision}
                onCloseArchive={() => setShowArchiveSnapshot(false)}
                recordArchives={recordArchives}
                onArchiveRecords={archiveSelectedRecords}
                onRestoreRecord={restoreArchivedRecord}
                onExportSmartDocument={exportSmartDocument}
                onManageTextTemplates={() => setShowTextTemplateManager(true)}
                onManageDocumentTemplates={() => setShowDocumentTemplateManager(true)}
                onManageSections={() => setShowSectionManager(true)}
                onManageSettings={() => setShowSettingsPanel(true)}
                onManageDropdownOptions={() => setShowDropdownOptionsManager(true)}
                sectionPresets={sectionPresets}
                monthKey={monthKey}
              />
            )}
            {activeSection === 'home' && !customModuleId && showDocumentTemplateManager && (
              <DocumentTemplateManager
                templates={documentTemplates}
                modules={modules}
                personnelColumns={personnelColumns}
                editorOptions={dropdownOptionsByGroup}
                onSave={saveDocumentTemplate}
                onSetActive={setDocumentTemplateActive}
                onUpdateColumnLabel={updatePersonnelColumnLabel}
                onClose={() => setShowDocumentTemplateManager(false)}
              />
            )}
            {activeSection === 'home' && !customModuleId && showSettingsPanel && (
              <SettingsPanel
                legacySalaryScreenVisible={legacySalaryScreenVisible}
                onChangeLegacySalaryScreenVisible={updateLegacySalaryScreenVisibility}
                onClose={() => setShowSettingsPanel(false)}
              />
            )}
            {activeSection === 'home' && !customModuleId && showSectionManager && (
              <SectionManager
                modules={modules}
                onRename={renameModule}
                onArchive={hideModule}
                onRestore={restoreModule}
                onReorder={reorderModules}
                onCopy={copyModule}
                onExport={exportModuleDefinition}
                onPreviewImport={previewModuleDefinitionImport}
                onImport={importModuleDefinition}
                onAddSubmodule={createSubmodule}
                onUpdateSubmodule={updateSectionSubmodule}
                onArchiveSubmodule={hideSectionSubmodule}
                onDeleteSubmodule={deleteSectionSubmodule}
                onRestoreSubmodule={restoreSectionSubmodule}
                fieldTypeOptions={dropdownOptionsByGroup.field_type || []}
                personCategories={personCategories}
                onClose={() => setShowSectionManager(false)}
              />
            )}
            {activeSection === 'home' && !customModuleId && showTextTemplateManager && (
              <TextTemplateManager
                templates={textTemplates}
                modules={modules}
                actionTypesByModule={actionTypesByModule}
                onUpdate={updateTextTemplate}
                onArchive={archiveTextTemplate}
                onClose={() => setShowTextTemplateManager(false)}
              />
            )}
            {activeSection === 'home' && !customModuleId && showDropdownOptionsManager && (
              <DropdownOptionsManager
                modules={modules}
                options={dropdownOptions}
                onAdd={addActionTypeOption}
                onRename={renameDropdownOption}
                onSetActive={setDropdownOptionActive}
                onReorder={reorderDropdownOptions}
                onClose={() => setShowDropdownOptionsManager(false)}
              />
            )}
            {activeSection === 'personnel' && (
              <PersonnelSection
                personnel={visiblePersonnel}
                columns={personnelColumns}
                total={personnelForMonth.length}
                moduleTemplatePath={activeModule?.template_path}
                onExportTemplate={(recordIds) => exportModuleTemplate('personnel', recordIds)}
                  selectionResetKey={personnelImportSelectionRevision}
                search={search}
                onSearch={setSearch}
                onImport={importFile}
                busy={busy}
                isLocked={periodIsReadOnly}
              />
            )}
            {activeSection === 'salaries' && !customModuleId && (
              <PayrollSection
                monthKey={monthKey}
                personnel={personnelForMonth}
                salaries={salariesForMonth}
                moduleTemplatePath={activeModule?.template_path}
                onExportTemplate={(recordIds) => exportModuleTemplate('salaries', recordIds)}
                onSaveSalary={saveSalary}
                isLocked={periodIsReadOnly}
              />
            )}
            {activeSection === 'invoices' && !customModuleId && (
              <InvoicesSection
                monthKey={monthKey}
                invoices={monthData?.invoices || []}
                onSaveInvoice={saveInvoice}
                invoiceTemplates={dropdownOptionsByGroup.invoice_template || []}
                isLocked={periodIsReadOnly}
              />
            )}
            {activeSection === 'penalties' && !customModuleId && !activeSubmoduleId && (
              <PenaltiesWorkspace
                monthKey={monthKey}
                personnel={personnelForMonth}
                penalties={monthData?.penalties || []}
                actionTypes={actionTypesByModule.penalties || []}
                templatePath={penaltyTemplatePath}
                textTemplates={textTemplates}
                onAddTextTemplate={createTextTemplate}
                submodules={activeModule?.submodules.filter((submodule) => submodule.is_active !== 0) || []}
                onSavePenalty={savePenalty}
                onSelectTemplate={selectPenaltyTemplate}
                onExportPenalty={exportPenaltyWord}
                modules={modules}
                onCreateRecordFromPenalty={createRecordFromPenalty}
                onManageSections={openSectionManager}
                onOpenSubmodule={(submoduleId) => navigate('penalties', submoduleId)}
                onShowPenalties={() => navigate('penalties')}
                isLocked={periodIsReadOnly}
              />
            )}
            {activeModule && (customModuleId || (!['home', 'personnel', 'salaries', 'invoices'].includes(activeSection) && (activeSection !== 'penalties' || Boolean(activeSubmoduleId)))) && (
              <ModuleView
                module={activeModule}
                monthKey={monthKey}
                actionTypes={actionTypesByModule[activeModule?.id] || []}
                personnel={personnelForMonth}
                customSections={monthData?.customSections || []}
                penalties={monthData?.penalties || []}
                initialPenaltyRecord={pendingPenaltyRecord?.moduleId === activeModule.id
                  && pendingPenaltyRecord?.submoduleId === activeSubmoduleId
                  ? pendingPenaltyRecord
                  : null}
                onConsumeInitialPenaltyRecord={() => setPendingPenaltyRecord(null)}
                activeSubmodule={activeSubmodule}
                records={visibleSubmoduleRecords}
                totalRecords={submoduleRecords.length}
                search={search}
                onSearch={setSearch}
                onNavigate={navigate}
                onCreateSubmodule={createSubmodule}
                onAddRecord={addSubmoduleRecord}
                onUpdateRecord={updateSubmoduleRecord}
                onDeleteRecord={deleteSubmoduleRecord}
                onListSavedFieldValues={(submoduleId, fieldKey, query) => (
                  window.financeApp.listSavedFieldValues(submoduleId, fieldKey, query)
                )}
                textTemplates={textTemplates}
                onAddTextTemplate={createTextTemplate}
                onChooseTemplate={chooseTemplate}
                onRenderTemplate={renderTemplate}
                personnelColumns={personnelColumns}
                isLocked={periodIsReadOnly}
              />
            )}
          </main>
          {personnelImportPreview && (
            <PersonnelImportDialog
              preview={personnelImportPreview}
              onImport={commitPersonnelImport}
              onClose={closePersonnelImportPreview}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function InvoicesSection({ monthKey, invoices, onSaveInvoice, invoiceTemplates, isLocked }) {
  const [companies, setCompanies] = useState([]);
  const [companyCode, setCompanyCode] = useState('');
  const [useCustomSupplier, setUseCustomSupplier] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [documentType, setDocumentType] = useState('invoice');
  const [items, setItems] = useState([{ key: 1, productCode: '', unitPrice: '', quantity: '1' }]);
  const [headerFields, setHeaderFields] = useState([]);
  const [layout, setLayout] = useState([]);
  const [templateId, setTemplateId] = useState('classic');
  const [customFieldLabel, setCustomFieldLabel] = useState('');
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm());
  const [productForm, setProductForm] = useState({ description: '', unit: 'قطعة', unitPrice: '' });
  const [companyBusy, setCompanyBusy] = useState(false);
  const [printingInvoices, setPrintingInvoices] = useState([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useToastErrorState();
  const nextRowKey = useMemo(() => Math.max(0, ...items.map((item) => item.key)) + 1, [items]);
  const monthEndDay = monthKey
    ? String(new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate()).padStart(2, '0')
    : '';

  useEffect(() => {
    if (invoiceTemplates.length && !invoiceTemplates.some((option) => option.value === templateId)) {
      setTemplateId(invoiceTemplates[0].value);
    }
  }, [invoiceTemplates, templateId]);

  useEffect(() => {
    let active = true;
    window.financeApp.listInvoiceCompanies()
      .then((loadedCompanies) => {
        if (!active) return;
        setCompanies(loadedCompanies);
        setCompanyCode(loadedCompanies[0]?.code || '');
        setHeaderFields(defaultInvoiceHeaderFields(loadedCompanies[0], invoiceNumber, invoiceDate));
        setLayout(defaultInvoiceHeaderFields(loadedCompanies[0], invoiceNumber, invoiceDate)
          .map((field) => ({ type: 'field', id: field.id })));
        setItems((current) => current.map((item) => ({
          ...item,
          productCode: item.productCode || loadedCompanies[0]?.products[0]?.code || '',
          unitPrice: item.unitPrice || String(loadedCompanies[0]?.products[0]?.unit_price ?? '')
        })));
      })
      .catch((requestError) => {
        if (active) setError(`تعذر تحميل قائمة الشركات والأصناف: ${requestError.message}`);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setInvoiceDate(monthKey ? `${monthKey}-01` : '');
    setHeaderFields((current) => current.map((field) => (
      field.id === 'invoiceDate' ? { ...field, value: monthKey ? `${monthKey}-01` : '' } : field
    )));
  }, [monthKey]);

  const selectedCompany = companies.find((company) => company.code === companyCode);
  useEffect(() => {
    const displayedSupplier = useCustomSupplier ? supplierName : selectedCompany?.name || '';
    setHeaderFields((current) => current.map((field) => (
      field.id === 'companyName' ? { ...field, value: displayedSupplier } : field
    )));
  }, [selectedCompany?.name, supplierName, useCustomSupplier]);

  const productFor = (code) => selectedCompany?.products.find((product) => product.code === code);
  const subtotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    return sum + (Number.isFinite(unitPrice) && unitPrice >= 0 && Number.isFinite(quantity) && quantity > 0
      ? Math.round((unitPrice * quantity + Number.EPSILON) * 100) / 100
      : 0);
  }, 0);
  const vatAmount = Math.round((subtotal * 0.14 + Number.EPSILON) * 100) / 100;
  const grandTotal = Math.round((subtotal + vatAmount + Number.EPSILON) * 100) / 100;

  function updateItem(key, field, value) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, [field]: value } : item));
  }

  function changeItemProduct(key, productCode) {
    const product = productFor(productCode);
    setItems((current) => current.map((item) => item.key === key
      ? { ...item, productCode, unitPrice: String(product?.unit_price ?? '') }
      : item));
  }

  function changeCompany(value) {
    setCompanyCode(value);
    const company = companies.find((entry) => entry.code === value);
    const firstProduct = company?.products[0]?.code || '';
    setItems((current) => current.map((item) => ({
      ...item,
      productCode: firstProduct,
      unitPrice: String(company?.products[0]?.unit_price ?? '')
    })));
    setHeaderFields((current) => {
      const standard = defaultInvoiceHeaderFields(company, invoiceNumber, invoiceDate);
      return standard.map((field) => {
        const existing = current.find((entry) => entry.id === field.id);
        return {
          ...field,
          value: ['invoiceNumber', 'invoiceDate'].includes(field.id)
            ? existing?.value || field.value
            : field.value
        };
      }).concat(current.filter((field) => field.custom));
    });
  }

  function updateHeaderField(id, property, value) {
    setHeaderFields((current) => current.map((field) => field.id === id ? { ...field, [property]: value } : field));
  }

  function addHeaderField() {
    const label = customFieldLabel.trim();
    if (!label) {
      setError('اكتب عنوان الحقل المخصص أولاً.');
      return;
    }
    if (headerFields.length >= 30) {
      setError('الحد الأقصى هو 30 حقلاً في ترويسة الفاتورة.');
      return;
    }
    const id = `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setHeaderFields((current) => [...current, { id, label, value: '', custom: true }]);
    setLayout((current) => [...current, { type: 'field', id }]);
    setCustomFieldLabel('');
    setError('');
  }

  function addDivider() {
    setLayout((current) => [...current, {
      type: 'divider',
      id: `divider-${Date.now()}-${Math.random().toString(16).slice(2)}`
    }]);
  }

  function moveLayoutBlock(index, offset) {
    setLayout((current) => {
      const destination = index + offset;
      if (destination < 0 || destination >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
      return reordered;
    });
  }

  function removeLayoutBlock(block) {
    setLayout((current) => current.filter((entry) => entry.id !== block.id));
    if (block.type === 'field') setHeaderFields((current) => current.filter((field) => field.id !== block.id));
  }

  async function submitInvoice(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSaveInvoice({
        invoiceNumber,
        documentType,
        companyCode,
        supplierName: useCustomSupplier ? supplierName : '',
        invoiceDate,
        headerFields,
        layout,
        templateId,
        items: items.map((item) => ({
          productCode: item.productCode,
          unitPrice: Number(item.unitPrice),
          quantity: Number(item.quantity)
        }))
      });
      setInvoiceNumber('');
      setSupplierName('');
      setUseCustomSupplier(false);
      setItems([{
        key: nextRowKey + 1,
        productCode: selectedCompany?.products[0]?.code || '',
        unitPrice: String(selectedCompany?.products[0]?.unit_price ?? ''),
        quantity: '1'
      }]);
      const resetFields = defaultInvoiceHeaderFields(selectedCompany, '', invoiceDate);
      setHeaderFields(resetFields);
      setLayout(resetFields.map((field) => ({ type: 'field', id: field.id })));
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ الفاتورة.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCompany(event) {
    event.preventDefault();
    setCompanyBusy(true);
    setError('');
    try {
      const company = await window.financeApp.addInvoiceCompany(companyForm);
      setCompanies((current) => [...current, company]);
      setCompanyCode(company.code);
      setCompanyForm(emptyCompanyForm());
      setItems((current) => current.map((item) => ({
        ...item,
        productCode: company.products[0]?.code || '',
        unitPrice: String(company.products[0]?.unit_price ?? '')
      })));
      setHeaderFields(defaultInvoiceHeaderFields(company, invoiceNumber, invoiceDate));
      setLayout(defaultInvoiceHeaderFields(company, invoiceNumber, invoiceDate)
        .map((field) => ({ type: 'field', id: field.id })));
      setError('');
      notifyToast('تم حفظ بيانات الشركة.', 'success');
    } catch (saveError) {
      setError(`تعذر حفظ الشركة: ${saveError.message}`);
      notifyToast(`تعذر حفظ الشركة: ${saveError.message}`, 'danger');
    } finally {
      setCompanyBusy(false);
    }
  }

  function selectCompanyToManage(company) {
    setCompanyCode(company.code);
    setCompanyForm({
      code: company.code,
      name: company.name,
      category: company.category,
      commercialRegister: company.commercial_register || '',
      taxCard: company.tax_card || '',
      address: company.address || '',
      phone: company.phone || ''
    });
    changeCompany(company.code);
  }

  async function saveCompanyChanges(event) {
    event.preventDefault();
    setCompanyBusy(true);
    setError('');
    try {
      const company = await window.financeApp.updateInvoiceCompany(companyForm);
      setCompanies((current) => current.map((entry) => entry.code === company.code ? company : entry));
      setCompanyForm(emptyCompanyForm());
      setCompanyCode(company.code);
      setHeaderFields((current) => defaultInvoiceHeaderFields(company, invoiceNumber, invoiceDate)
        .map((field) => ({ ...field, value: ['invoiceNumber', 'invoiceDate'].includes(field.id)
          ? current.find((entry) => entry.id === field.id)?.value || field.value
          : field.value
        })).concat(current.filter((field) => field.custom)));
      notifyToast('تم تحديث بيانات الشركة.', 'success');
    } catch (saveError) {
      setError(`تعذر تحديث بيانات الشركة: ${saveError.message}`);
      notifyToast(`تعذر تحديث بيانات الشركة: ${saveError.message}`, 'danger');
    } finally {
      setCompanyBusy(false);
    }
  }

  async function addCompanyProduct(event) {
    event.preventDefault();
    setCompanyBusy(true);
    setError('');
    try {
      const company = await window.financeApp.addInvoiceProduct({
        companyCode,
        description: productForm.description,
        unit: productForm.unit,
        unitPrice: Number(productForm.unitPrice)
      });
      setCompanies((current) => current.map((entry) => entry.code === company.code ? company : entry));
      setProductForm({ description: '', unit: 'قطعة', unitPrice: '' });
      setError('');
      notifyToast('تمت إضافة الصنف للشركة.', 'success');
    } catch (saveError) {
      setError(`تعذر إضافة الصنف: ${saveError.message}`);
      notifyToast(`تعذر إضافة الصنف: ${saveError.message}`, 'danger');
    } finally {
      setCompanyBusy(false);
    }
  }

  async function printInvoices(invoicesToPrint) {
    setPrintingInvoices(invoicesToPrint);
    document.body.classList.add('print-invoice-only');
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const result = await window.financeApp.exportPdf();
      if (!result.canceled) notifyToast(`تم إرسال ${formatNumber(invoicesToPrint.length)} مستند إلى الطباعة في ملف واحد، بنسخة واحدة لكل مستند.`, 'success');
    } catch (printError) {
      setError(`تعذر طباعة الفاتورة: ${printError.message}`);
      notifyToast(`تعذر طباعة الفاتورة: ${printError.message}`, 'danger');
    } finally {
      document.body.classList.remove('print-invoice-only');
      setPrintingInvoices([]);
    }
  }

  async function printInvoice(invoice) {
    await printInvoices([invoice]);
  }

  const selectedInvoices = invoices.filter((invoice) => selectedInvoiceIds.has(String(invoice.id)));

  async function exportInvoiceDocx(invoice) {
    const documentName = invoice.document_type === 'quotation' ? 'بيان الأسعار' : 'الفاتورة';
    try {
      const result = await window.financeApp.exportInvoiceDocx(invoice.id);
      if (!result.canceled) notifyToast(`تم تصدير ${documentName} ${invoice.invoice_number} إلى Word.`, 'success');
    } catch (exportError) {
      setError(`تعذر تصدير ${documentName} إلى Word: ${exportError.message}`);
      notifyToast(`تعذر تصدير ${documentName} إلى Word: ${exportError.message}`, 'danger');
    }
  }

  const money = (value) => formatMoney(Number(value || 0));

  return (
    <div className="space-y-5">
      {isLocked && (
        <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          الفترة غير نشطة أو مقفلة؛ عرض الفواتير متاح للقراءة فقط.
        </div>
      )}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>}

      <details className="panel" open>
        <summary className="cursor-pointer text-lg font-bold">إدارة الشركات الخاصة والمنتجات</summary>
        <p className="mb-4 mt-2 text-xs text-slate-500">الكتالوج المجهز تجريبي، ويمكن إضافة شركاتك وأصنافها وأسعارها محلياً.</p>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={companyForm.code ? saveCompanyChanges : saveCompany}>
          <label className="flex flex-col gap-1"><span className="text-xs font-semibold">اسم الشركة</span><input className="field" required maxLength={120} value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-semibold">التخصص</span><input className="field" maxLength={80} value={companyForm.category} onChange={(event) => setCompanyForm({ ...companyForm, category: event.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-semibold">السجل التجاري</span><input className="field" maxLength={200} value={companyForm.commercialRegister} onChange={(event) => setCompanyForm({ ...companyForm, commercialRegister: event.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-semibold">البطاقة الضريبية</span><input className="field" maxLength={200} value={companyForm.taxCard} onChange={(event) => setCompanyForm({ ...companyForm, taxCard: event.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-semibold">العنوان</span><input className="field" maxLength={200} value={companyForm.address} onChange={(event) => setCompanyForm({ ...companyForm, address: event.target.value })} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs font-semibold">رقم الهاتف</span><input className="field" maxLength={200} value={companyForm.phone} onChange={(event) => setCompanyForm({ ...companyForm, phone: event.target.value })} /></label>
          <div className="flex items-end gap-2">
            <button className="button button-primary" type="submit" disabled={companyBusy}>{companyBusy ? 'جارٍ الحفظ...' : companyForm.code ? 'حفظ تعديلات الشركة' : 'إضافة شركة جديدة'}</button>
            {companyForm.code && <button className="button button-outline" type="button" onClick={() => setCompanyForm(emptyCompanyForm())}>إلغاء</button>}
          </div>
          <label className="flex flex-col gap-1"><span className="text-xs font-semibold">إدارة شركة / إضافة صنف إليها</span>
            <select className="field" value={companies.some((company) => company.is_custom && company.code === companyCode) ? companyCode : ''} onChange={(event) => {
              const company = companies.find((entry) => entry.code === event.target.value);
              if (company?.is_custom) selectCompanyToManage(company);
              else changeCompany(event.target.value);
            }}>
              {companies.filter((company) => company.is_custom).map((company) => <option value={company.code} key={company.code}>{company.name}</option>)}
              <option value="">اختر شركة خاصة</option>
              {!companies.some((company) => company.is_custom) && <option value="" disabled>لا توجد شركات خاصة بعد</option>}
            </select>
          </label>
        </form>
        {selectedCompany?.is_custom === 1 && (
          <form className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4" onSubmit={addCompanyProduct}>
            <label className="flex flex-col gap-1"><span className="text-xs font-semibold">اسم الصنف</span><input className="field" required maxLength={200} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className="text-xs font-semibold">الوحدة</span><input className="field" required maxLength={40} value={productForm.unit} onChange={(event) => setProductForm({ ...productForm, unit: event.target.value })} /></label>
            <label className="flex flex-col gap-1"><span className="text-xs font-semibold">سعر الوحدة</span><input className="field" type="number" min="0" step="0.01" required value={productForm.unitPrice} onChange={(event) => setProductForm({ ...productForm, unitPrice: event.target.value })} /></label>
            <button className="button button-outline self-end" type="submit" disabled={companyBusy}>إضافة الصنف إلى الشركة</button>
          </form>
        )}
      </details>

      <form className="panel space-y-5" onSubmit={submitInvoice}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">إنشاء فاتورة أو بيان أسعار</h3>
            <p className="mt-1 text-xs text-slate-500">اختر نوع المستند، ويُحتسب VAT 14% تلقائياً. الكتالوج يتضمن شركات وأصنافاً قابلة للتعديل.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">VAT 14%</span>
        </div>

        {loading ? (
          <p role="status" className="text-sm text-slate-600">جارٍ تحميل الشركات والأصناف...</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-700">نوع المستند</span>
                <select className="field" value={documentType} onChange={(event) => setDocumentType(event.target.value)} disabled={isLocked || saving}>
                  <option value="invoice">فاتورة إلكترونية</option>
                  <option value="quotation">بيان أسعار</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-700">رقم الفاتورة</span>
                <input className="field" required maxLength={50} value={invoiceNumber} onChange={(event) => {
                  setInvoiceNumber(event.target.value);
                  updateHeaderField('invoiceNumber', 'value', event.target.value);
                }} placeholder="مثال: INV-2026-001" disabled={isLocked || saving} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-700">كتالوج الأصناف والأسعار</span>
                <select className="field" required value={companyCode} onChange={(event) => changeCompany(event.target.value)} disabled={isLocked || saving || !companies.length}>
                  {companies.map((company) => <option key={company.code} value={company.code}>{company.name} — {company.category}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-700">تاريخ الفاتورة</span>
                <input className="field" type="date" required value={invoiceDate} onChange={(event) => {
                  setInvoiceDate(event.target.value);
                  updateHeaderField('invoiceDate', 'value', event.target.value);
                }} min={monthKey ? `${monthKey}-01` : undefined} max={monthKey ? `${monthKey}-${monthEndDay}` : undefined} disabled={isLocked || saving} />
              </label>
            </div>
            <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[auto_1fr] md:items-end">
              <label className="flex items-center gap-2 pb-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={useCustomSupplier} onChange={(event) => {
                  setUseCustomSupplier(event.target.checked);
                  if (event.target.checked) setSupplierName('');
                }} disabled={isLocked || saving} />
                مورد مختلف لهذه الفاتورة
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-700">اسم الشركة / المورد الظاهر بالفاتورة</span>
                <input
                  className="field"
                  value={useCustomSupplier ? supplierName : selectedCompany?.name || ''}
                  onChange={(event) => {
                    setSupplierName(event.target.value);
                    updateHeaderField('companyName', 'value', event.target.value);
                  }}
                  placeholder="اكتب اسم مورد غير مسجل"
                  maxLength={120}
                  required={useCustomSupplier}
                  disabled={isLocked || saving || !useCustomSupplier}
                />
              </label>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold">بيانات الترويسة وترتيبها</h4>
                  <p className="mt-1 text-xs text-slate-500">أعد ترتيب الحقول والفواصل بأزرار التحريك؛ لن يظهر شعار أو نص تابع للفوج في الفاتورة.</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold">
                  تصميم الفاتورة
                  <select className="field !w-auto min-w-48" value={templateId} onChange={(event) => setTemplateId(event.target.value)} disabled={saving}>
                    {invoiceTemplates.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {headerFields.map((field) => (
                  <label className="flex flex-col gap-1" key={field.id}>
                    <span className="text-xs font-semibold">{field.custom ? field.label : field.label}</span>
                    <input className="field" value={field.value} onChange={(event) => updateHeaderField(field.id, 'value', event.target.value)} maxLength={500} disabled={saving} />
                  </label>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                <input className="field !w-auto min-w-48 flex-1" value={customFieldLabel} maxLength={80} onChange={(event) => setCustomFieldLabel(event.target.value)} placeholder="اسم حقل مخصص جديد" />
                <button className="button button-outline" type="button" onClick={addHeaderField} disabled={saving}>＋ إضافة حقل</button>
                <button className="button button-outline" type="button" onClick={addDivider} disabled={saving}>― إدراج فاصل</button>
              </div>
              <ol className="space-y-2">
                {layout.map((block, index) => {
                  const field = headerFields.find((entry) => entry.id === block.id);
                  return (
                    <li className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" key={block.id}>
                      <span className="min-w-0 flex-1 truncate">{block.type === 'divider' ? '──────── فاصل ────────' : `${field?.label || 'حقل'}: ${field?.value || '—'}`}</span>
                      <button className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40" type="button" onClick={() => moveLayoutBlock(index, -1)} disabled={index === 0} aria-label="تحريك لأعلى">↑</button>
                      <button className="rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40" type="button" onClick={() => moveLayoutBlock(index, 1)} disabled={index === layout.length - 1} aria-label="تحريك لأسفل">↓</button>
                      <button className="rounded px-2 py-1 text-rose-700 hover:bg-rose-50" type="button" onClick={() => removeLayoutBlock(block)}>حذف</button>
                    </li>
                  );
                })}
              </ol>
            </section>

            <div className="data-table-scroll">
              <table className="data-table min-w-[800px]">
                <thead className="bg-slate-100 text-xs font-bold text-slate-700">
                  <tr>
                    <th className="px-3 py-3">م / مسلسل</th>
                    <th className="px-3 py-3">كود الصنف</th>
                    <th className="px-3 py-3">الصنف / البيان</th>
                    <th className="px-3 py-3">سعر الوحدة</th>
                    <th className="px-3 py-3">الكمية</th>
                    <th className="px-3 py-3">الإجمالي</th>
                    <th className="px-3 py-3"><span className="sr-only">حذف</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const product = productFor(item.productCode);
                    const unitPrice = Number(item.unitPrice);
                    const lineTotal = Number.isFinite(unitPrice) && unitPrice >= 0
                      ? Math.round((unitPrice * Number(item.quantity || 0) + Number.EPSILON) * 100) / 100
                      : 0;
                    return (
                      <tr className="border-t border-slate-100" key={item.key}>
                        <td className="px-3 py-2">{formatNumber(index + 1)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{product?.code || '—'}</td>
                        <td className="px-3 py-2">
                          <select className="field min-w-56" required value={item.productCode} onChange={(event) => changeItemProduct(item.key, event.target.value)} disabled={isLocked || saving}>
                            {(selectedCompany?.products || []).map((option) => <option key={option.code} value={option.code}>{option.description} ({option.unit})</option>)}
                          </select>
                        </td>
                        <td className="w-40 px-3 py-2">
                          <input className="field !px-2 !py-2" type="number" min="0" step="0.01" required value={item.unitPrice} onChange={(event) => updateItem(item.key, 'unitPrice', event.target.value)} disabled={isLocked || saving} aria-label={`سعر الوحدة للصنف ${index + 1}`} />
                        </td>
                        <td className="w-32 px-3 py-2">
                          <input className="field !px-2 !py-2" type="number" min="0.01" step="0.01" required value={item.quantity} onChange={(event) => updateItem(item.key, 'quantity', event.target.value)} disabled={isLocked || saving} aria-label={`كمية الصنف ${index + 1}`} />
                        </td>
                        <td className="px-3 py-2 font-bold whitespace-nowrap">{money(lineTotal)}</td>
                        <td className="px-3 py-2">
                          <button className="rounded-lg px-2 py-1 text-rose-700 hover:bg-rose-50 disabled:opacity-40" type="button" onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))} disabled={isLocked || saving || items.length === 1} aria-label={`حذف الصنف ${index + 1}`}>×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button className="button button-outline" type="button" onClick={() => setItems((current) => [...current, {
                key: nextRowKey,
                productCode: selectedCompany?.products[0]?.code || '',
                unitPrice: String(selectedCompany?.products[0]?.unit_price ?? ''),
                quantity: '1'
              }])} disabled={isLocked || saving}>＋ إضافة صنف</button>
              <div className="w-full max-w-sm space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between gap-4"><span className="text-slate-600">المجموع قبل الضريبة</span><strong>{money(subtotal)}</strong></div>
                <div className="flex justify-between gap-4"><span className="text-slate-600">ضريبة القيمة المضافة (14%)</span><strong>{money(vatAmount)}</strong></div>
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base"><span className="font-bold">الإجمالي النهائي</span><strong className="text-indigo-700">{money(grandTotal)}</strong></div>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="button button-primary" type="submit" disabled={isLocked || saving || loading || !monthKey || !companies.length || items.length === 0}>
                {saving ? 'جارٍ حفظ الفاتورة...' : 'حفظ الفاتورة'}
              </button>
            </div>
          </>
        )}
      </form>

      <section className="panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">مستندات الفترة</h3>
            <p className="mt-1 text-xs text-slate-500">{formatNumber(invoices.length)} مستند مسجل</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="small" onClick={() => setSelectedInvoiceIds(new Set(invoices.map((invoice) => String(invoice.id))))} disabled={!invoices.length}>
              تحديد الفواتير
            </Button>
            <Button type="button" variant="outline" size="small" onClick={() => printInvoices(selectedInvoices)} disabled={!selectedInvoices.length}>
              طباعة المحدد (نسخة لكل مستند) — {formatNumber(selectedInvoices.length)}
            </Button>
            <Button type="button" variant="ghost" size="small" onClick={() => setSelectedInvoiceIds(new Set())} disabled={!selectedInvoices.length}>
              إلغاء التحديد
            </Button>
          </div>
        </div>
        {invoices.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">لا توجد فواتير مسجلة لهذه الفترة.</p>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div className="rounded-xl border border-slate-200 p-4" key={invoice.id}>
                <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Checkbox
                    checked={selectedInvoiceIds.has(String(invoice.id))}
                    onChange={() => setSelectedInvoiceIds((current) => {
                      const next = new Set(current);
                      const key = String(invoice.id);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })}
                    aria-label={`تحديد ${invoice.document_type === 'quotation' ? 'بيان الأسعار' : 'الفاتورة'} ${invoice.invoice_number}`}
                  />
                  تحديد المستند
                </label>
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 font-semibold">
                    <span>{invoice.document_type === 'quotation' ? 'بيان أسعار' : 'فاتورة إلكترونية'} — {invoice.invoice_number} — {invoice.company?.name || invoice.company_name} — {invoice.invoice_date}</span>
                    <span className="text-indigo-700">{money(invoice.grand_total)}</span>
                  </summary>
                  <div className="no-print mt-3 flex flex-wrap justify-end gap-2">
                    <button className="button button-outline !min-h-11 !py-1.5" type="button" onClick={() => printInvoice(invoice)}>طباعة / حفظ PDF</button>
                    <button className="button button-outline !min-h-11 !py-1.5" type="button" onClick={() => exportInvoiceDocx(invoice)}>تصدير Word</button>
                  </div>
                  <div className="data-table-scroll mt-4">
                    <table className="data-table min-w-[620px]">
                      <thead className="bg-slate-50 font-bold"><tr><th className="p-2">م</th><th className="p-2">كود الصنف</th><th className="p-2">البيان</th><th className="p-2">سعر الوحدة</th><th className="p-2">الكمية</th><th className="p-2">الإجمالي</th></tr></thead>
                      <tbody>{invoice.items.map((item) => <tr className="border-t border-slate-100" key={item.id}><td className="p-2">{formatNumber(item.serial)}</td><td className="p-2 font-mono">{item.product_code}</td><td className="p-2">{item.description}</td><td className="p-2">{money(item.unit_price)}</td><td className="p-2">{formatNumber(item.quantity)}</td><td className="p-2 font-semibold">{money(item.total)}</td></tr>)}</tbody>
                    </table>
                    <div className="mt-3 flex justify-end"><div className="space-y-1 text-xs"><p>قبل الضريبة: {money(invoice.subtotal)}</p><p>ضريبة 14%: {money(invoice.vat_amount)}</p><p className="font-bold">الإجمالي: {money(invoice.grand_total)}</p></div></div>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>
      {printingInvoices.length > 0 && createPortal(
        <>{printingInvoices.map((invoice) => <InvoicePrintSheet invoice={invoice} key={invoice.id} />)}</>,
        document.body
      )}
    </div>
  );
}

function emptyCompanyForm() {
  return { code: '', name: '', category: '', commercialRegister: '', taxCard: '', address: '', phone: '' };
}

function defaultInvoiceHeaderFields(company, invoiceNumber, invoiceDate) {
  return [
    { id: 'companyName', label: 'اسم الشركة', value: company?.name || '' },
    { id: 'commercialRegister', label: 'السجل التجاري', value: company?.commercial_register || '' },
    { id: 'taxCard', label: 'البطاقة الضريبية', value: company?.tax_card || '' },
    { id: 'address', label: 'العنوان', value: company?.address || '' },
    { id: 'phone', label: 'رقم الهاتف', value: company?.phone || '' },
    { id: 'invoiceNumber', label: 'رقم الفاتورة', value: invoiceNumber || '' },
    { id: 'invoiceDate', label: 'التاريخ', value: invoiceDate || '' }
  ];
}

function InvoicePrintSheet({ invoice }) {
  const design = `invoice-design-${invoice.template_id || 'classic'}`;
  const fields = new Map((invoice.headerFields || []).map((field) => [field.id, field]));
  const layout = invoice.layout?.length
    ? invoice.layout
    : [...fields.keys()].map((id) => ({ type: 'field', id }));
  const money = (value) => formatMoney(Number(value || 0));
  return (
    <article className={`invoice-print-sheet ${design}`} dir="rtl">
      <h1>{invoice.document_type === 'quotation' ? 'بيان أسعار' : 'فاتورة إلكترونية'}</h1>
      <div className="invoice-print-header">
        {layout.map((block) => {
          if (block.type === 'divider') return <hr key={block.id} />;
          const field = fields.get(block.id);
          return field ? <p key={block.id}><strong>{field.label}:</strong> {field.value || '—'}</p> : null;
        })}
      </div>
      <table>
        <thead><tr><th>م / مسلسل</th><th>كود الصنف</th><th>الصنف / البيان</th><th>الوحدة</th><th>سعر الوحدة</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id}>
              <td>{formatNumber(item.serial)}</td>
              <td>{item.product_code}</td>
              <td>{item.description}</td>
              <td>{item.unit}</td>
              <td>{money(item.unit_price)}</td>
              <td>{item.quantity}</td>
              <td>{money(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="invoice-print-totals">
        <p><span>المجموع قبل الضريبة</span><strong>{money(invoice.subtotal)}</strong></p>
        <p><span>ضريبة القيمة المضافة ({formatNumber(invoice.vat_rate * 100)}%)</span><strong>{money(invoice.vat_amount)}</strong></p>
        <p className="invoice-grand-total"><span>الإجمالي النهائي</span><strong>{money(invoice.grand_total)}</strong></p>
      </div>
    </article>
  );
}

function Dashboard({
  modules,
  documentTemplates,
  monthData,
  selectedArchive,
  isLocked,
  isReadOnly,
  onImport,
  busy,
  onCreateModule,
  onViewArchive,
  onCopyArchive,
  onExportReport,
  onPrintReportRows,
  exportingPdf,
  onExportPersonnelWord,
  onChooseModuleTemplate,
  onExportModuleTemplate,
  period,
  periodLoading,
  periodLoadError,
  onRetryPeriod,
  onMonthChange,
  activePeriodKey,
  onActivatePeriod,
  onSaveRange,
  archives,
  onSaveArchive,
  closingPeriod,
  onUnlockPeriod,
  unlockingPeriod,
  viewedArchive,
  archiveAudit,
  archiveRevisions,
  onSelectArchiveRevision,
  onCloseArchive,
  recordArchives,
  onArchiveRecords,
  onRestoreRecord,
  onExportSmartDocument,
  onManageTextTemplates,
  onManageDocumentTemplates,
  onManageSections,
  onManageDropdownOptions,
  onManageSettings,
  sectionPresets,
  monthKey
}) {
  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">لوحة المتابعة · {formatMonth(monthKey)}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">مركز التقارير والأرشيف</h2>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${isReadOnly ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {isLocked ? 'الفترة مقفلة · قراءة فقط' : isReadOnly ? 'فترة غير نشطة · قراءة فقط' : 'الفترة النشطة مفتوحة للعمل'}
        </span>
      </section>

      <MonthlyControls
        monthKey={monthKey}
        period={period}
        periodLoading={periodLoading}
        periodLoadError={periodLoadError}
        onRetryPeriod={onRetryPeriod}
        onMonthChange={onMonthChange}
        activePeriodKey={activePeriodKey}
        onActivatePeriod={onActivatePeriod}
        onSaveRange={onSaveRange}
        archives={archives}
        archive={selectedArchive}
        onSaveArchive={onSaveArchive}
        closingPeriod={closingPeriod}
        onUnlockPeriod={onUnlockPeriod}
        unlockingPeriod={unlockingPeriod}
        onCopyArchive={onCopyArchive}
        onViewArchive={onViewArchive}
        onExportReport={onExportReport}
      />
      {viewedArchive && (
        <ArchiveSnapshot
          archive={viewedArchive}
          audit={archiveAudit}
          revisions={archiveRevisions}
          onSelectRevision={onSelectArchiveRevision}
          onClose={onCloseArchive}
        />
      )}
      <ReportCenter
        modules={modules}
        monthKey={monthKey}
        monthData={monthData}
        archives={recordArchives}
        isReadOnly={isReadOnly}
        onArchiveRecords={onArchiveRecords}
        onRestoreRecord={onRestoreRecord}
        onSelectModuleTemplate={onChooseModuleTemplate}
        onExportModuleTemplate={onExportModuleTemplate}
        documentTemplates={documentTemplates}
        onExportSmartDocument={onExportSmartDocument}
        onExportPersonnelWord={onExportPersonnelWord}
        onPrintReport={onPrintReportRows}
        exportingPdf={exportingPdf}
      />

      <section className="panel !p-4">
        <div className="mb-3">
          <h2 className="font-bold text-slate-900">إدارة النظام</h2>
          <p className="mt-1 text-xs text-slate-500">اختصارات الإعداد والإدارة؛ استعراض التقارير والأرشيف متاحان أعلاه فقط.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button button-primary !px-3 !py-2 text-xs" onClick={onImport} disabled={busy || isReadOnly}>
            {busy ? 'جارٍ الاستيراد...' : 'استيراد كشف الأفراد'}
          </button>
          <button className="button button-outline !px-3 !py-2 text-xs" onClick={onManageSections}>إدارة الأقسام</button>
          <button className="button button-outline !px-3 !py-2 text-xs" onClick={onManageDocumentTemplates}>محرر قوالب المستندات</button>
          <button className="button button-outline !px-3 !py-2 text-xs" onClick={onManageTextTemplates}>مكتبة النصوص الجاهزة</button>
          <button className="button button-outline !px-3 !py-2 text-xs" onClick={onManageDropdownOptions}>إدارة القوائم المنسدلة</button>
          <button className="button button-outline !px-3 !py-2 text-xs" onClick={onManageSettings}>إعدادات النظام</button>
        </div>
      </section>

      <section className="panel !p-4">
        <div className="mb-3">
          <h2 className="font-bold text-slate-900">إضافة قسم رئيسي</h2>
          <p className="mt-1 text-xs text-slate-500">أنشئ أقساماً إضافية، أو خصص النماذج الفرعية من إدارة الأقسام.</p>
        </div>
        <CreateModuleCard onCreateModule={onCreateModule} presets={sectionPresets} />
      </section>
    </div>
  );
}

function MonthlyControls({
  monthKey,
  period,
  periodLoading,
  periodLoadError,
  onRetryPeriod,
  onMonthChange,
  activePeriodKey,
  onActivatePeriod,
  onSaveRange,
  archives,
  archive,
  onSaveArchive,
  closingPeriod,
  onUnlockPeriod,
  unlockingPeriod,
  onCopyArchive,
  onViewArchive,
  onExportReport
}) {
  const [startDate, setStartDate] = useState(period?.start_date || '');
  const [endDate, setEndDate] = useState(period?.end_date || '');
  const [savingRange, setSavingRange] = useState(false);
  const periodLoaded = period?.month_key === monthKey;
  const isLocked = period?.is_locked === 1;
  const isActive = Boolean(monthKey && monthKey === activePeriodKey);
  const isRangeDirty = startDate !== period?.start_date || endDate !== period?.end_date;

  useEffect(() => {
    setStartDate(period?.start_date || '');
    setEndDate(period?.end_date || '');
  }, [period?.month_key, period?.start_date, period?.end_date]);

  async function saveRange() {
    setSavingRange(true);
    try {
      await onSaveRange(startDate, endDate);
    } finally {
      setSavingRange(false);
    }
  }

  return (
    <section className="panel mb-6 space-y-5 !p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-500">التقارير والفترات المالية</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{monthKey ? formatMonth(monthKey) : 'جارٍ التحميل...'}</h2>
          <p className={`mt-1 text-xs font-bold ${isActive ? 'text-emerald-700' : 'text-amber-700'}`}>
            {isActive ? 'الفترة المالية النشطة' : `الفترة النشطة حالياً: ${activePeriodKey || 'غير محددة'}`}
          </p>
          {periodLoadError
            ? <ErrorState title="تعذر تحميل إعدادات الفترة" description={periodLoadError} className="mt-2 p-3" />
            : <p className="mt-1 text-sm text-slate-500">{period ? `النطاق: ${formatDate(period.start_date)} — ${formatDate(period.end_date)}` : 'يتم تحميل إعدادات الفترة'}</p>}
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${!periodLoaded ? 'bg-slate-100 text-slate-500' : isLocked ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {periodLoadError
            ? 'تعذر تحميل الفترة'
            : !periodLoaded
              ? periodLoading ? 'جارٍ تحميل الفترة' : 'الفترة غير متاحة'
              : isLocked ? 'مقفلة للقراءة فقط' : 'فترة مفتوحة'}
        </span>
      </div>

      <div className="grid gap-4 border-t border-slate-100 pt-5 lg:grid-cols-[minmax(210px,0.8fr)_minmax(300px,1.35fr)_minmax(230px,1fr)]">
        <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <h3 className="mb-3 text-xs font-bold text-slate-700">الفترة المعروضة</h3>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            الشهر والسنة
            <input
              type="month"
              className="field"
              value={monthKey}
              onChange={(event) => onMonthChange(event.target.value)}
              aria-label="اختيار الشهر والسنة"
            />
          </label>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-xs font-bold text-slate-700">نطاق الفترة المالية</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">حدد تاريخ بداية الفترة ونهايتها داخل الشهر المختار.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
              من تاريخ
              <input type="date" className="field" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={!periodLoaded || isLocked} />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
              إلى تاريخ
              <input type="date" className="field" value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={!periodLoaded || isLocked} />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <h3 className="mb-3 text-xs font-bold text-slate-700">الفترات المؤرشفة</h3>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
            اختيار فترة محفوظة
            <select
              className="field"
              value=""
              onChange={(event) => { if (event.target.value) onMonthChange(event.target.value); }}
              aria-label="فتح شهر مؤرشف"
            >
              <option value="">اختر شهراً محفوظاً</option>
              {archives.map((item) => (
                <option key={item.month_key} value={item.month_key}>
                  {formatMonth(item.month_key)} · {item.is_locked ? 'مقفل' : `إصدار ${formatNumber(item.revision)}`}
                </option>
              ))}
            </select>
          </label>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <p className="text-xs font-bold text-slate-700">إجراءات الفترة</p>
          <p className="mt-1 text-xs text-slate-500">حفظ النطاق أو استعراض التقرير والأرشيف وإدارة حالة الإقفال.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {periodLoadError && (
            <button className="button button-outline" onClick={onRetryPeriod}>
              إعادة تحميل الفترة
            </button>
          )}
          {!isLocked && (
            <button className="button button-outline" disabled={!periodLoaded || savingRange} onClick={saveRange}>
              {savingRange ? 'جارٍ حفظ النطاق...' : 'حفظ نطاق الفترة'}
            </button>
          )}
          {archive && <button className="button button-outline" onClick={onViewArchive}>عرض الأرشيف</button>}
          {archive && <button className="button button-outline" onClick={onCopyArchive}>نسخ للفترة النشطة</button>}
          <button className="button button-outline" disabled={!periodLoaded || periodLoading} onClick={onExportReport}>تصدير تقرير الفترة</button>
          {!isActive && (
            <button
              className="button button-primary"
              disabled={!periodLoaded || isLocked || isRangeDirty || periodLoading}
              onClick={onActivatePeriod}
              title={isRangeDirty ? 'احفظ نطاق الفترة أولاً' : undefined}
            >
              فتح بداية الشهر
            </button>
          )}
          <button className="button border border-amber-500 bg-amber-400 text-slate-950 shadow-sm hover:bg-amber-300" disabled={!periodLoaded || isLocked || isRangeDirty || closingPeriod} onClick={onSaveArchive}>
            <span aria-hidden="true">▣</span>
            {closingPeriod ? 'جارٍ التقفيل...' : isLocked ? 'الفترة مقفلة' : isRangeDirty ? 'احفظ النطاق أولاً' : 'اعتماد وإقفال الفترة'}
          </button>
          {isLocked && (
            <button
              className="button border border-rose-300 bg-rose-50 text-rose-800 hover:border-rose-400 hover:bg-rose-100"
              disabled={!periodLoaded || unlockingPeriod}
              onClick={onUnlockPeriod}
            >
              {unlockingPeriod ? 'جارٍ فتح الفترة...' : 'إعادة فتح الفترة'}
            </button>
          )}
        </div>
      </div>
      {!isLocked && (
        <p className="text-xs leading-5 text-slate-500">
          احفظ نطاق التاريخ ثم افتح بداية الشهر ليصبح الفترة النشطة وتُربط به المدخلات الجديدة. لا يعاد توزيع السجلات تلقائياً حسب تاريخ كل مستند. ينشئ الإقفال أرشيفاً ثابتاً؛ وتظل الفترة للقراءة فقط حتى إعادة فتحها بتأكيد.
        </p>
      )}
      {isLocked && (
        <p className="text-xs leading-5 text-slate-500">
          التقرير المُصدّر يستخدم الأرشيف المحفوظ. لإجراء تصحيح، أعد فتح الفترة بالتأكيد؛ تبقى الإصدارات السابقة وسجل المراجعة محفوظين.
        </p>
      )}
    </section>
  );
}

function createPenaltyForm(monthKey) {
  return {
    militaryNumber: '',
    penaltyType: 'حبس',
    days: '',
    reason: '',
    textTemplateId: '',
    reasonManuallyEdited: false,
    actionDate: monthKey ? `${monthKey}-01` : '',
    clauseNo: ''
  };
}

function ArchiveSnapshot({ archive, audit, revisions, onSelectRevision, onClose }) {
  const snapshot = archive.snapshot;
  const sections = [
    ['الأفراد وقت الإقفال', snapshot.personnel],
    ['الماهيات', snapshot.salaries],
    ['الجزاءات', snapshot.penalties],
    ['أوامر التوريد', snapshot.supplyOrders],
    ...getArchiveCustomSections(snapshot)
  ];

  return (
    <section className="panel mb-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">أرشيف {formatMonth(archive.month_key)}</h2>
          <p className="mt-1 text-xs text-slate-500">
            من {formatDate(archive.snapshot.periodRange?.start_date)} إلى {formatDate(archive.snapshot.periodRange?.end_date)} · إصدار {formatNumber(archive.revision)} · وقت الحفظ: {formatDateTime(archive.created_at || archive.updated_at || archive.closed_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {revisions.length > 1 && (
            <label className="text-xs font-semibold text-slate-500">
              إصدار محفوظ
              <select
                className="field mt-1 min-w-36"
                value={archive.revision}
                onChange={(event) => onSelectRevision(event.target.value)}
              >
                {revisions.map((revision) => (
                  <option value={revision.revision} key={revision.revision}>
                    إصدار {formatNumber(revision.revision)} · {formatDateTime(revision.created_at)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="button button-outline self-end" onClick={onClose}>إغلاق الأرشيف</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {sections.map(([title, rows]) => (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={title}>
            <p className="text-xs text-slate-500">{title}</p>
            <p className="mt-1 text-xl font-bold text-indigo-700">{formatNumber(rows.length)}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {sections.map(([title, rows]) => <SnapshotTable key={title} title={title} rows={rows} />)}
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-bold text-slate-700">سجل المراجعات</h3>
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {audit.map((entry) => (
            <li key={entry.id}>{formatDateTime(entry.created_at)} · {archiveActionLabel(entry.action)} · {entry.details}</li>
          ))}
          {audit.length === 0 && <li>لا يوجد سجل عمليات.</li>}
        </ul>
      </div>
    </section>
  );
}

function getArchiveCustomSections(snapshot) {
  if (Array.isArray(snapshot.customSections)) {
    return snapshot.customSections.map((section) => [
      [section.module_title, section.submodule_title].filter(Boolean).join(' · '),
      section.records.map((record) => ({
        id: record.id,
        ...Object.fromEntries(Object.entries(record.data || {}).map(([key, value]) => [
          section.fields.find((field) => field.key === key)?.label || key,
          value
        ]))
      }))
    ]);
  }
  const grouped = new Map();
  for (const record of snapshot.submoduleRecords || []) {
    const title = [record.module_title, record.submodule_title || record.submodule_id]
      .filter(Boolean)
      .join(' · ');
    if (!grouped.has(title)) grouped.set(title, []);
    const fields = JSON.parse(record.fields_json || '[]');
    grouped.get(title).push({
      id: record.id,
      ...Object.fromEntries(Object.entries(record.data || {}).map(([key, value]) => [
        fields.find((field) => field.key === key)?.label || key,
        value
      ]))
    });
  }
  return [...grouped.entries()];
}

function SnapshotTable({ title, rows }) {
  const displayRows = rows.map((row) => {
    const { data_json: dataJson, data, ...rest } = row;
    const parsedData = data || (dataJson ? JSON.parse(dataJson) : {});
    return { ...rest, ...parsedData };
  });
  const columns = [...new Set(displayRows.flatMap((row) => Object.keys(row)))];

  return (
    <details className="rounded-xl border border-slate-200">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
        {title} <span className="text-xs font-normal text-slate-600">({rows.length})</span>
      </summary>
      <div className="data-table-scroll border-t border-slate-100">
        {displayRows.length ? (
          <table className="data-table min-w-max">
            <thead className="bg-slate-100 text-slate-700">
              <tr>{columns.map((column) => <th className="whitespace-nowrap px-3 py-2 font-bold" key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {displayRows.map((row, index) => (
                <tr className="border-t border-slate-100" key={row.id ?? index}>
                  {columns.map((column) => (
                    <td className="max-w-64 px-3 py-2" key={column}>
                      {typeof row[column] === 'object' && row[column] !== null
                        ? JSON.stringify(row[column])
                        : row[column] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-xs text-slate-500">لا توجد بيانات في هذه المجموعة وقت الإقفال.</p>
        )}
      </div>
    </details>
  );
}

function archiveActionLabel(action) {
  return ({
    closed: 'إقفال الشهر',
    updated: 'حفظ إصدار جديد',
    unlocked: 'إلغاء التقفيلة وفتح الشهر',
    copied: 'نسخ إلى شهر آخر',
    data_changed: 'تعديل بيانات بعد الإقفال'
  })[action] || action;
}

function PersonnelSection({
  personnel,
  columns,
  total,
  moduleTemplatePath,
  onExportTemplate,
  search,
  onSearch,
  onImport,
  busy,
  isLocked,
  selectionResetKey
}) {
  const displayColumns = columns.length
    ? columns.map((column) => ({ key: column.column_key, label: column.source_header }))
    : [
      { key: 'military_number', label: 'الرقم العسكري' },
      { key: 'full_name', label: 'الاسم' },
      { key: 'rank', label: 'الرتبة' },
      { key: 'category', label: 'الفئة' },
      { key: 'unit', label: 'الوحدة' }
    ];
  const tableColumns = displayColumns.map((column) => ({
    key: column.key,
    label: column.label,
    sortValue: (person) => person[column.key],
    render: (person) => person[column.key] === '' || person[column.key] == null ? '—' : person[column.key]
  }));
  return (
    <section className="panel">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">بيانات الأفراد</h2>
          <p className="mt-1 text-sm text-slate-500">المعروض: {personnel.length} من {total}</p>
        </div>
        <button className="button button-primary" onClick={onImport} disabled={busy || isLocked}>
          <span aria-hidden="true">⇧</span>
          {busy ? 'جارٍ الاستيراد...' : 'استيراد ملف'}
        </button>
      </div>
      {isLocked && <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">هذه الفترة غير نشطة أو مقفلة؛ الاستيراد معطل.</p>}
      <label className="mb-4 block">
        <span className="sr-only">بحث في سجل الأفراد</span>
        <input
          type="search"
          className="field max-w-md"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="اكتب بداية الاسم بالتسلسل أو بداية الرقم العسكري"
          autoComplete="off"
          aria-label="البحث المتسلسل ببداية الاسم أو ببداية الرقم العسكري"
        />
      </label>
      <DataTable
        rows={personnel}
        columns={tableColumns}
        getRowKey={(person) => person.military_number}
        selectable
        selectionResetKey={selectionResetKey}
        onPrintSelected={moduleTemplatePath
          ? (selected) => onExportTemplate(selected.map((person) => person.military_number))
          : undefined}
        printSelectedLabel={moduleTemplatePath ? 'طباعة المحدد بقالب Word' : undefined}
        searchable={false}
        pageSize={25}
        tableClassName="min-w-[720px]"
        ariaLabel="سجل الأفراد"
        emptyTitle="لا توجد سجلات مطابقة"
      />
    </section>
  );
}

function PenaltiesWorkspace({
  monthKey,
  personnel,
  penalties,
  actionTypes,
  templatePath,
  textTemplates,
  onAddTextTemplate,
  submodules,
  onSavePenalty,
  onSelectTemplate,
  onExportPenalty,
  modules,
  onCreateRecordFromPenalty,
  onManageSections,
  onOpenSubmodule,
  onShowPenalties,
  isLocked
}) {
  const [penaltyForm, setPenaltyForm] = useState(() => createPenaltyForm(monthKey));
  const [selectedDestinations, setSelectedDestinations] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useToastErrorState();
  const destinations = modules
    .filter((module) => module.id !== 'penalties' && module.is_active !== 0)
    .flatMap((module) => module.submodules
      .filter((submodule) => submodule.is_active !== 0
        && submodule.fields.some((field) => field.type === 'person')
        && submodule.fields.some((field) => field.type === 'linked_record'))
      .map((submodule) => ({ module, submodule })));
  const penaltyColumns = [
    {
      key: 'person',
      label: 'الفرد',
      sortValue: (penalty) => penalty.full_name || penalty.military_number,
      searchValue: (penalty) => `${penalty.military_number} ${penalty.full_name || ''}`,
      render: (penalty) => `${penalty.military_number} · ${penalty.full_name || '—'}`
    },
    {
      key: 'penalty_type',
      label: 'الجزاء',
      render: (penalty) => `${formatNumber(Number(penalty.days))} يوم ${penalty.penalty_type}`
    },
    {
      key: 'reason',
      label: 'السبب / البيان',
      render: (penalty) => penalty.reason || penalty.notes || '—'
    },
    {
      key: 'action_date',
      label: 'التاريخ',
      render: (penalty) => formatDate(penalty.action_date)
    },
    {
      key: 'clause_no',
      label: 'البند / الأمر',
      render: (penalty) => penalty.clause_no || '—'
    },
    {
      key: 'create_record',
      label: 'إنشاء سجل في قسم آخر',
      sortable: false,
      searchable: false,
      cellClassName: 'min-w-64',
      render: (penalty) => destinations.length ? (
        <div className="flex items-center gap-2">
          <select
            className="field min-w-0"
            aria-label={`القسم المستهدف للجزاء ${penalty.id}`}
            value={selectedDestinations[penalty.id] || ''}
            onChange={(event) => setSelectedDestinations((current) => ({
              ...current,
              [penalty.id]: event.target.value
            }))}
            disabled={isLocked}
          >
            <option value="">اختر القسم والنموذج</option>
            {destinations.map(({ module, submodule }) => (
              <option value={`${module.id}::${submodule.id}`} key={submodule.id}>
                {module.title} / {submodule.title}
              </option>
            ))}
          </select>
          <button
            className="button button-outline shrink-0 px-2 py-1 text-xs"
            type="button"
            disabled={isLocked || !selectedDestinations[penalty.id]}
            onClick={() => {
              const [moduleId, submoduleId] = (selectedDestinations[penalty.id] || '').split('::');
              if (moduleId && submoduleId) onCreateRecordFromPenalty(penalty, moduleId, submoduleId);
            }}
          >
            إنشاء
          </button>
        </div>
      ) : (
        <button
          className="button button-outline px-3 py-2 text-xs"
          type="button"
          onClick={onManageSections}
          aria-label="إعداد نموذج مرتبط بإنشاء قسم فرعي"
        >
          إعداد نموذج مرتبط
        </button>
      )
    },
  ];

  useEffect(() => {
    setPenaltyForm((current) => ({
      ...current,
      militaryNumber: personnel.some((person) => person.military_number === current.militaryNumber)
        ? current.militaryNumber
        : personnel[0]?.military_number || '',
      actionDate: current.actionDate.startsWith(`${monthKey}-`) ? current.actionDate : `${monthKey}-01`
    }));
  }, [monthKey, personnel]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!penaltyForm.militaryNumber) {
      setError('اختر الفرد المرتبط بالإجراء أولاً.');
      return;
    }
    if (!penaltyForm.reason?.trim()) {
      setError('اختر نصاً من المكتبة أو أدخل نصاً حراً.');
      return;
    }
    setBusy(true);
    try {
      await onSavePenalty({
        ...penaltyForm,
        days: Number(penaltyForm.days),
        reason: penaltyForm.reason.trim(),
        clauseNo: penaltyForm.clauseNo.trim()
      });
      setPenaltyForm((current) => ({ ...current, days: '', clauseNo: '' }));
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {submodules.length > 0 && (
        <nav className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2" aria-label="نماذج الجزاءات">
          <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white" onClick={onShowPenalties}>الجزاءات الفردية</button>
          {submodules.map((submodule) => (
            <button className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100" key={submodule.id} onClick={() => onOpenSubmodule(submodule.id)}>
              {submodule.title}
            </button>
          ))}
        </nav>
      )}
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="الفترة المالية" value={formatMonth(monthKey)} detail="بيانات مرتبطة بالشهر المختار" />
        <StatCard label="الإجراءات المسجلة" value={formatNumber(penalties.length)} detail="جزاءات وشطب خلال الفترة" />
        <StatCard label="حالة الإدخال" value={isLocked ? 'قراءة فقط' : 'متاح'} detail={isLocked ? 'الفترة غير نشطة أو مقفلة' : 'يمكن إضافة إجراء جديد'} />
      </section>

      <section className="panel">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900">إضافة إجراء أو جزاء للفرد</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">يسجل الإجراء باسم الفرد والفترة الحالية، ويحفظ محلياً ضمن الأرشيف المالي.</p>
          </div>
          <div className="max-w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            <p className="font-bold text-slate-700">{templatePath ? 'قالب الجزاءات المحفوظ' : 'لم يتم اختيار قالب Word'}</p>
            <p className="mt-1 leading-5 text-slate-600">لتكرار صف جدول لكل جزاء محدد، لفّ صف البيانات بـ {'{#records}'} و{'{/records}'}.</p>
            {templatePath && <code className="mt-1 block max-w-sm break-all text-slate-500" dir="ltr">{templatePath}</code>}
            <button className="button button-outline mt-2 min-h-11 px-3 py-1.5 text-xs" onClick={onSelectTemplate}>
              {templatePath ? 'تغيير قالب Word' : 'اختيار قالب Word'}
            </button>
          </div>
        </div>

        {isLocked && <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">الفترة غير نشطة أو مقفلة؛ لا يمكن إضافة جزاءات.</p>}
        {!personnel.length ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">أضف الأفراد أولاً من سجل الأفراد لتسجيل الجزاءات.</p>
        ) : (
          <form onSubmit={submit}>
            <PenaltyForm
              value={penaltyForm}
              onChange={setPenaltyForm}
              personnel={personnel}
              textTemplates={textTemplates}
              onAddTextTemplate={onAddTextTemplate}
              actionTypes={actionTypes}
              scope="penalties"
              monthKey={monthKey}
              disabled={isLocked}
            />
            {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-2 xl:col-span-3">{error}</p>}
            <div className="mt-4">
              <button className="button button-primary" type="submit" disabled={busy || isLocked}>
                {busy ? 'جارٍ حفظ الإجراء...' : 'حفظ الإجراء'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="mb-4">
          <h2 className="font-bold text-slate-900">سجل الجزاءات والشطب</h2>
          <p className="mt-1 text-xs text-slate-500">{formatNumber(penalties.length)} إجراء في {formatMonth(monthKey)}</p>
        </div>
        <DataTable
          rows={penalties}
          columns={penaltyColumns}
          getRowKey={(penalty) => penalty.id}
          selectable
          onPrintSelected={templatePath
            ? (selected) => onExportPenalty(selected.map((penalty) => penalty.id))
            : undefined}
          printSelectedLabel={templatePath ? 'طباعة المحدد بقالب Word' : undefined}
          pageSize={20}
          tableClassName="min-w-[980px]"
          ariaLabel="سجل الجزاءات والشطب"
          emptyTitle="لا توجد جزاءات مسجلة لهذه الفترة"
        />
      </section>
    </div>
  );
}

function PayrollSection({
  monthKey,
  personnel,
  salaries,
  moduleTemplatePath,
  onExportTemplate,
  onSaveSalary,
  isLocked
}) {
  const [militaryNumber, setMilitaryNumber] = useState(null);
  const [baseSalary, setBaseSalary] = useState('');
  const [allowances, setAllowances] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useToastErrorState();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (militaryNumber === null && personnel.length) setMilitaryNumber(personnel[0].military_number);
  }, [militaryNumber, personnel]);

  useEffect(() => {
    const salary = salaries.find((row) => row.military_number === militaryNumber);
    setBaseSalary(salary ? String(salary.base_salary) : '');
    setAllowances(salary ? String(salary.allowances) : '');
  }, [militaryNumber, salaries]);

  const visibleSalaries = salaries.filter((row) =>
    [row.military_number, row.full_name, row.rank].some((value) =>
      String(value ?? '').toLocaleLowerCase('ar').includes(search.trim().toLocaleLowerCase('ar'))
    )
  );
  const totalBase = salaries.reduce((sum, row) => sum + Number(row.base_salary || 0), 0);
  const totalAllowances = salaries.reduce((sum, row) => sum + Number(row.allowances || 0), 0);
  const salaryColumns = [
    { key: 'military_number', label: 'الرقم العسكري' },
    { key: 'full_name', label: 'الاسم' },
    { key: 'rank', label: 'الرتبة' },
    { key: 'base_salary', label: 'الماهية الأساسية', render: (row) => formatNumber(Number(row.base_salary)) },
    { key: 'allowances', label: 'البدلات', render: (row) => formatNumber(Number(row.allowances)) },
    {
      key: 'total',
      label: 'الإجمالي قبل الخصم',
      sortValue: (row) => Number(row.base_salary) + Number(row.allowances),
      render: (row) => formatNumber(Number(row.base_salary) + Number(row.allowances))
    }
  ];

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!militaryNumber) {
      setError('اختر الفرد المرتبط بالماهية أولاً.');
      return;
    }
    setBusy(true);
    try {
      await onSaveSalary({
        militaryNumber,
        baseSalary: Number(baseSalary),
        allowances: Number(allowances)
      });
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="الفترة المالية" value={monthKey ? formatMonth(monthKey) : '—'} detail="الماهية المسجلة لهذه الفترة" />
        <StatCard label="عدد الأفراد المسجلين" value={salaries.length} detail="لهذا الشهر" />
        <StatCard label="إجمالي الماهيات والبدلات" value={formatNumber(totalBase + totalAllowances)} detail="بدون احتساب خصومات أو جزاءات" />
      </section>

      <section className="panel">
        <div className="mb-4">
          <h2 className="font-bold text-slate-800">تسجيل / تحديث ماهية شهرية</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            الحفظ مرتبط بشهر {monthKey}. لا يتم احتساب خصومات تلقائية دون قاعدة معتمدة.
          </p>
        </div>
        {isLocked && <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">الفترة غير نشطة أو مقفلة؛ نموذج الماهيات للعرض فقط.</p>}
        {personnel.length ? (
          <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
            <label className="text-sm font-medium text-slate-700">
              الفرد
              <div className="mt-2">
                <PersonPicker
                  persons={personnel}
                  value={militaryNumber}
                  onChange={(person) => setMilitaryNumber(person?.military_number || '')}
                  disabled={isLocked}
                  placeholder="ابحث عن الفرد بالاسم أو الرقم العسكري"
                />
              </div>
            </label>
            <label className="text-sm font-medium text-slate-700">
              الماهية الأساسية
              <input className="field mt-2" type="number" min="0" step="0.01" value={baseSalary} onChange={(event) => setBaseSalary(event.target.value)} required disabled={isLocked} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              البدلات
              <input className="field mt-2" type="number" min="0" step="0.01" value={allowances} onChange={(event) => setAllowances(event.target.value)} required disabled={isLocked} />
            </label>
            <div className="flex items-end">
              <button className="button button-primary w-full" type="submit" disabled={busy || !monthKey || isLocked}>
                {busy ? 'جارٍ الحفظ...' : 'حفظ الماهية'}
              </button>
            </div>
            {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-2 xl:col-span-4">{error}</p>}
          </form>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">أضف الأفراد أولاً من صفحة سجل الأفراد لتسجيل الماهيات.</p>
        )}
      </section>

      <section className="panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">كشف الماهيات</h2>
            <p className="mt-1 text-xs text-slate-500">{salaries.length} سجل في {monthKey}</p>
          </div>
          <input
            className="field max-w-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث بالاسم أو الرقم العسكري"
            aria-label="بحث في كشف الماهيات"
          />
        </div>
        <DataTable
          rows={visibleSalaries}
          columns={salaryColumns}
          getRowKey={(row) => row.military_number}
          selectable
          onPrintSelected={moduleTemplatePath
            ? (selected) => onExportTemplate(selected.map((row) => row.military_number))
            : undefined}
          printSelectedLabel={moduleTemplatePath ? 'طباعة المحدد بقالب Word' : undefined}
          searchable={false}
          pageSize={25}
          tableClassName="min-w-[720px]"
          ariaLabel="كشف الماهيات"
          emptyTitle="لا توجد ماهيات مسجلة لهذه الفترة أو لا توجد نتائج مطابقة"
        />
      </section>
    </div>
  );
}

function StatCard({ label, value, detail }) {
  return (
    <section className="panel">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-bold text-indigo-700">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </section>
  );
}

function ModuleView({
  module,
  monthKey,
  actionTypes,
  personnel,
  customSections,
  penalties,
  initialPenaltyRecord,
  onConsumeInitialPenaltyRecord,
  activeSubmodule,
  records,
  totalRecords,
  search,
  onSearch,
  onNavigate,
  onCreateSubmodule,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  onListSavedFieldValues,
  textTemplates,
  onAddTextTemplate,
  onChooseTemplate,
  onRenderTemplate,
  personnelColumns,
  isLocked
}) {
  const visibleSubmodules = module.submodules.filter((submodule) => submodule.is_active !== 0);
  return (
    <div className="space-y-5">
      {visibleSubmodules.length > 0 && (
        <nav className="no-print flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm" aria-label="الأقسام الفرعية">
          <button
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${!activeSubmodule ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
            onClick={() => onNavigate(module.id)}
            aria-current={!activeSubmodule ? 'page' : undefined}
          >
            نظرة عامة
          </button>
          {visibleSubmodules.map((submodule) => (
            <button
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeSubmodule?.id === submodule.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              key={submodule.id}
              onClick={() => onNavigate(module.id, submodule.id)}
              aria-current={activeSubmodule?.id === submodule.id ? 'page' : undefined}
            >
              {submodule.title}
            </button>
          ))}
        </nav>
      )}
      {!activeSubmodule ? (
        <ModuleOverview
          module={module}
          onNavigate={onNavigate}
          onCreateSubmodule={onCreateSubmodule}
        />
      ) : (
        <SubmoduleWorkspace
          submodule={activeSubmodule}
          moduleTitle={module.title}
          actionTypes={actionTypes}
          moduleTemplatePath={module.template_path}
          monthKey={monthKey}
          personnel={personnel}
          customSections={customSections}
          penalties={penalties}
          records={records}
          totalRecords={totalRecords}
          search={search}
          onSearch={onSearch}
          onAddRecord={onAddRecord}
          onUpdateRecord={onUpdateRecord}
          onDeleteRecord={onDeleteRecord}
          onListSavedFieldValues={onListSavedFieldValues}
          textTemplates={textTemplates}
          onAddTextTemplate={onAddTextTemplate}
          onChooseTemplate={onChooseTemplate}
          onRenderTemplate={onRenderTemplate}
          personnelColumns={personnelColumns}
          isLocked={isLocked}
          initialPenaltyRecord={initialPenaltyRecord}
          onConsumeInitialPenaltyRecord={onConsumeInitialPenaltyRecord}
        />
      )}
    </div>
  );
}

function CreateModuleCard({ onCreateModule, presets }) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('');
  const [presetId, setPresetId] = useState('');
  const [error, setError] = useToastErrorState();

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      await onCreateModule(title, icon, presetId);
      setTitle('');
      setIcon('');
      setPresetId('');
    } catch (issue) {
      setError(issue.message);
    }
  }

  return (
    <form className="panel flex flex-col justify-center border-dashed" onSubmit={submit}>
      <label className="text-sm font-bold text-slate-800" htmlFor="dashboard-module-title">قسم جديد</label>
      <p className="mt-1 text-xs leading-5 text-slate-500">اختر «فارغ» أو طبّق مقترح حقول ونصوص قابل للتعديل. لا يُضاف أي نموذج أو نص جاهز تلقائياً.</p>
      <div className="mt-4 grid gap-2">
        <input
          id="dashboard-module-title"
          className="field min-w-0"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          required
          placeholder="اسم القسم"
        />
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
          <input
            className="field text-center"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            maxLength={8}
            aria-label="أيقونة القسم اختيارية"
            placeholder="▦"
          />
          <select
            className="field min-w-0"
            value={presetId}
            onChange={(event) => setPresetId(event.target.value)}
            aria-label="معرض النماذج الجاهزة الاختياري"
          >
            <option value="">فارغ - دون نموذج فرعي</option>
            {presets.map((preset) => <option value={preset.id} key={preset.id}>من نموذج جاهز: {preset.title}</option>)}
          </select>
        </div>
        <button className="button button-primary w-full px-3" type="submit" aria-label="إضافة قسم">
          <span aria-hidden="true">＋</span>
          إنشاء القسم
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
    </form>
  );
}

function ModuleOverview({ module, onNavigate, onCreateSubmodule }) {
  const visibleSubmodules = module.submodules.filter((submodule) => submodule.is_active !== 0);
  const [title, setTitle] = useState('');
  const [fieldLabels, setFieldLabels] = useState('الرقم العسكري, الاسم, ملاحظات');
  const [error, setError] = useToastErrorState();

  async function submit(event) {
    event.preventDefault();
    setError('');
    const fields = fieldLabels.split(',').map((field) => field.trim()).filter(Boolean);
    if (!fields.length) {
      setError('أدخل أسماء الحقول مفصولة بفواصل.');
      return;
    }
    try {
      await onCreateSubmodule(module.id, {
        title,
        fields: fields.map((label, index) => ({ key: `field_${index + 1}`, label, type: 'text' }))
      });
      setTitle('');
    } catch (issue) {
      setError(issue.message);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-slate-800">الأقسام الفرعية</h2>
          <p className="mt-1 text-sm text-slate-500">اختر نموذجاً لإدارة سجلاته، أو أنشئ نموذجاً جديداً.</p>
        </div>
        {visibleSubmodules.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleSubmodules.map((submodule) => (
              <button
                className="panel text-right transition hover:border-indigo-300 hover:shadow-md"
                key={submodule.id}
                onClick={() => onNavigate(module.id, submodule.id)}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">▤</span>
                <span className="mt-4 block font-bold text-slate-800">{submodule.title}</span>
                <span className="mt-2 block text-xs text-slate-500">{submodule.fields.length} حقول بيانات</span>
              </button>
            ))}
          </div>
        ) : (
          <section className="panel text-sm text-slate-500">لا توجد أقسام فرعية بعد.</section>
        )}
      </section>

      <section className="panel">
        <h2 className="text-lg font-bold text-slate-800">إضافة قسم فرعي</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            اسم القسم الفرعي
            <input
              className="field mt-2"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              required
              placeholder="مثال: شطب عادي"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            حقول السجل (افصل بينها بفاصلة)
            <input
              className="field mt-2"
              value={fieldLabels}
              onChange={(event) => setFieldLabels(event.target.value)}
              placeholder="الرقم العسكري, الاسم, ملاحظات"
            />
          </label>
          {error && <p role="alert" className="text-sm text-rose-700 md:col-span-2">{error}</p>}
          <div className="md:col-span-2">
            <button className="button button-primary" type="submit">
              <span aria-hidden="true">＋</span>
              إضافة قسم فرعي
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SubmoduleWorkspace({
  submodule,
  moduleTitle,
  actionTypes = [],
  moduleTemplatePath,
  monthKey,
  personnel,
  customSections,
  penalties,
  records,
  totalRecords,
  search,
  onSearch,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  onListSavedFieldValues,
  textTemplates,
  onAddTextTemplate,
  onChooseTemplate,
  onRenderTemplate,
  personnelColumns,
  isLocked,
  initialPenaltyRecord,
  onConsumeInitialPenaltyRecord
}) {
  const [values, setValues] = useState({});
  const [selectedMilitaryNumber, setSelectedMilitaryNumber] = useState('');
  const [clauseNo, setClauseNo] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState({});
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkPeople, setBulkPeople] = useState([]);
  const [savedSuggestions, setSavedSuggestions] = useState({});
  const [linkedSearches, setLinkedSearches] = useState({});
  const [durationRanges, setDurationRanges] = useState({});
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pickerVersion, setPickerVersion] = useState(0);
  const [includeAction, setIncludeAction] = useState(false);
  const [actionForm, setActionForm] = useState(() => createPenaltyForm(monthKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useToastErrorState();
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState(null);
  const hasLinkedRecords = records.some((record) => record.military_number);
  const personField = submodule.fields.find((field) => field.type === 'person');
  const linkedPersonnelNumber = personField
    ? values[personField.key] || selectedMilitaryNumber
    : selectedMilitaryNumber;
  const selectedPersonnel = personnel.find((person) => person.military_number === linkedPersonnelNumber) || null;
  const hasWordTemplate = Boolean(submodule.template_path || moduleTemplatePath);
  const filteredRecords = records.filter((record) => {
    const recordDate = String(record.created_at || '').slice(0, 10);
    return (!dateFrom || recordDate >= dateFrom) && (!dateTo || recordDate <= dateTo);
  });
  const linkedRecords = useMemo(() => [
    ...customSections.flatMap((section) => section.records.map((record) => ({
      ...record,
      summary: `${section.module_title} · ${section.submodule_title} · ${record.full_name || record.data?.field_1 || record.id}`
    }))).filter((record) => record.submodule_id !== submodule.id),
    ...penalties.map((penalty) => ({
      id: `penalty:${penalty.id}`,
      summary: `الجزاء رقم ${penalty.id} · ${penalty.full_name || penalty.military_number} · ${penalty.reason || penalty.penalty_type}`
    }))
  ], [customSections, penalties, submodule.id]);

  function updateFieldValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function getTemplateValues(person, fieldValues = values) {
    const result = {
      ...fieldValues,
      name: person?.full_name || '',
      rank: person?.rank || '',
      militaryNumber: person?.military_number || '',
      duration: '',
      date: '',
      clauseNo
    };
    for (const field of submodule.fields) {
      const rawValue = fieldValues[field.key] || '';
      const fieldValue = field.type === 'percentage' && rawValue
        ? `${rawValue}%`
        : field.type === 'linked_record' && rawValue
          ? linkedRecords.find((record) => String(record.id) === String(rawValue))?.summary || rawValue
          : rawValue;
      result[field.key] = fieldValue;
      result[field.label] = fieldValue;
      result[field.label.replace(/\s+/g, '_')] = fieldValue;
      if (field.type === 'duration') result.duration = fieldValue ? `${fieldValue} يوم` : '';
      if (field.type === 'date') result.date = fieldValue;
      if (/رقم.*(بند|أمر)/.test(field.label)) result.clauseNo = fieldValue;
    }
    return result;
  }

  function dataForPerson(person, fieldValues = values, fillPersonnelFields = false) {
    const data = { ...fieldValues };
    for (const field of submodule.fields) {
      const personnelValue = fillPersonnelFields && person
        ? personnelValueForField(field, person, personnelColumns)
        : undefined;
      if (personnelValue !== undefined) data[field.key] = personnelValue;
      if (field.type === 'template') {
        const template = selectedTemplates[field.key];
        if (template) data[field.key] = renderTextTemplate(template.body, getTemplateValues(person, data));
      }
    }
    return data;
  }

  function selectPersonnel(person, fieldKey = null) {
    setSelectedMilitaryNumber(person?.military_number || '');
    setValues((current) => {
      const next = { ...current };
      if (person) {
        for (const field of submodule.fields) {
          const value = personnelValueForField(field, person, personnelColumns);
          if (value !== undefined) next[field.key] = value;
        }
      } else if (fieldKey) {
        next[fieldKey] = '';
      }
      if (fieldKey) next[fieldKey] = person?.military_number || '';
      return next;
    });
  }

  function personForField(field) {
    return personnel.find((person) => person.military_number === values[field.key]) || null;
  }

  async function loadSavedValues(field, query) {
    updateFieldValue(field.key, query);
    try {
      const suggestions = await onListSavedFieldValues(submodule.id, field.key, query);
      setSavedSuggestions((current) => ({ ...current, [field.key]: suggestions }));
    } catch (issue) {
      setError(`تعذر تحميل القيم السابقة: ${issue.message}`);
    }
  }

  useEffect(() => {
    setActionForm((current) => ({
      ...current,
      actionDate: current.actionDate.startsWith(`${monthKey}-`) ? current.actionDate : `${monthKey}-01`
    }));
  }, [monthKey]);

  useEffect(() => {
    if (!initialPenaltyRecord) return;
    const person = submodule.fields.find((field) => field.type === 'person');
    const linkedRecord = submodule.fields.find((field) => field.type === 'linked_record');
    if (person && linkedRecord) {
      setSelectedMilitaryNumber(initialPenaltyRecord.militaryNumber);
      setValues((current) => ({
        ...current,
        [person.key]: initialPenaltyRecord.militaryNumber,
        [linkedRecord.key]: initialPenaltyRecord.linkedValue
      }));
        setClauseNo(initialPenaltyRecord.clauseNo || '');
        setActionForm((current) => ({ ...current, clauseNo: initialPenaltyRecord.clauseNo || '' }));
      setSelectedTemplates({});
      setBulkMode(false);
      setBulkPeople([]);
      setEditingRecordId(null);
      setError('');
    }
    onConsumeInitialPenaltyRecord?.();
  }, [initialPenaltyRecord, onConsumeInitialPenaltyRecord, submodule.fields]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (bulkMode && editingRecordId) {
      setError('أنه التعديل الحالي قبل الانتقال إلى التسجيل الجماعي.');
      return;
    }
    if (bulkMode && includeAction) {
      setError('أوقف وضع التسجيل الجماعي قبل ربط سجل بإجراء فردي.');
      return;
    }
    if (!clauseNo.trim()) {
      setError('رقم بند الأمر مطلوب لكل سجل.');
      return;
    }
    if (includeAction && !actionForm.militaryNumber) {
      setError('اختر الفرد المرتبط بالإجراء أولاً.');
      return;
    }
    if (includeAction && !actionForm.reason?.trim()) {
      setError('اختر نصاً من المكتبة أو أدخل نصاً حراً.');
      return;
    }
    setBusy(true);
    try {
      const action = includeAction ? {
        ...actionForm,
        days: Number(actionForm.days),
        reason: actionForm.reason.trim(),
        clauseNo: clauseNo.trim()
      } : null;
      if (editingRecordId) {
        const selectedPerson = selectedPersonnel || (personField ? personForField(personField) : null);
        await onUpdateRecord(editingRecordId, dataForPerson(selectedPerson), clauseNo.trim(), linkedPersonnelNumber || null);
        setEditingRecordId(null);
      } else if (bulkMode) {
        if (!bulkPeople.length) throw new Error('اختر فرداً واحداً على الأقل للمعاينة والحفظ الجماعي.');
        const batch = bulkPeople.map((person) => ({
          data: dataForPerson(person, values, true),
          militaryNumber: person.military_number
        }));
        await onAddRecord(batch, null, clauseNo.trim());
        setBulkPeople([]);
      } else {
        const selectedPerson = selectedPersonnel || (personField ? personForField(personField) : null);
        const data = dataForPerson(selectedPerson);
        if (action && personField) data[personField.key] = action.militaryNumber;
        await onAddRecord(data, action, clauseNo.trim(), action?.militaryNumber || linkedPersonnelNumber || null);
      }
      setValues({});
      setSelectedMilitaryNumber('');
      setClauseNo('');
      setSelectedTemplates({});
      if (includeAction) setActionForm((current) => ({ ...current, days: '', clauseNo: '' }));
      setPickerVersion((current) => current + 1);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(record) {
    setEditingRecordId(record.id);
    setValues({ ...record.data });
    setSelectedMilitaryNumber(record.military_number || '');
    setClauseNo(record.clause_no || '');
    setActionForm((current) => ({ ...current, clauseNo: record.clause_no || '' }));
    setSelectedTemplates({});
    setBulkMode(false);
    setBulkPeople([]);
    setIncludeAction(false);
    setError('');
  }

  function removeRecord(record) {
    setPendingDeleteRecord(record);
  }

  async function confirmRemoveRecord() {
    if (!pendingDeleteRecord) return;
    setError('');
    setBusy(true);
    try {
      await onDeleteRecord(pendingDeleteRecord.id);
      setPendingDeleteRecord(null);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  function resolveLinkedSummary(id) {
    return linkedRecords.find((record) => String(record.id) === String(id))?.summary || id;
  }

  const recordTableColumns = [
    ...submodule.fields.map((field) => ({
      key: field.key,
      label: field.label,
      sortValue: (record) => record.data[field.key],
      render: (record) => field.type === 'person'
        ? (() => {
          const person = personnel.find((item) => item.military_number === record.data[field.key]);
          return person ? `${person.rank} · ${person.full_name} · ${person.military_number}` : record.data[field.key] || '—';
        })()
        : field.type === 'linked_record'
          ? resolveLinkedSummary(record.data[field.key] || '—')
          : field.type === 'date' && record.data[field.key]
            ? formatDate(record.data[field.key])
            : field.type === 'number' && record.data[field.key] !== '' && record.data[field.key] != null
              ? formatNumber(Number(record.data[field.key]))
              : field.type === 'percentage' && record.data[field.key]
            ? `${record.data[field.key]}%`
            : record.data[field.key] || '—',
      cellClassName: 'max-w-sm whitespace-pre-wrap'
    })),
    ...(hasLinkedRecords ? [{
      key: 'linked_person',
      label: 'الفرد / الإجراء',
      sortValue: (record) => record.full_name || record.military_number,
      render: (record) => record.military_number
        ? `${record.military_number} · ${record.full_name || '—'} · ${record.action_reason || ''}`
        : '—'
    }] : []),
    {
      key: 'created_at',
      label: 'تاريخ الإدخال',
      render: (record) => formatDateTime(record.created_at),
      cellClassName: 'whitespace-nowrap text-xs text-slate-500'
    },
    {
      key: 'actions',
      label: 'إجراءات',
      sortable: false,
      searchable: false,
      cellClassName: 'whitespace-nowrap',
      render: (record) => (
        <>
          <button className="button button-outline px-3 py-2 text-xs" type="button" onClick={() => beginEdit(record)} disabled={isLocked}>تعديل</button>
          <button className="button button-outline ms-1 px-3 py-2 text-xs text-rose-700" type="button" onClick={() => removeRecord(record)} disabled={isLocked}>حذف</button>
        </>
      )
    }
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="الفترة المالية" value={formatMonth(monthKey)} detail={`${moduleTitle} · ${submodule.title}`} />
        <StatCard label="إجمالي السجلات" value={totalRecords} detail="في هذا القسم الفرعي" />
        <StatCard label="حقول النموذج" value={submodule.fields.length} detail="تستخدم أيضاً كمفاتيح لقالب Word" />
      </section>

      <section className="panel">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">قالب Word لهذا النموذج</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              استخدم عناصر نائبة بالشكل {'{field_1}'} داخل ملف DOCX؛ استبدل المفتاح بمفتاح الحقل الموضح أدناه.
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              للطباعة المجمعة داخل جدول، ضع {'{#records}'} في أول خلية من صف البيانات و{'{/records}'} في آخر خلية من الصف نفسه؛ سيُكرر الصف لكل سجل، وتُملأ حقوله مثل {'{field_1}'} و{'{NAME}'} من السجل ذاته.
            </p>
          </div>
          <button className="button button-outline" onClick={onChooseTemplate}>
            <span aria-hidden="true">▧</span>
            {hasWordTemplate ? 'تغيير قالب DOCX' : 'اختيار قالب DOCX'}
          </button>
        </div>
        <div className="mt-3 space-y-3 text-xs">
          <div>
            <p className="font-medium text-slate-700">
              {submodule.template_path ? 'قالب خاص بالنموذج' : moduleTemplatePath ? 'قالب القسم الرئيسي (موروث)' : 'لم يتم إرفاق قالب بعد'}
            </p>
            {hasWordTemplate && (
              <code className="mt-1 block break-all text-xs text-slate-500" dir="ltr">{submodule.template_path || moduleTemplatePath}</code>
            )}
          </div>
          {submodule.fields.length > 0 && (
            <div>
              <p className="font-semibold text-slate-700">حقول النموذج</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {submodule.fields.map((field) => (
                  <span key={field.key}>{field.label}: <code dir="ltr">{`{${field.key}}`}</code></span>
                ))}
              </div>
            </div>
          )}
          {personnelColumns.length > 0 && (
            <div>
              <p className="font-semibold text-slate-700">حقول Excel</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {personnelColumns.map((column) => (
                  <span key={column.column_key}>
                    {column.placeholder_label} · Excel: {column.source_header}: <code dir="ltr">{`{${column.column_key}}`}</code>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-700">بيانات الفرد والإجراء</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {[
                ['NAME', 'اسم الفرد'],
                ['MILITARY_ID', 'الرقم العسكري المرتبط'],
                ['RANK', 'الرتبة'],
                ['PENALTY_REASON', 'سبب الإجراء'],
                ['PENALTY_DAYS', 'مدة الإجراء'],
                ['DATE', 'تاريخ الإجراء'],
                ['CLAUSE_NO', 'رقم البند'],
                ['GENERATED_TEXT', 'النص التلقائي']
              ].map(([key, label]) => (
                <span key={key}>{label}: <code dir="ltr">{`{${key}}`}</code></span>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-slate-700">البيانات الرسمية</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {[
                ['organization', 'الجهة'],
                ['unit_commander', officialIdentity.commanderTitle],
                ['finance_chief', officialIdentity.financeChiefTitle],
                ['software_engineer', officialIdentity.softwareEngineerTitle],
                ['operations_chief', officialIdentity.commanderTitle],
                ['sergeant', officialIdentity.financeChiefTitle],
                ['acting_official', officialIdentity.softwareEngineerTitle]
              ].map(([key, label]) => (
                <span key={key}>{label}: <code dir="ltr">{`{${key}}`}</code></span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">{editingRecordId ? 'تعديل سجل' : 'إضافة سجل'}</h2>
            <p className="mt-1 text-xs text-slate-500">تُحفظ البيانات محلياً ضمن هذا القسم الفرعي.</p>
          </div>
          {personField && (
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={bulkMode}
                onChange={(event) => {
                  setBulkMode(event.target.checked);
                  setBulkPeople([]);
                  setSelectedMilitaryNumber('');
                  updateFieldValue(personField.key, '');
                  setError('');
                }}
                disabled={isLocked || Boolean(editingRecordId)}
              />
              تسجيل جماعي لأكثر من فرد
            </label>
          )}
        </div>
        {isLocked && <p className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">الفترة غير نشطة أو مقفلة؛ إضافة السجلات معطلة، والسجلات الحالية للعرض فقط.</p>}
        <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={submit} onKeyDown={(event) => {
          if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }
        }}>
        {!personField && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 sm:col-span-2 xl:col-span-3">
            <label className="block text-sm font-semibold text-slate-800">
              اختيار فرد من سجل الأفراد (اختياري)
              <div className="mt-2">
                <PersonPicker
                  persons={personnel}
                  value={selectedMilitaryNumber}
                  onChange={(person) => selectPersonnel(person)}
                  disabled={isLocked}
                  browseOnFocus
                  placeholder="ابحث بالاسم أو الرقم العسكري، أو افتح القائمة لاستعراض السجل"
                />
              </div>
            </label>
            <p className="mt-2 text-xs text-slate-600">
              السجل يحتوي على {personnel.length} فرد. عند الاختيار تُملأ الحقول المطابقة تلقائياً، ويمكنك مراجعتها وتعديلها قبل الحفظ.
            </p>
          </div>
        )}
          {submodule.fields.map((field, index) => {
            const linkedQuery = linkedSearches[field.key] || '';
            const selectedTemplate = selectedTemplates[field.key];
            const templatePreview = selectedTemplate
            ? renderTextTemplate(selectedTemplate.body, getTemplateValues(selectedPersonnel))
              : '';
            return (
              <div className="block text-sm font-medium text-slate-700" key={field.key}>
                <span>{field.label}{field.required && <span className="text-rose-600"> *</span>}</span>
                <div className="mt-2">
                  <RecordFieldInput
                    key={`${field.key}-${pickerVersion}`}
                    field={field}
                    value={values[field.key] || ''}
                    disabled={isLocked}
                    autoFocus={field.type === 'person' && index === submodule.fields.findIndex((item) => item.type === 'person')}
                    people={field.personCategory && field.personCategory !== 'all'
                      ? personnel.filter((person) => person.category === field.personCategory)
                      : personnel}
                    bulkMode={bulkMode}
                    bulkPeople={bulkPeople}
                    onPersonSelect={(person) => {
                      if (bulkMode && person) {
                        setBulkPeople((current) => current.some((item) => item.military_number === person.military_number)
                          ? current
                          : [...current, person]);
                      } else {
                        selectPersonnel(person, field.key);
                      }
                    }}
                    onRemovePerson={(militaryNumber) => setBulkPeople((current) => current.filter((person) => person.military_number !== militaryNumber))}
                    selectedTemplate={selectedTemplate}
                    templates={textTemplates}
                    scope={submodule.id}
                    onSelectTemplate={(template) => {
                      setSelectedTemplates((current) => ({ ...current, [field.key]: template }));
                      if (!template) updateFieldValue(field.key, '');
                    }}
                    onAddTemplate={onAddTextTemplate}
                    templatePreviewValues={getTemplateValues(selectedPersonnel)}
                    currentTemplatePreview={templatePreview}
                    editing={Boolean(editingRecordId)}
                    onChange={(value) => updateFieldValue(field.key, value)}
                    suggestions={savedSuggestions[field.key]}
                    onSearchSaved={(query) => loadSavedValues(field, query)}
                    linkedChoices={linkedRecords.filter((record) => (
                      !linkedQuery || record.summary.toLocaleLowerCase('ar').includes(linkedQuery.toLocaleLowerCase('ar'))
                    )).slice(0, 50)}
                    linkedQuery={linkedQuery}
                    onSearchLinked={(query) => setLinkedSearches((current) => ({ ...current, [field.key]: query }))}
                    durationRange={durationRanges[field.key] ? {
                      from: durationRanges[`${field.key}-from`],
                      to: durationRanges[`${field.key}-to`]
                    } : null}
                    onToggleDurationRange={() => setDurationRanges((current) => ({ ...current, [field.key]: !current[field.key] }))}
                    onDurationRangeChange={(part, value) => setDurationRanges((current) => ({ ...current, [`${field.key}-${part}`]: value }))}
                    onApplyDuration={() => {
                      const from = durationRanges[`${field.key}-from`];
                      const to = durationRanges[`${field.key}-to`];
                      if (!from || !to || to < from) {
                        setError('اختر تاريخي بداية ونهاية صحيحين.');
                        return;
                      }
                      updateFieldValue(field.key, String(Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)));
                      setError('');
                    }}
                  />
                </div>
              </div>
            );
          })}
          {selectedPersonnel && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm sm:col-span-2 xl:col-span-3">
              <p className="font-bold text-emerald-950">بيانات الفرد المختار من سجل الأفراد</p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-emerald-900 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { key: 'rank', label: 'الرتبة', value: selectedPersonnel.rank },
                  { key: 'category', label: 'الفئة', value: selectedPersonnel.category },
                  { key: 'unit', label: 'الوحدة', value: selectedPersonnel.unit },
                  ...personnelColumns.map((column) => ({
                    key: column.column_key,
                    label: column.placeholder_label,
                    value: selectedPersonnel[column.column_key]
                  }))
                ].filter(({ value }) => value).map(({ key, label, value }) => (
                  <div className="flex gap-1" key={key}>
                    <dt className="font-semibold">{label}:</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {bulkMode && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 sm:col-span-2 xl:col-span-3">
              <p className="font-bold text-indigo-950">معاينة الدفعة: {bulkPeople.length} فرد</p>
              <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto text-xs text-indigo-900">
                {bulkPeople.map((person) => {
                  const rendered = dataForPerson(person, values, true);
                  const templateField = submodule.fields.find((field) => field.type === 'template');
                  return <li key={person.military_number}>{person.rank} · {person.full_name} · {person.military_number}{templateField && rendered[templateField.key] ? ` — ${rendered[templateField.key]}` : ''}</li>;
                })}
              </ul>
            </div>
          )}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700 sm:col-span-2 xl:col-span-3">
            رقم بند الأمر <span className="text-rose-600">*</span>
            <input
              className="field max-w-md"
              value={clauseNo}
              onChange={(event) => {
                setClauseNo(event.target.value);
                setActionForm((current) => ({ ...current, clauseNo: event.target.value }));
              }}
              maxLength={100}
              required
              disabled={isLocked}
            />
          </label>
          <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950 sm:col-span-2 xl:col-span-3">
            <input
              type="checkbox"
              className="mt-1 accent-amber-600"
              checked={includeAction}
              onChange={(event) => setIncludeAction(event.target.checked)}
              disabled={isLocked}
            />
            <span>ربط السجل بفرد وإضافة بيانات إجراء أو جزاء</span>
          </label>
          {includeAction && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2 xl:col-span-3">
              <PenaltyForm
                value={{ ...actionForm, clauseNo }}
                onChange={(next) => {
                  setActionForm(next);
                  setClauseNo(next.clauseNo || '');
                  if (next.militaryNumber !== actionForm.militaryNumber) {
                    const person = personnel.find((item) => item.military_number === next.militaryNumber) || null;
                    selectPersonnel(person, personField?.key || null);
                  }
                }}
                personnel={personnel}
                textTemplates={textTemplates}
                onAddTextTemplate={onAddTextTemplate}
                actionTypes={actionTypes}
                scope={submodule.id}
                fields={submodule.fields}
                fieldValues={values}
                monthKey={monthKey}
                disabled={isLocked}
                showClauseNo={false}
              />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-rose-700 sm:col-span-2 xl:col-span-3">{error}</p>}
          <div className="sm:col-span-2 xl:col-span-3">
            <button className="button button-primary" disabled={busy || isLocked} type="submit">
              <span aria-hidden="true">＋</span>
              {busy ? 'جارٍ الحفظ...' : editingRecordId ? 'حفظ التعديل' : bulkMode ? `حفظ ${bulkPeople.length} سجلاً` : 'حفظ السجل'}
            </button>
            {editingRecordId && (
              <button className="button button-outline ms-2" type="button" onClick={() => {
                setEditingRecordId(null);
                setValues({});
                setSelectedMilitaryNumber('');
                setClauseNo('');
                setSelectedTemplates({});
              }}>إلغاء التعديل</button>
            )}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-800">سجلات {submodule.title}</h2>
            <p className="mt-1 text-xs text-slate-500">المعروض: {records.length} من {totalRecords}</p>
          </div>
          <input
            className="field max-w-sm"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="تصفية سجلات هذا النموذج"
            aria-label="تصفية السجلات"
          />
          <label className="text-xs text-slate-500">
            من تاريخ
            <input className="field mt-1" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className="text-xs text-slate-500">
            إلى تاريخ
            <input className="field mt-1" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
        </div>
        <DataTable
          rows={filteredRecords}
          columns={recordTableColumns}
          getRowKey={(record) => record.id}
          selectable
          onPrintSelected={hasWordTemplate
            ? (selected) => onRenderTemplate({
              recordIds: selected.map((record) => record.id),
              monthKey
            })
            : undefined}
          printSelectedLabel={hasWordTemplate ? 'طباعة المحدد بقالب Word' : undefined}
          searchable={false}
          pageSize={25}
          tableClassName="min-w-[720px]"
          ariaLabel={`سجلات ${submodule.title}`}
          emptyTitle="لا توجد سجلات مطابقة"
        />
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        يحفظ النموذج الإخطارات والبيانات كما أُدخلت؛ لا ينفذ القسم حساب مبالغ أو نتائج مالية تلقائية.
      </section>
      <ConfirmDialog
        open={Boolean(pendingDeleteRecord)}
        title="حذف السجل؟"
        description={pendingDeleteRecord ? `هل تريد حذف السجل رقم ${pendingDeleteRecord.id} نهائياً؟` : ''}
        confirmLabel="حذف السجل"
        busy={busy}
        onCancel={() => {
          if (!busy) setPendingDeleteRecord(null);
        }}
        onConfirm={confirmRemoveRecord}
      />
    </div>
  );
}

export default App;
