import { useState } from 'react';
import FieldDefinitionEditor from './FieldDefinitionEditor';
import { Badge, ConfirmDialog, Modal, useToastErrorState } from '../components/ui/index.jsx';

const configurableCoreModules = new Set(['accessions', 'deletions', 'penalties']);

export default function SectionManager({
  modules,
  onRename,
  onArchive,
  onRestore,
  onReorder,
  onCopy,
  onExport,
  onPreviewImport,
  onImport,
  onAddSubmodule,
  onUpdateSubmodule,
  onArchiveSubmodule,
  onDeleteSubmodule,
  onRestoreSubmodule,
  fieldTypeOptions,
  personCategories,
  onClose
}) {
  const [editingModuleId, setEditingModuleId] = useState(null);
  const [moduleTitles, setModuleTitles] = useState({});
  const [copyTitles, setCopyTitles] = useState({});
  const [editingSubmodule, setEditingSubmodule] = useState(null);
  const [editingSubmoduleNameId, setEditingSubmoduleNameId] = useState(null);
  const [submoduleNames, setSubmoduleNames] = useState({});
  const [creatingSubmoduleFor, setCreatingSubmoduleFor] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [confirmingSubmodule, setConfirmingSubmodule] = useState(null);
  const [importTitle, setImportTitle] = useState('');
  const [error, setError] = useToastErrorState();
  const [busy, setBusy] = useState(false);
  const configurableModules = modules.filter((module) => module.is_builtin === 0 || configurableCoreModules.has(module.id));

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

  async function previewImport() {
    await run(async () => {
      const result = await onPreviewImport();
      if (result.canceled) return;
      setPendingImport(result);
      setImportTitle(result.preview.title);
    });
  }

  async function confirmImport() {
    if (!pendingImport) return;
    await run(async () => {
      await onImport(pendingImport.definition, importTitle.trim());
      setPendingImport(null);
      setImportTitle('');
    });
  }

  async function moveModule(moduleId, offset) {
    const currentIndex = configurableModules.findIndex((module) => module.id === moduleId);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= configurableModules.length) return;
    const orderedModuleIds = configurableModules.map((module) => module.id);
    [orderedModuleIds[currentIndex], orderedModuleIds[targetIndex]] = [
      orderedModuleIds[targetIndex],
      orderedModuleIds[currentIndex]
    ];
    await run(() => onReorder(orderedModuleIds));
  }

  return (
    <section className="panel space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة الأقسام والنماذج</h2>
          <p className="mt-1 text-sm text-slate-500">أضف نماذج وحقولاً، وأنشئ الأقسام أو أخفها وأعد ترتيبها. إخفاء القسم يحتفظ بسجلاته ويمكن التراجع عنه.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button button-outline" type="button" onClick={previewImport} disabled={busy}>استيراد تعريف JSON</button>
          <button className="button button-outline" type="button" onClick={onClose}>إغلاق</button>
        </div>
      </div>

      {pendingImport && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-bold text-amber-950">معاينة الاستيراد</h3>
          <p className="mt-1 text-sm text-amber-900">
            {pendingImport.preview.submoduleCount} نماذج فرعية · {pendingImport.preview.fieldCount} حقول · {pendingImport.preview.templateCount} نصوص جاهزة
          </p>
          {pendingImport.preview.nameConflict && (
            <p className="mt-1 text-sm text-rose-700">يوجد قسم بالاسم نفسه؛ غيّر الاسم قبل التأكيد لتجنب التعارض.</p>
          )}
          <label className="mt-3 block text-sm font-medium text-slate-700">
            اسم القسم بعد الاستيراد
            <input className="field mt-1" value={importTitle} onChange={(event) => setImportTitle(event.target.value)} maxLength={80} />
          </label>
          <div className="mt-3 flex gap-2">
            <button className="button button-primary" type="button" disabled={busy || !importTitle.trim()} onClick={confirmImport}>تأكيد الاستيراد</button>
            <button className="button button-outline" type="button" onClick={() => setPendingImport(null)}>إلغاء</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {configurableModules.map((module, moduleIndex) => (
          <article className={`rounded-xl border p-4 ${module.is_active === 0 ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`} key={module.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span aria-hidden="true">{module.icon || '▦'}</span>
                {module.is_builtin === 1 ? (
                  <>
                    <h3 className="truncate font-bold text-slate-800">{module.title}</h3>
                    <Badge variant="gold">قسم أساسي</Badge>
                  </>
                ) : editingModuleId === module.id ? (
                  <input
                    className="field max-w-sm"
                    value={moduleTitles[module.id] ?? module.title}
                    onChange={(event) => setModuleTitles((current) => ({ ...current, [module.id]: event.target.value }))}
                    maxLength={80}
                  />
                ) : <h3 className="truncate font-bold text-slate-800">{module.title}</h3>}
                {module.is_active === 0 && <span className="text-xs text-slate-500">مخفي</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {module.is_builtin === 1 ? (
                  module.is_active === 0
                    ? <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" disabled={busy} onClick={() => run(() => onRestore(module.id))}>إظهار القسم</button>
                    : <button className="button button-outline !px-3 !py-1.5 text-xs text-rose-700" type="button" disabled={busy} onClick={() => run(() => onArchive(module.id))}>إخفاء القسم</button>
                ) : editingModuleId === module.id ? (
                  <>
                    <button className="button button-primary !px-3 !py-1.5 text-xs" type="button" disabled={busy} onClick={() => run(async () => {
                      await onRename(module.id, moduleTitles[module.id] ?? module.title);
                      setEditingModuleId(null);
                    })}>حفظ الاسم</button>
                    <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" onClick={() => setEditingModuleId(null)}>إلغاء</button>
                  </>
                ) : (
                  <>
                    <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" onClick={() => setEditingModuleId(module.id)}>إعادة تسمية</button>
                    <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" onClick={() => run(() => onExport(module.id))}>تصدير JSON</button>
                    <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" disabled={busy || !copyTitles[module.id]?.trim()} onClick={() => run(async () => {
                      await onCopy(module.id, copyTitles[module.id]);
                      setCopyTitles((current) => ({ ...current, [module.id]: '' }));
                    })}>نسخ القسم</button>
                    {module.is_active === 0
                      ? <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" disabled={busy} onClick={() => run(() => onRestore(module.id))}>إظهار</button>
                      : <button className="button button-outline !px-3 !py-1.5 text-xs text-rose-700" type="button" disabled={busy} onClick={() => run(() => onArchive(module.id))}>إخفاء</button>}
                  </>
                )}
                <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" disabled={busy || moduleIndex === 0} onClick={() => moveModule(module.id, -1)} aria-label={`نقل ${module.title} لأعلى`}>↑ لأعلى</button>
                <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" disabled={busy || moduleIndex === configurableModules.length - 1} onClick={() => moveModule(module.id, 1)} aria-label={`نقل ${module.title} لأسفل`}>↓ لأسفل</button>
              </div>
            </div>
            {module.is_builtin !== 1 && module.is_active !== 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="field max-w-sm"
                  placeholder="اسم النسخة الجديدة"
                  value={copyTitles[module.id] || ''}
                  onChange={(event) => setCopyTitles((current) => ({ ...current, [module.id]: event.target.value }))}
                />
              </div>
            )}

            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
              {module.submodules.map((submodule) => (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3" key={submodule.id}>
                  <div>
                    {editingSubmoduleNameId === submodule.id ? (
                      <input
                        className="field max-w-sm"
                        value={submoduleNames[submodule.id] ?? submodule.title}
                        onChange={(event) => setSubmoduleNames((current) => ({ ...current, [submodule.id]: event.target.value }))}
                        maxLength={80}
                        aria-label={`اسم القسم الفرعي ${submodule.title}`}
                        disabled={busy}
                      />
                    ) : (
                      <p className="font-semibold text-slate-700">{submodule.title}{submodule.is_active === 0 ? ' · مخفي' : ''}</p>
                    )}
                    <p className="text-xs text-slate-500">{submodule.fields.length} حقول · إصدار تعريف {submodule.fieldsVersion || 1}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingSubmoduleNameId === submodule.id ? (
                      <>
                        <button
                          className="button button-primary !px-3 !py-1.5 text-xs"
                          type="button"
                          disabled={busy || !(submoduleNames[submodule.id] ?? submodule.title).trim()
                            || (submoduleNames[submodule.id] ?? submodule.title).trim() === submodule.title}
                          onClick={() => run(async () => {
                            await onUpdateSubmodule(submodule.id, {
                              title: submoduleNames[submodule.id] ?? submodule.title,
                              fields: submodule.fields
                            });
                            setEditingSubmoduleNameId(null);
                          })}
                        >
                          حفظ الاسم
                        </button>
                        <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" onClick={() => setEditingSubmoduleNameId(null)}>إلغاء</button>
                      </>
                    ) : (
                      <>
                        <button
                          className="button button-outline !px-3 !py-1.5 text-xs"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setSubmoduleNames((current) => ({ ...current, [submodule.id]: submodule.title }));
                            setEditingSubmoduleNameId(submodule.id);
                          }}
                        >
                          تغيير الاسم
                        </button>
                        {submodule.is_active !== 0 && (
                          <>
                            <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" onClick={() => setEditingSubmodule(submodule)}>تعديل الحقول</button>
                            <button className="button button-outline !px-3 !py-1.5 text-xs text-rose-700" type="button" disabled={busy} onClick={() => run(() => onArchiveSubmodule(submodule.id))}>إخفاء النموذج</button>
                          </>
                        )}
                        {submodule.is_active === 0 && (
                          <button className="button button-outline !px-3 !py-1.5 text-xs" type="button" disabled={busy} onClick={() => run(() => onRestoreSubmodule(submodule.id))}>إظهار النموذج</button>
                        )}
                        <button
                          className="button button-outline !px-3 !py-1.5 text-xs text-rose-700"
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmingSubmodule(submodule)}
                        >
                          حذف نهائي
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {creatingSubmoduleFor === module.id ? (
                <FieldDefinitionEditor
                  key={`new-${module.id}`}
                  fieldTypeOptions={fieldTypeOptions}
                  personCategories={personCategories}
                  onCancel={() => setCreatingSubmoduleFor(null)}
                  onSave={(input) => run(async () => {
                    await onAddSubmodule(module.id, input);
                    setCreatingSubmoduleFor(null);
                  })}
                />
              ) : (
                <button className="button button-outline mt-2" type="button" onClick={() => setCreatingSubmoduleFor(module.id)}>إضافة نموذج فرعي</button>
              )}
            </div>
          </article>
        ))}
      </div>

      <Modal
        open={Boolean(editingSubmodule)}
        title={editingSubmodule ? `تعديل «${editingSubmodule.title}»` : ''}
        onClose={() => {
          if (!busy) setEditingSubmodule(null);
        }}
        closeOnEscape={!busy}
      >
        {editingSubmodule && (
            <FieldDefinitionEditor
              key={editingSubmodule.id}
              initialTitle={editingSubmodule.title}
              initialFields={editingSubmodule.fields}
              fieldTypeOptions={fieldTypeOptions}
              personCategories={personCategories}
              onCancel={() => setEditingSubmodule(null)}
              onSave={(input) => run(async () => {
                await onUpdateSubmodule(editingSubmodule.id, input);
                setEditingSubmodule(null);
              })}
            />
        )}
      </Modal>
      <ConfirmDialog
        open={Boolean(confirmingSubmodule)}
        title="حذف القسم الفرعي نهائياً؟"
        description={confirmingSubmodule
          ? `سيؤدي حذف «${confirmingSubmodule.title}» إلى حذف سجلاته الحالية وقوالبه والنصوص الجاهزة المرتبطة به. ستبقى النسخ الأرشيفية التاريخية دون تغيير.`
          : ''}
        confirmLabel="حذف نهائي"
        busy={busy}
        onCancel={() => {
          if (!busy) setConfirmingSubmodule(null);
        }}
        onConfirm={() => run(async () => {
          if (!confirmingSubmodule) return;
          await onDeleteSubmodule(confirmingSubmodule.id);
          setConfirmingSubmodule(null);
        })}
      />
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
