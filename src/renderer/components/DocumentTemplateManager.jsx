import { useMemo, useState } from 'react';
import RichDocumentEditor, { sanitizeDocumentHtml } from './RichDocumentEditor';
import { useToastErrorState } from './ui/index.jsx';

const STANDARD_PLACEHOLDERS = [
  { key: 'full_name', label: 'الاسم الكامل' },
  { key: 'military_number', label: 'الرقم العسكري' },
  { key: 'rank', label: 'الرتبة' },
  { key: 'category', label: 'الفئة' },
  { key: 'unit', label: 'الوحدة' },
  { key: 'notes', label: 'ملاحظات الفرد' },
  { key: 'monthKey', label: 'الفترة المالية' },
  { key: 'periodStart', label: 'بداية الفترة' },
  { key: 'periodEnd', label: 'نهاية الفترة' },
  { key: 'periodId', label: 'رقم الفترة' },
  { key: 'moduleTitle', label: 'القسم الرئيسي' },
  { key: 'moduleId', label: 'معرّف القسم' },
  { key: 'submoduleTitle', label: 'القسم الفرعي' },
  { key: 'totalRecords', label: 'عدد السجلات' },
  { key: 'records_table', label: 'جدول سجلات القسم' },
  { key: 'organization', label: 'الجهة' },
  { key: 'unit_commander', label: 'قائد الوحدة' },
  { key: 'finance_chief', label: 'مسؤول الماليات' },
  { key: 'software_engineer', label: 'المسؤول الفني' }
];
const MODULE_PLACEHOLDERS = {
  salaries: [
    ['base_salary', 'الراتب الأساسي'], ['allowances', 'البدلات'], ['effective_month', 'شهر الاستحقاق']
  ],
  penalties: [
    ['penalty_type', 'نوع الجزاء'], ['days', 'المدة بالأيام'], ['deduction_amount', 'قيمة الخصم'],
    ['reason', 'سبب الجزاء'], ['action_date', 'تاريخ الجزاء'], ['clause_no', 'رقم البند']
  ],
  supplies: [
    ['order_number', 'رقم أمر التوريد'], ['order_date', 'تاريخ الأمر'], ['supplier', 'المورد'],
    ['description', 'البيان'], ['amount', 'القيمة'], ['status', 'الحالة']
  ],
  invoices: [
    ['invoice_number', 'رقم الفاتورة'], ['invoice_date', 'تاريخ الفاتورة'],
    ['company_name', 'الشركة'], ['grand_total', 'الإجمالي']
  ]
};

export default function DocumentTemplateManager({
  templates,
  modules,
  personnelColumns,
  editorOptions,
  onSave,
  onSetActive,
  onUpdateColumnLabel,
  onClose
}) {
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [submoduleId, setSubmoduleId] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [editorVersion, setEditorVersion] = useState(0);
  const [placeholderLabels, setPlaceholderLabels] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useToastErrorState();
  const activeModule = modules.find((module) => module.id === moduleId);
  const availableSubmodules = activeModule?.submodules || [];
  const availablePlaceholders = useMemo(() => {
    const submodule = availableSubmodules.find((item) => item.id === submoduleId);
    const sectionFields = (submodule ? submodule.fields : []).map((field) => ({
        key: field.key,
        label: `${field.label} · ${submodule.title}`
      }));
    return [
      ...STANDARD_PLACEHOLDERS,
      ...(MODULE_PLACEHOLDERS[activeModule?.id] || []).map(([key, label]) => ({ key, label })),
      ...personnelColumns.map((column) => ({
        key: column.column_key,
        label: `${placeholderLabels[column.column_key] ?? column.placeholder_label} · Excel: ${column.source_header}`
      })),
      ...sectionFields
    ].filter((item, index, list) => list.findIndex((candidate) => candidate.key === item.key) === index);
  }, [activeModule, availableSubmodules, personnelColumns, placeholderLabels, submoduleId]);

  function startNew() {
    setEditorVersion((current) => current + 1);
    setEditingId(null);
    setTitle('');
    setModuleId(modules.find((module) => module.is_active !== 0)?.id || '');
    setSubmoduleId('');
    setContentHtml('<h1>عنوان المستند</h1><p><br></p>');
    setError('');
  }

  function startEdit(template) {
    setEditorVersion((current) => current + 1);
    setEditingId(template.id);
    setTitle(template.title);
    setModuleId(template.module_id);
    setSubmoduleId(template.submodule_id || '');
    setContentHtml(template.content_html);
    setError('');
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const saved = await onSave({
        id: editingId,
        title,
        moduleId,
        submoduleId,
        contentHtml: sanitizeDocumentHtml(contentHtml)
      });
      startEdit(saved);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  async function updatePlaceholderLabel(column) {
    const nextLabel = String(placeholderLabels[column.column_key] ?? column.placeholder_label).trim();
    if (!nextLabel || nextLabel === column.placeholder_label) return;
    setBusy(true);
    setError('');
    try {
      await onUpdateColumnLabel(column.column_key, nextLabel);
      setPlaceholderLabels((current) => ({ ...current, [column.column_key]: nextLabel }));
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(template) {
    setBusy(true);
    setError('');
    try {
      await onSetActive(template.id, template.is_active !== 1);
      if (editingId === template.id && template.is_active === 1) startNew();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="panel !p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">محرر وقوالب المستندات الذكية</h2>
            <p className="mt-1 text-xs text-slate-500">أنشئ قالباً غنياً واربطه بقسم أو نموذج فرعي؛ المتغيرات تحفظ بقيم موحدة من بيانات النظام وأعمدة Excel.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="button button-outline" onClick={startNew}>＋ قالب جديد</button>
            <button type="button" className="button button-outline" onClick={onClose}>إغلاق</button>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <section className="panel space-y-4 !p-4">
        <h3 className="font-bold text-slate-900">{editingId ? 'تعديل القالب' : 'إنشاء قالب مستند'}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-semibold text-slate-700">
            اسم القالب
            <input className="field mt-1" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            القسم الرئيسي
            <select className="field mt-1" value={moduleId} onChange={(event) => {
              setModuleId(event.target.value);
              setSubmoduleId('');
            }}>
              <option value="">اختر القسم</option>
              {modules.map((module) => (
                <option key={module.id} value={module.id}>{module.title}{module.is_active === 0 ? ' · مخفي' : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            ربط بالقسم الفرعي
            <select className="field mt-1" value={submoduleId} disabled={!activeModule} onChange={(event) => setSubmoduleId(event.target.value)}>
              <option value="">القسم الرئيسي بالكامل</option>
              {availableSubmodules.map((submodule) => (
                <option key={submodule.id} value={submodule.id}>{submodule.title}{submodule.is_active === 0 ? ' · مخفي' : ''}</option>
              ))}
            </select>
          </label>
        </div>
        {moduleId && (
          <>
            <RichDocumentEditor
              key={`${editingId || 'new-document-template'}:${editorVersion}`}
              value={contentHtml}
              onChange={setContentHtml}
              placeholders={availablePlaceholders}
              editorOptions={editorOptions}
              disabled={busy}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">يتم إدراج المتغيرات بالضغط على النص داخل المحرر ثم اختيار المتغير من القائمة. استخدم «جدول سجلات القسم» لإضافة جدول البيانات المرتبطة.</p>
              <button type="button" className="button button-primary" onClick={save} disabled={busy || !title.trim() || !moduleId || !contentHtml.trim()}>
                {busy ? 'جارٍ الحفظ...' : editingId ? 'حفظ تعديلات القالب' : 'حفظ القالب'}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel !p-4">
        <h3 className="mb-3 font-bold text-slate-900">أعمدة Excel ومفاتيح المتغيرات</h3>
        <div className="data-table-scroll">
          <table className="data-table min-w-[620px]">
            <thead className="bg-slate-100 text-slate-700">
              <tr><th className="px-3 py-2">عنوان Excel الأصلي</th><th className="px-3 py-2">اسم المتغير في المحرر</th><th className="px-3 py-2">المفتاح الثابت</th><th className="px-3 py-2">إجراء</th></tr>
            </thead>
            <tbody>
              {personnelColumns.map((column) => (
                <tr className="border-b border-slate-100" key={column.column_key}>
                  <td className="px-3 py-2">{column.source_header}</td>
                  <td className="px-3 py-2">
                    <input
                      className="field !py-2"
                      value={placeholderLabels[column.column_key] ?? column.placeholder_label}
                      maxLength={100}
                      onChange={(event) => setPlaceholderLabels((current) => ({ ...current, [column.column_key]: event.target.value }))}
                      aria-label={`اسم متغير ${column.source_header}`}
                    />
                  </td>
                  <td className="px-3 py-2"><code dir="ltr">{`{${column.column_key}}`}</code></td>
                  <td className="px-3 py-2">
                    <button className="button button-outline !min-h-11 !px-3 !py-1 text-xs" type="button" disabled={busy} onClick={() => updatePlaceholderLabel(column)}>حفظ الاسم</button>
                  </td>
                </tr>
              ))}
              {!personnelColumns.length && <tr><td className="px-3 py-6 text-center text-slate-500" colSpan="4">تظهر أعمدة Excel هنا بعد استيراد كشف الأفراد.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel !p-4">
        <h3 className="mb-3 font-bold text-slate-900">القوالب المحفوظة</h3>
        <div className="space-y-2">
          {templates.map((template) => (
            <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3" key={template.id}>
              <div>
                <p className="font-bold text-slate-800">{template.title}</p>
                <p className="mt-1 text-xs text-slate-500">{template.module_title}{template.submodule_title ? ` / ${template.submodule_title}` : ' / القسم بالكامل'}</p>
              </div>
              <div className="flex gap-2">
                <button className="button button-outline !min-h-11 !px-3 !py-1 text-xs" type="button" onClick={() => startEdit(template)}>تعديل</button>
                <button className="button button-outline !min-h-11 !px-3 !py-1 text-xs" type="button" disabled={busy} onClick={() => toggleActive(template)}>
                  {template.is_active === 1 ? 'إخفاء' : 'استعادة'}
                </button>
              </div>
            </article>
          ))}
          {!templates.length && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">لا توجد قوالب محفوظة.</p>}
        </div>
      </section>
    </div>
  );
}
