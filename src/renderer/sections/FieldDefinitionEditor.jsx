import { useState } from 'react';

const defaultFieldTypes = [
  { value: 'text', label: 'نص' },
  { value: 'number', label: 'رقم' },
  { value: 'date', label: 'تاريخ' },
  { value: 'select', label: 'قائمة اختيارات' },
  { value: 'person', label: 'فرد' },
  { value: 'saved_value', label: 'قيمة محفوظة' },
  { value: 'template', label: 'نص جاهز' },
  { value: 'linked_record', label: 'ربط بسجل' },
  { value: 'duration', label: 'مدة بالأيام' },
  { value: 'percentage', label: 'نسبة %' }
];

function createField(key, label = '') {
  return { key, label, type: 'text', options: [], required: false };
}

export default function FieldDefinitionEditor({
  initialTitle = '',
  initialFields = [],
  fieldTypeOptions = [],
  personCategories = [],
  onSave,
  onCancel
}) {
  const [title, setTitle] = useState(initialTitle);
  const [fields, setFields] = useState(() => (
    initialFields.length ? initialFields.map((field) => ({ ...field })) : [createField('field_1')]
  ));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function updateField(index, patch) {
    setFields((current) => current.map((field, itemIndex) => (
      itemIndex === index ? { ...field, ...patch } : field
    )));
  }

  function addField() {
    const nextNumber = fields.reduce((highest, field) => {
      const match = /^field_(\d+)$/.exec(field.key);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    setFields((current) => [...current, createField(`field_${nextNumber}`)]);
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const definitions = fields.map(({ optionsText, ...field }) => ({
        ...field,
        label: field.label.trim(),
        options: field.type === 'select'
          ? String(optionsText ?? field.options?.join(',') ?? '').split(',').map((option) => option.trim()).filter(Boolean)
          : field.options || []
      }));
      await onSave({ title: title.trim(), fields: definitions });
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={submit} dir="rtl">
      <label className="block text-sm font-semibold text-slate-700">
        اسم النموذج الفرعي
        <input className="field mt-2" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required />
      </label>
      <div className="space-y-3">
        {fields.map((field, index) => (
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-2" key={field.key}>
            <label className="text-sm font-medium text-slate-700">
              اسم الحقل
              <input
                className="field mt-1"
                value={field.label}
                onChange={(event) => updateField(index, { label: event.target.value })}
                maxLength={80}
                required
              />
              <span className="mt-1 block text-xs text-slate-600" dir="ltr">{`{${field.key}}`}</span>
            </label>
            <label className="text-sm font-medium text-slate-700">
              نوع الحقل
              <select className="field mt-1" value={field.type || 'text'} onChange={(event) => updateField(index, { type: event.target.value })}>
                {[...(fieldTypeOptions.length ? fieldTypeOptions : defaultFieldTypes),
                  ...(fieldTypeOptions.some((option) => option.value === field.type) ? [] : [{ value: field.type, label: `${field.type} · مستخدم حالياً` }])]
                  .map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>
            {field.type === 'select' && (
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                الاختيارات الثابتة (افصل بينها بفاصلة)
                <input
                  className="field mt-1"
                  value={field.optionsText ?? field.options?.join(', ') ?? ''}
                  onChange={(event) => updateField(index, { optionsText: event.target.value })}
                  placeholder="اختيار أول، اختيار ثان"
                  required
                />
              </label>
            )}
            {field.type === 'person' && (
              <label className="text-sm font-medium text-slate-700">
                الفئة الافتراضية
                <select
                  className="field mt-1"
                  value={field.personCategory || 'all'}
                  onChange={(event) => updateField(index, { personCategory: event.target.value })}
                >
                  {[
                    ...personCategories,
                    ...(field.personCategory && !personCategories.some((option) => option.value === field.personCategory)
                      ? [{ value: field.personCategory, label: field.personCategory }]
                      : [])
                  ].map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                </select>
              </label>
            )}
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={Boolean(field.required)} onChange={(event) => updateField(index, { required: event.target.checked })} />
                مطلوب
              </label>
              <button
                className="button button-outline !px-3 !py-1.5 text-xs text-rose-700"
                type="button"
                onClick={() => setFields((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                disabled={fields.length <= 1}
              >
                إزالة الحقل
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="button button-outline" type="button" onClick={addField} disabled={fields.length >= 100}>إضافة حقل</button>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ...' : 'حفظ النموذج'}</button>
        <button className="button button-outline" type="button" onClick={onCancel}>إلغاء</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </form>
  );
}
