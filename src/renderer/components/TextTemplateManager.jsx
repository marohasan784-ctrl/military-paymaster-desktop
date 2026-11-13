import { useState } from 'react';
import { renderTextTemplate } from '../../services/textTemplate.js';
import { Badge, Checkbox, ConfirmDialog, Input, Select, Textarea, useToastErrorState } from './ui/index.jsx';

export default function TextTemplateManager({ templates, modules, actionTypesByModule = {}, onUpdate, onArchive, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useToastErrorState();
  const [busy, setBusy] = useState(false);
  const [pendingArchive, setPendingArchive] = useState(null);
  const scopes = [
    { id: 'global', title: 'عام' },
    { id: 'penalties', title: 'الجزاءات' },
    ...modules.flatMap((module) => module.submodules.map((submodule) => ({
      id: submodule.id,
      title: `${module.title} / ${submodule.title}`
    })))
  ];
  function getActionTypes(scopeId) {
    if (scopeId === 'global') {
      const unique = new Map(Object.values(actionTypesByModule).flat().map((option) => [option.value, option]));
      return [...unique.values()];
    }
    if (scopeId === 'penalties') return actionTypesByModule.penalties || [];
    const module = modules.find((item) => item.submodules.some((submodule) => submodule.id === scopeId));
    return actionTypesByModule[module?.id] || [];
  }
  function beginEdit(template) {
    setEditingId(template.id);
    setDraft({
      ...template,
      requiresDays: Boolean(template.requires_days),
      sortOrder: template.sort_order
    });
    setError('');
  }

  function updateDraft(key, nextValue) {
    setDraft((current) => ({ ...current, [key]: nextValue }));
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      await onUpdate({
        ...draft,
        requiresDays: Number(draft.requiresDays),
        sortOrder: Number(draft.sortOrder)
      });
      setEditingId(null);
      setDraft(null);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  function archive(template) {
    setPendingArchive(template);
  }

  async function confirmArchive() {
    if (!pendingArchive) return;
    setBusy(true);
    setError('');
    try {
      await onArchive(pendingArchive.id);
      setPendingArchive(null);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">مكتبة النصوص الجاهزة</h2>
          <p className="mt-1 text-xs text-slate-500">تعديل المكتبة أو إخفاء نص لا يغيّر السجلات السابقة.</p>
        </div>
        <button type="button" className="button button-outline" onClick={onClose}>إغلاق المكتبة</button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="space-y-3">
        {templates.map((template) => (
          <article className="rounded-xl border border-slate-200 p-4" key={template.id}>
            {editingId === template.id ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-700">
                  النطاق
                  <Select className="mt-1" value={draft.scope} onChange={(event) => updateDraft('scope', event.target.value)} disabled={busy}>
                    {scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.title}</option>)}
                  </Select>
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  النوع
                  <Select className="mt-1" value={draft.kind} onChange={(event) => updateDraft('kind', event.target.value)} disabled={busy}>
                    <option value="">عام</option>
                    {[
                      ...getActionTypes(draft.scope),
                      ...(draft.kind && !getActionTypes(draft.scope).some((type) => type.value === draft.kind)
                        ? [{ value: draft.kind, label: `${draft.kind_label || draft.kind} · محفوظ سابقاً` }]
                        : [])
                    ].map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </Select>
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  العنوان
                  <Input className="mt-1" value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} maxLength={120} disabled={busy} />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  الترتيب
                  <Input className="mt-1" type="number" min="0" max="100000" value={draft.sortOrder} onChange={(event) => updateDraft('sortOrder', event.target.value)} disabled={busy} />
                </label>
                <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                  النص
                  <Textarea className="mt-1 min-h-24" value={draft.body} onChange={(event) => updateDraft('body', event.target.value)} maxLength={4000} disabled={busy} />
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 sm:col-span-2">
                  <Checkbox checked={draft.requiresDays} onChange={(event) => updateDraft('requiresDays', event.target.checked)} disabled={busy} />
                  يتطلب مدة بالأيام
                </label>
                <div className="rounded-lg bg-indigo-50 p-3 text-sm leading-7 text-indigo-950 sm:col-span-2">
                  {renderTextTemplate(draft.body, {})}
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <button type="button" className="button button-primary" onClick={save} disabled={busy || !draft.title.trim() || !draft.body.trim()}>حفظ التعديل</button>
                  <button type="button" className="button button-outline" onClick={() => setEditingId(null)} disabled={busy}>إلغاء</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-800">{template.title}</h3>
                    <Badge variant="neutral">
                      {scopes.find((scope) => scope.id === template.scope)?.title || template.scope}
                    </Badge>
                    {template.kind && <Badge variant="gold">{template.kind_label || template.kind}</Badge>}
                    {!template.is_active && <Badge variant="danger">مخفي</Badge>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{template.body}</p>
                  <p className="mt-1 text-xs text-slate-600">الترتيب: {template.sort_order} · {template.requires_days ? 'يتطلب مدة' : 'بدون مدة'}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="button button-outline min-h-11 px-3 py-1.5 text-xs" onClick={() => beginEdit(template)} disabled={busy}>تعديل</button>
                  {template.is_active === 1 && (
                    <button type="button" className="button min-h-11 border border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50" onClick={() => archive(template)} disabled={busy}>إخفاء</button>
                  )}
                </div>
              </div>
            )}
          </article>
        ))}
        {!templates.length && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">لا توجد نصوص محفوظة في المكتبة.</p>}
      </div>
      <ConfirmDialog
        open={Boolean(pendingArchive)}
        title="إخفاء النص الجاهز؟"
        description={pendingArchive ? `سيُخفى «${pendingArchive.title}» من القوائم، من دون تغيير السجلات السابقة.` : ''}
        confirmLabel="إخفاء النص"
        busy={busy}
        onCancel={() => {
          if (!busy) setPendingArchive(null);
        }}
        onConfirm={confirmArchive}
      />
    </section>
  );
}
