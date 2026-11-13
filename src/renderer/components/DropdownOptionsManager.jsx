import { useMemo, useState } from 'react';
import { useToastErrorState } from './ui/index.jsx';

const OPTION_GROUPS = [
  { id: 'action_type', title: 'أنواع الإجراءات', scoped: true, canAdd: true },
  { id: 'field_type', title: 'أنواع الحقول' },
  { id: 'paragraph_format', title: 'تنسيقات الفقرات' },
  { id: 'document_font', title: 'الخطوط' },
  { id: 'document_font_size', title: 'أحجام الخطوط' },
  { id: 'invoice_template', title: 'تصميم الفاتورة' }
];
const NON_ACTION_MODULES = new Set(['home', 'personnel', 'salaries', 'supplies', 'invoices', 'templates']);

export default function DropdownOptionsManager({
  modules,
  options,
  onAdd,
  onRename,
  onSetActive,
  onReorder,
  onClose
}) {
  const actionModules = modules.filter((module) => !NON_ACTION_MODULES.has(module.id));
  const [groupId, setGroupId] = useState('action_type');
  const [scopeId, setScopeId] = useState(() => actionModules.find((module) => module.id === 'penalties')?.id || actionModules[0]?.id || '');
  const [newLabel, setNewLabel] = useState('');
  const [labels, setLabels] = useState({});
  const [error, setError] = useToastErrorState();
  const [busy, setBusy] = useState(false);
  const group = OPTION_GROUPS.find((item) => item.id === groupId);
  const rows = useMemo(() => options
    .filter((option) => option.group_id === groupId && option.scope_id === (group?.scoped ? scopeId : ''))
    .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label, 'ar')),
  [group, groupId, options, scopeId]);

  async function run(operation) {
    setError('');
    setBusy(true);
    try {
      await operation();
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  async function addOption(event) {
    event.preventDefault();
    await run(async () => {
      await onAdd({ moduleId: scopeId, label: newLabel });
      setNewLabel('');
    });
  }

  async function move(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    const optionIds = rows.map((row) => row.option_id);
    [optionIds[index], optionIds[target]] = [optionIds[target], optionIds[index]];
    await run(() => onReorder({ groupId, scopeId: group?.scoped ? scopeId : '', optionIds }));
  }

  return (
    <section className="panel space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة القوائم والخيارات</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            قوائم الإجراءات مستقلة لكل قسم ويمكن إضافة خياراتها أو تعديلها أو إخفاؤها. الخيارات التقنية قابلة لإعادة التسمية والترتيب والإخفاء دون تغيير قيمها البرمجية.
          </p>
        </div>
        <button className="button button-outline" type="button" onClick={onClose}>إغلاق</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">
          القائمة
          <select className="field mt-1" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            {OPTION_GROUPS.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
          </select>
        </label>
        {group?.scoped && (
          <label className="text-xs font-semibold text-slate-700">
            القسم
            <select className="field mt-1" value={scopeId} onChange={(event) => setScopeId(event.target.value)}>
              {actionModules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}
            </select>
          </label>
        )}
      </div>

      {group?.canAdd && (
        <form className="flex flex-wrap gap-2" onSubmit={addOption}>
          <input
            className="field min-w-56 flex-1"
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            maxLength={80}
            placeholder="اسم نوع إجراء جديد"
            required
            disabled={busy || !scopeId}
          />
          <button className="button button-primary" type="submit" disabled={busy || !scopeId || !newLabel.trim()}>
            إضافة للقسم المحدد
          </button>
        </form>
      )}

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      <div className="space-y-2">
        {rows.map((option, index) => (
          <div className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${option.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`} key={option.option_id}>
            <input
              className="field min-w-48 flex-1"
              value={labels[option.option_id] ?? option.label}
              onChange={(event) => setLabels((current) => ({ ...current, [option.option_id]: event.target.value }))}
              maxLength={80}
              aria-label={`اسم الخيار ${option.label}`}
              disabled={busy}
            />
            {option.is_system === 1 && <span className="text-xs text-slate-600">قيمة تقنية ثابتة</span>}
            <button
              className="button button-outline !px-3 !py-1.5 text-xs"
              type="button"
              disabled={busy || !(labels[option.option_id] ?? option.label).trim() || (labels[option.option_id] ?? option.label) === option.label}
              onClick={() => run(async () => {
                await onRename(option.option_id, labels[option.option_id] ?? option.label);
                setLabels((current) => ({ ...current, [option.option_id]: labels[option.option_id] ?? option.label }));
              })}
            >
              حفظ الاسم
            </button>
            <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`تحريك ${option.label} لأعلى`}>↑</button>
            <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" disabled={busy || index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`تحريك ${option.label} لأسفل`}>↓</button>
            <button
              className={`button !px-3 !py-1.5 text-xs ${option.is_active ? 'button-outline text-rose-700' : 'button-primary'}`}
              type="button"
              disabled={busy}
              onClick={() => run(() => onSetActive(option.option_id, !option.is_active))}
            >
              {option.is_active ? 'إخفاء' : 'إظهار'}
            </button>
          </div>
        ))}
        {!rows.length && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">لا توجد خيارات في هذه القائمة.</p>}
      </div>
    </section>
  );
}
