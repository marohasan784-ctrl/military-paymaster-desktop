import { useMemo, useState } from 'react';
import { renderTextTemplate } from '../../services/textTemplate.js';
import { useToastErrorState } from './ui/index.jsx';

export default function TemplatePicker({
  templates,
  scope,
  kind = '',
  kindLabel = '',
  actionTypes = [],
  value,
  onSelect,
  onAdd,
  onOther,
  previewValues = {},
  disabled = false
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useToastErrorState();
  const [draft, setDraft] = useState({
    scope,
    kind,
    title: '',
    body: '',
    requiresDays: true,
    sortOrder: 100
  });
  const selectedTemplate = useMemo(
    () => templates.find((template) => Number(template.id) === Number(value)) ?? null,
    [templates, value]
  );
  const choices = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('ar');
    return templates.filter((template) => (
      template.is_active === 1
      && (template.scope === scope || template.scope === 'global')
      && (!kind || !template.kind || template.kind === kind || template.kind_label === kindLabel)
      && (!search || `${template.title} ${template.body}`.toLocaleLowerCase('ar').includes(search))
    ));
  }, [kind, kindLabel, query, scope, templates]);
  const selectedKindLabel = actionTypes.find((type) => type.value === (draft.kind || kind))?.label || kindLabel;

  function updateDraft(key, nextValue) {
    setDraft((current) => ({ ...current, [key]: nextValue }));
  }

  async function saveDraft() {
    setError('');
    setSaving(true);
    try {
      const created = await onAdd({
        ...draft,
        scope: draft.scope,
        kind: draft.kind || kind,
        requiresDays: Number(draft.requiresDays),
        sortOrder: Number(draft.sortOrder)
      });
      onSelect(created);
      setAdding(false);
      setDraft((current) => ({ ...current, title: '', body: '' }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2" dir="rtl">
      <div className="relative">
        <input
          className="field"
          value={selectedTemplate?.title || query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            if (selectedTemplate) onSelect(null);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 120)}
          placeholder="ابحث واختر نصاً جاهزاً"
          autoComplete="off"
          disabled={disabled}
          aria-label="البحث في مكتبة النصوص"
        />
        {isOpen && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            {choices.map((template) => (
              <button
                type="button"
                key={template.id}
                className="block w-full rounded-lg px-3 py-2 text-right text-xs hover:bg-indigo-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(template);
                  setQuery('');
                  setIsOpen(false);
                }}
              >
                <span className="block font-bold text-slate-800">{template.title}</span>
                <span className="mt-1 block line-clamp-2 font-normal text-slate-500">{template.body}</span>
              </button>
            ))}
            {onOther && (
              <button
                type="button"
                className="block w-full rounded-lg px-3 py-2 text-right text-xs font-bold text-amber-800 hover:bg-amber-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onOther();
                  setIsOpen(false);
                  setQuery('');
                }}
              >
                أخرى - نص حر
              </button>
            )}
            {!choices.length && (
              <p className="px-3 py-2 text-xs text-slate-500">لا توجد نصوص مطابقة لهذا النطاق.</p>
            )}
          </div>
        )}
      </div>
      {selectedTemplate && (
        <p className="rounded-lg bg-indigo-50 p-3 text-xs font-normal leading-6 text-indigo-950">
          {renderTextTemplate(selectedTemplate.body, previewValues)}
        </p>
      )}
      {onAdd && (
        <div>
          <button
            type="button"
            className="button button-outline min-h-11 px-3 py-1.5 text-xs"
            onClick={() => {
              const nextOrder = Math.max(0, ...templates.map((template) => Number(template.sort_order) || 0)) + 1;
              setDraft({
                scope,
                kind,
                title: '',
                body: '',
                requiresDays: true,
                sortOrder: nextOrder
              });
              setAdding((current) => !current);
              setError('');
            }}
            disabled={disabled}
          >
            {adding ? 'إغلاق إضافة النص' : '＋ إضافة نص جديد'}
          </button>
          {adding && (
            <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700">
                  النطاق
                  <select className="field mt-1" value={draft.scope} onChange={(event) => updateDraft('scope', event.target.value)}>
                    <option value={scope}>{scope === 'penalties' ? 'الجزاءات' : 'هذا القسم'}</option>
                    {scope !== 'global' && <option value="global">عام ومشترك</option>}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  النوع
                  <select className="field mt-1" value={draft.kind} onChange={(event) => updateDraft('kind', event.target.value)}>
                    <option value="">عام</option>
                    {actionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                  العنوان
                  <input className="field mt-1" value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} maxLength={120} />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-700">
                نص القالب
                <textarea className="field mt-1 min-h-24" value={draft.body} onChange={(event) => updateDraft('body', event.target.value)} maxLength={4000} />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={draft.requiresDays} onChange={(event) => updateDraft('requiresDays', event.target.checked)} />
                يتطلب مدة بالأيام
              </label>
              <p className="text-xs font-normal leading-6 text-slate-500">
                العناصر المتاحة: {'{الاسم}'}، {'{الرتبة}'}، {'{الرقم_العسكري}'}، {'{المدة}'}، {'{رقم_البند}'}، {'{التاريخ}'}، وحقول هذا القسم بصيغة {'{اسم_الحقل}'}.
              </p>
              <div className="rounded-lg border border-indigo-100 bg-white p-3 text-sm leading-7 text-indigo-950">
                {renderTextTemplate(draft.body, {
                  ...previewValues,
                  requiresDays: draft.requiresDays,
                  kind: selectedKindLabel || draft.kind || kind
                })}
              </div>
              {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
              <button
                type="button"
                className="button button-primary"
                onClick={saveDraft}
                disabled={saving || disabled || !draft.title.trim() || !draft.body.trim()}
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ النص واختياره'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
