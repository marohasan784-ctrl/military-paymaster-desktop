import { useEffect, useMemo } from 'react';
import PersonPicker from './PersonPicker';
import TemplatePicker from './TemplatePicker';
import { renderTextTemplate } from '../../services/textTemplate.js';

export default function PenaltyForm({
  value,
  onChange,
  personnel,
  textTemplates = [],
  onAddTextTemplate,
  scope = 'penalties',
  fields = [],
  fieldValues = {},
  actionTypes = [],
  monthKey,
  disabled = false,
  showPersonnel = true,
  showClauseNo = true
}) {
  const person = useMemo(
    () => personnel.find((entry) => entry.military_number === value.militaryNumber),
    [personnel, value.militaryNumber]
  );
  const selectedTemplate = useMemo(
    () => textTemplates.find((template) => Number(template.id) === Number(value.textTemplateId)) ?? null,
    [textTemplates, value.textTemplateId]
  );
  const activeTemplates = useMemo(() => textTemplates.filter((template) => (
    template.is_active === 1
    && (template.scope === scope || template.scope === 'global')
    && (!value.penaltyType || !template.kind || template.kind === value.penaltyType || template.kind_label === actionTypes.find((type) => type.value === value.penaltyType)?.label)
  )), [actionTypes, scope, textTemplates, value.penaltyType]);
  const [year, month] = (monthKey || '').split('-').map(Number);
  const daysInMonth = year && month ? new Date(year, month, 0).getDate() : null;
  const requiresDays = selectedTemplate
    ? selectedTemplate.requires_days === 1
    : value.textTemplateId === 'other';

  useEffect(() => {
    if (!actionTypes.length || actionTypes.some((type) => type.value === value.penaltyType)) return;
    onChange({
      ...value,
      penaltyType: actionTypes[0].value,
      textTemplateId: '',
      reason: '',
      reasonManuallyEdited: false
    });
  }, [actionTypes, onChange, value]);

  function templateValues(template, draft = value) {
    const typeLabel = actionTypes.find((type) => type.value === draft.penaltyType)?.label || draft.penaltyType || '';
    const duration = template.requires_days
      ? `${draft.days ?? 0} يوم${typeLabel ? ` ${typeLabel}` : ''}`
      : '';
    const customValues = Object.fromEntries(fields.map((field) => [
      field.key,
      fieldValues[field.key] ?? ''
    ]));
    for (const field of fields) customValues[field.label] = fieldValues[field.key] ?? '';
    return {
      ...customValues,
      name: person?.full_name || '',
      rank: person?.rank || '',
      militaryNumber: person?.military_number || '',
      days: draft.days,
      duration,
      requiresDays: Boolean(template.requires_days),
      kind: typeLabel,
      reason: template.title,
      clauseNo: draft.clauseNo || '',
      date: draft.actionDate || '',
      generatedText: `تجازى المذكور ${duration || '…'} نظير ${template.title} بتاريخ ${draft.actionDate || '…'} بند رقم ${draft.clauseNo || '—'}`
    };
  }

  function update(key, nextValue) {
    const next = { ...value, [key]: nextValue };
    if (selectedTemplate && !value.reasonManuallyEdited) {
      next.reason = renderTextTemplate(selectedTemplate.body, templateValues(selectedTemplate, next));
    }
    onChange(next);
  }

  function selectTemplate(template) {
    if (!template) {
      onChange({ ...value, textTemplateId: '', reason: '', reasonManuallyEdited: false });
      return;
    }
    const next = {
      ...value,
      textTemplateId: template.id,
      reasonManuallyEdited: false,
      days: template.requires_days ? value.days : '0'
    };
    next.reason = renderTextTemplate(template.body, templateValues(template, next));
    onChange(next);
  }

  function selectFreeText() {
    onChange({
      ...value,
      textTemplateId: 'other',
      reason: '',
      reasonManuallyEdited: false,
      days: '0'
    });
  }

  useEffect(() => {
    if (!selectedTemplate || value.reasonManuallyEdited) return;
    const generated = renderTextTemplate(selectedTemplate.body, templateValues(selectedTemplate));
    if (generated !== value.reason) onChange({ ...value, reason: generated });
  }, [fields, fieldValues, onChange, person, selectedTemplate, value, value.reasonManuallyEdited]);

  function previewValues(template) {
    return templateValues(template, value);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {showPersonnel && (
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
          الفرد المرتبط
          <PersonPicker
            persons={personnel}
            value={value.militaryNumber || ''}
            onChange={(selected) => update('militaryNumber', selected?.military_number || '')}
            disabled={disabled}
            placeholder="ابحث عن الفرد بالاسم أو الرقم العسكري"
          />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
        نوع الإجراء / الجزاء
        <select
          className="field"
          value={value.penaltyType || actionTypes[0]?.value || ''}
          onChange={(event) => onChange({
            ...value,
            penaltyType: event.target.value,
            textTemplateId: '',
            reason: '',
            reasonManuallyEdited: false,
            days: ''
          })}
          disabled={disabled}
        >
          {actionTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </label>
      <div className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
        <span>السبب / النص الجاهز</span>
        <TemplatePicker
          templates={activeTemplates}
          scope={scope}
          kind={value.penaltyType || ''}
          kindLabel={actionTypes.find((type) => type.value === value.penaltyType)?.label || ''}
          value={selectedTemplate?.id}
          onSelect={selectTemplate}
          onAdd={onAddTextTemplate}
          onOther={selectFreeText}
          actionTypes={actionTypes}
          previewValues={selectedTemplate ? previewValues(selectedTemplate) : {
            ...templateValues({ requires_days: requiresDays ? 1 : 0 }),
            ...Object.fromEntries(fields.map((field) => [field.key, fieldValues[field.key] ?? '']))
          }}
          disabled={disabled}
        />
      </div>
      {requiresDays && (
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
          المدة بالأيام
          <input
            className="field"
            type="number"
            min="0"
            max="36500"
            step="1"
            value={value.days ?? ''}
            onChange={(event) => update('days', event.target.value)}
            required
            disabled={disabled}
          />
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
        تاريخ الإجراء
        <input
          className="field"
          type="date"
          min={monthKey ? `${monthKey}-01` : undefined}
          max={daysInMonth ? `${monthKey}-${String(daysInMonth).padStart(2, '0')}` : undefined}
          value={value.actionDate || ''}
          onChange={(event) => update('actionDate', event.target.value)}
          required
          disabled={disabled}
        />
      </label>
      {showClauseNo && (
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
          رقم بند الأمر <span className="text-rose-600">*</span>
          <input
            className="field"
            value={value.clauseNo || ''}
            onChange={(event) => update('clauseNo', event.target.value)}
            maxLength={100}
            required
            disabled={disabled}
          />
        </label>
      )}
      {(selectedTemplate || value.textTemplateId === 'other') && (
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700 sm:col-span-2 xl:col-span-3">
          النص النهائي لهذا السجل (التعديل لا يؤثر في المكتبة)
          <textarea
            className="field min-h-24"
            value={value.reason || ''}
            onChange={(event) => onChange({
              ...value,
              reason: event.target.value,
              reasonManuallyEdited: true
            })}
            maxLength={4000}
            required
            disabled={disabled}
          />
        </label>
      )}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 sm:col-span-2 xl:col-span-3">
        <p className="text-xs font-bold text-indigo-900">معاينة النص النهائي</p>
        <p className="mt-2 text-sm leading-7 text-indigo-950">
          {selectedTemplate
            ? renderTextTemplate(selectedTemplate.body, previewValues(selectedTemplate))
            : value.textTemplateId === 'other'
              ? value.reason || 'اكتب نص الإجراء'
              : 'اختر نصاً من المكتبة لمعاينته.'}
        </p>
      </div>
    </div>
  );
}
