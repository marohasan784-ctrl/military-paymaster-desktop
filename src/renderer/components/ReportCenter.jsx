import { useEffect, useMemo, useState } from 'react';
import { DataTable, useToastErrorState } from './ui/index.jsx';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../../services/formatters.js';

const moduleLabels = {
  personnel: 'سجل الأفراد',
  salaries: 'الماهيات',
  penalties: 'الجزاءات',
  supplies: 'أوامر التوريد',
  invoices: 'الفواتير الإلكترونية'
};

function getRecordDate(entityType, record) {
  if (entityType === 'salary') return record.effective_month ? `${record.effective_month}-01` : '';
  return record.action_date || record.order_date || record.invoice_date || record.created_at || '';
}

function getRecordSummary(entityType, record, fields = []) {
  if (entityType === 'personnel') return [record.full_name, record.military_number, record.rank, record.unit].filter(Boolean).join(' · ');
  if (entityType === 'salary') return [record.full_name, record.military_number, `الأساسي ${formatMoney(Number(record.base_salary))}`, `البدلات ${formatMoney(Number(record.allowances))}`].filter(Boolean).join(' · ');
  if (entityType === 'penalty') return [record.full_name, record.military_number, record.penalty_type, record.reason, record.days ? `${formatNumber(Number(record.days))} يوم` : ''].filter(Boolean).join(' · ');
  if (entityType === 'supply_order') return [record.order_number, record.supplier, record.description, record.amount ? formatMoney(Number(record.amount)) : ''].filter(Boolean).join(' · ');
  if (entityType === 'invoice') return [record.invoice_number, record.company_name, record.grand_total ? formatMoney(Number(record.grand_total)) : ''].filter(Boolean).join(' · ');
  return fields.map((field) => {
    const value = record.data?.[field.key];
    if (!value) return '';
    const formattedValue = field.type === 'date'
      ? formatDate(value)
      : field.type === 'currency'
        ? formatMoney(Number(value))
        : ['number', 'percentage'].includes(field.type)
          ? `${formatNumber(Number(value))}${field.type === 'percentage' ? '%' : ''}`
          : value;
    return `${field.label}: ${formattedValue}`;
  }).filter(Boolean).join(' · ') || record.action_reason || '';
}

function getActiveRows(monthData, modules, monthKey) {
  if (!monthData) return [];
  const rows = [];
  const moduleTitle = (moduleId) => modules.find((module) => module.id === moduleId)?.title || moduleLabels[moduleId] || moduleId;
  const addRows = (entityType, moduleId, records, getId, submoduleId = '', submoduleTitle = '', fields = []) => {
    for (const record of records || []) {
      const recordId = String(getId(record));
      const summary = getRecordSummary(entityType, record, fields);
      rows.push({
        key: `${entityType}:${recordId}:${entityType === 'personnel' ? '' : monthKey}`,
        entityType,
        recordId,
        periodKey: entityType === 'personnel' ? '' : monthKey,
        moduleId,
        moduleTitle: moduleTitle(moduleId),
        submoduleId,
        submoduleTitle,
        date: getRecordDate(entityType, record),
        summary,
        searchText: `${moduleTitle(moduleId)} ${submoduleTitle} ${summary} ${JSON.stringify(record)}`,
        archiveable: true
      });
    }
  };

  addRows('personnel', 'personnel', monthData.personnel, (record) => record.military_number);
  addRows('salary', 'salaries', monthData.salaries, (record) => record.military_number);
  addRows('penalty', 'penalties', monthData.penalties, (record) => record.id);
  addRows('supply_order', 'supplies', monthData.supplyOrders, (record) => record.id);
  addRows('invoice', 'invoices', monthData.invoices, (record) => record.id);
  for (const section of monthData.customSections || []) {
    addRows(
      'submodule_record',
      section.module_id,
      section.records,
      (record) => record.id,
      section.submodule_id,
      section.submodule_title,
      section.fields
    );
  }
  return rows;
}

function getArchivedRows(archives, modules) {
  return (archives || []).map((archive) => {
    const record = archive.snapshot || {};
    const entityType = archive.entity_type;
    const moduleId = record.module_id || ({
      personnel: 'personnel',
      salary: 'salaries',
      penalty: 'penalties',
      supply_order: 'supplies',
      invoice: 'invoices'
    }[entityType] || '');
    const moduleTitle = modules.find((module) => module.id === moduleId)?.title || moduleLabels[moduleId] || moduleId;
    const fields = record.fields || [];
    const submoduleTitle = record.submodule_title || '';
    const summary = getRecordSummary(entityType, record, fields);
    return {
      key: `${entityType}:${archive.record_id}:${archive.period_key}`,
      entityType,
      recordId: archive.record_id,
      periodKey: archive.period_key,
      moduleId,
      moduleTitle,
      submoduleId: record.submodule_id || '',
      submoduleTitle,
      date: getRecordDate(entityType, record),
      summary,
      searchText: `${moduleTitle} ${submoduleTitle} ${summary} ${JSON.stringify(record)}`,
      archivedAt: archive.archived_at,
      archiveable: false
    };
  });
}

export default function ReportCenter({
  modules,
  monthKey,
  monthData,
  archives,
  isReadOnly,
  onArchiveRecords,
  onRestoreRecord,
  onSelectModuleTemplate,
  onExportModuleTemplate,
  documentTemplates,
  onExportSmartDocument,
  onExportPersonnelWord,
  onPrintReport,
  exportingPdf
}) {
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedSubmoduleId, setSelectedSubmoduleId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useToastErrorState();

  const sectionModules = modules.filter((module) => !['home', 'templates'].includes(module.id));
  const selectedModule = sectionModules.find((module) => module.id === selectedModuleId);
  const visibleSubmodules = selectedModule?.submodules || [];
  const attachedDocumentTemplates = documentTemplates.filter((template) => (
    template.is_active === 1
    && template.module_id === selectedModuleId
    && (selectedSubmoduleId ? template.submodule_id === selectedSubmoduleId : !template.submodule_id)
  ));
  const rows = useMemo(() => (
    showArchived
      ? getArchivedRows(archives, modules)
      : getActiveRows(monthData, modules, monthKey)
  ), [archives, monthData, monthKey, modules, showArchived]);
  const archivedKeys = useMemo(() => new Set(
    (archives || []).map((archive) => `${archive.entity_type}:${archive.record_id}:${archive.period_key}`)
  ), [archives]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ar');
    return rows.filter((row) => {
      if (selectedModuleId && row.moduleId !== selectedModuleId) return false;
      if (selectedSubmoduleId && row.submoduleId !== selectedSubmoduleId) return false;
      if (query && !row.searchText.toLocaleLowerCase('ar').includes(query)) return false;
      const rowDate = String(row.date || '').slice(0, 10);
      if (dateFrom && (!rowDate || rowDate < dateFrom)) return false;
      if (dateTo && (!rowDate || rowDate > dateTo)) return false;
      return true;
    });
  }, [dateFrom, dateTo, rows, search, selectedModuleId, selectedSubmoduleId]);
  const selectedRows = filteredRows.filter((row) => selectedKeys.has(row.key));
  const canArchiveSelected = selectedRows.length > 0
    && selectedRows.every((row) => !archivedKeys.has(row.key))
    && (!isReadOnly || selectedRows.every((row) => row.entityType === 'personnel'));

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [dateFrom, dateTo, monthKey, search, selectedModuleId, selectedSubmoduleId, showArchived]);

  function toggleRow(rowKey) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }

  async function archiveSelected() {
    if (!canArchiveSelected) return;
    setBusy(true);
    setError('');
    try {
      await onArchiveRecords(selectedRows.map(({ entityType, recordId }) => ({ entityType, recordId })));
      setSelectedKeys(new Set());
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  async function restore(row) {
    setBusy(true);
    setError('');
    try {
      await onRestoreRecord({ entityType: row.entityType, recordId: row.recordId, periodKey: row.periodKey });
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  const reportTitle = selectedSubmoduleId
    ? visibleSubmodules.find((submodule) => submodule.id === selectedSubmoduleId)?.title
    : selectedModule?.title || 'كل الأقسام';
  const rowsToPrint = selectedRows.length ? selectedRows : filteredRows;
  const tableColumns = useMemo(() => [
    ...(!showArchived ? [{
      key: 'selection',
      label: 'تحديد',
      sortable: false,
      searchable: false,
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedKeys.has(row.key)}
          onChange={() => toggleRow(row.key)}
          disabled={archivedKeys.has(row.key) || (isReadOnly && row.entityType !== 'personnel')}
          title={archivedKeys.has(row.key) ? 'هذا السجل مؤرشف بالفعل.' : undefined}
          aria-label={`تحديد سجل ${row.summary || row.recordId}`}
        />
      )
    }] : []),
    { key: 'moduleTitle', label: 'القسم الرئيسي' },
    { key: 'submoduleTitle', label: 'القسم الفرعي' },
    { key: 'date', label: 'التاريخ', cellClassName: 'whitespace-nowrap', render: (row) => formatDate(row.date) },
    { key: 'summary', label: 'البيانات', cellClassName: 'max-w-2xl whitespace-pre-wrap' },
    ...(showArchived ? [
      { key: 'archivedAt', label: 'أُرشف في', cellClassName: 'whitespace-nowrap', render: (row) => formatDateTime(row.archivedAt) },
      {
        key: 'restore',
        label: 'إجراء',
        sortable: false,
        searchable: false,
        render: (row) => (
          <button
            className="button button-outline !px-3 !py-1.5 text-xs"
            type="button"
            disabled={busy || (isReadOnly && Boolean(row.periodKey))}
            onClick={() => restore(row)}
          >
            استرجاع
          </button>
        )
      }
    ] : [])
  ], [archivedKeys, busy, isReadOnly, restore, selectedKeys, showArchived, toggleRow]);

  return (
    <div className="space-y-4">
      <section className="panel !p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">مركز التقارير والأرشيف</h2>
            <p className="mt-1 text-xs text-slate-500">استعرض بيانات الفترة حسب القسم والنموذج، وابحث أو أرشف سجلات محددة.</p>
          </div>
          <div className="flex gap-2">
            <button className={`button !px-3 !py-2 text-xs ${!showArchived ? 'button-primary' : 'button-outline'}`} type="button" onClick={() => setShowArchived(false)}>السجلات النشطة</button>
            <button className={`button !px-3 !py-2 text-xs ${showArchived ? 'button-primary' : 'button-outline'}`} type="button" onClick={() => setShowArchived(true)}>السجلات المؤرشفة</button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-semibold text-slate-700">
            القسم الرئيسي
            <select className="field mt-1" value={selectedModuleId} onChange={(event) => {
              setSelectedModuleId(event.target.value);
              setSelectedSubmoduleId('');
            }}>
              <option value="">كل الأقسام</option>
              {sectionModules.map((module) => <option value={module.id} key={module.id}>{module.title}{module.is_active === 0 ? ' · مخفي' : ''}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            النموذج الفرعي
            <select className="field mt-1" value={selectedSubmoduleId} onChange={(event) => setSelectedSubmoduleId(event.target.value)} disabled={!selectedModule}>
              <option value="">كل النماذج الفرعية</option>
              {visibleSubmodules.map((submodule) => <option value={submodule.id} key={submodule.id}>{submodule.title}{submodule.is_active === 0 ? ' · مخفي' : ''}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            بحث عام
            <input className="field mt-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="اسم، رقم، بيان..." />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            من تاريخ
            <input className="field mt-1" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            إلى تاريخ
            <input className="field mt-1" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
        </div>

        {selectedModule && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-600">تقرير القسم: <strong>{reportTitle}</strong></p>
            <div className="flex flex-wrap gap-2">
              {selectedModule.id === 'personnel' && (
                <button className="button button-outline !px-3 !py-2 text-xs" type="button" onClick={onExportPersonnelWord}>تصدير كشف الأفراد Word</button>
              )}
              {selectedModule.template_path ? (
                <button className="button button-primary !px-3 !py-2 text-xs" type="button" onClick={() => onExportModuleTemplate(selectedModule.id)}>تصدير تقرير Word</button>
              ) : (
                <button className="button button-outline !px-3 !py-2 text-xs" type="button" onClick={() => onSelectModuleTemplate(selectedModule.id)}>اختيار قالب تقرير Word</button>
              )}
            </div>
          </div>
        )}
        {selectedModule && attachedDocumentTemplates.length > 0 && (
          <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
            <p className="mb-2 text-xs font-bold text-indigo-900">
              القوالب المرتبطة بـ {selectedModule.title}{selectedSubmoduleId ? ` / ${reportTitle}` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {attachedDocumentTemplates.map((template) => (
                <button
                  className="button button-outline !px-3 !py-2 text-xs"
                  type="button"
                  key={template.id}
                  onClick={() => onExportSmartDocument(template.id)}
                >
                  إنشاء Word · {template.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{filteredRows.length} نتيجة · {showArchived ? 'أرشيف السجلات' : 'بيانات الفترة'} {monthKey}</p>
          <div className="flex flex-wrap gap-2">
            <button className="button button-outline !px-3 !py-2 text-xs" type="button" disabled={exportingPdf || rowsToPrint.length === 0} onClick={onPrintReport}>
              {exportingPdf ? 'جارٍ إعداد التقرير...' : selectedRows.length ? `طباعة المحدد (${formatNumber(selectedRows.length)}) / حفظ PDF` : 'طباعة النتائج / حفظ PDF'}
            </button>
            {!showArchived && (
              <button className="button button-outline !px-3 !py-2 text-xs" type="button" disabled={busy || !canArchiveSelected} onClick={archiveSelected}>
                {busy ? 'جارٍ الأرشفة...' : `أرشفة المحدد (${selectedRows.length})`}
              </button>
            )}
            {filteredRows.length > 0 && !showArchived && (
              <button className="button button-outline !px-3 !py-2 text-xs" type="button" onClick={() => setSelectedKeys(new Set(filteredRows.filter((row) => !archivedKeys.has(row.key)).map((row) => row.key)))}>تحديد النتائج</button>
            )}
            {selectedKeys.size > 0 && (
              <button className="button button-outline !px-3 !py-2 text-xs" type="button" onClick={() => setSelectedKeys(new Set())}>إلغاء التحديد</button>
            )}
          </div>
        </div>
        {isReadOnly && !showArchived && <p className="mt-2 text-xs text-amber-700">الفترة للقراءة فقط؛ يمكن أرشفة أو استرجاع سجل الأفراد العام فقط.</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-3">
          <DataTable
            rows={filteredRows}
            columns={tableColumns}
            getRowKey={(row) => row.key}
            searchable={false}
            pageSize={25}
            tableClassName="min-w-[700px]"
            ariaLabel="نتائج التقارير والأرشيف"
            emptyTitle="لا توجد سجلات مطابقة للفلاتر المحددة"
          />
        </div>
      </section>

      <section className="report-print-sheet" dir="rtl">
        <h1>تقرير {reportTitle} · {monthKey}</h1>
        {(search || dateFrom || dateTo) && <p>الفلاتر: {search || 'دون بحث'} · من {dateFrom || '—'} إلى {dateTo || '—'}</p>}
        <table>
          <thead>
            <tr><th>القسم الرئيسي</th><th>القسم الفرعي</th><th>التاريخ</th><th>البيانات</th></tr>
          </thead>
          <tbody>
            {rowsToPrint.map((row) => (
              <tr key={row.key}>
                <td>{row.moduleTitle || '—'}</td>
                <td>{row.submoduleTitle || '—'}</td>
                <td>{formatDate(row.date)}</td>
                <td>{row.summary || row.recordId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
