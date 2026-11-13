import PersonPicker from '../components/PersonPicker';
import TemplatePicker from '../components/TemplatePicker';

export default function RecordFieldInput({
  field,
  value,
  disabled,
  autoFocus,
  people,
  bulkMode,
  bulkPeople,
  onPersonSelect,
  onRemovePerson,
  selectedTemplate,
  templates,
  scope,
  onSelectTemplate,
  onAddTemplate,
  templatePreviewValues,
  editing,
  onChange,
  suggestions = [],
  onSearchSaved,
  linkedChoices = [],
  linkedQuery = '',
  onSearchLinked,
  durationRange,
  onToggleDurationRange,
  onDurationRangeChange,
  onApplyDuration,
  currentTemplatePreview
}) {
  const valueText = value || '';

  if (field.type === 'person') {
    return (
      <>
        <PersonPicker
          persons={people}
          value={bulkMode ? '' : valueText}
          onChange={onPersonSelect}
          disabled={disabled}
          autoFocus={autoFocus}
          browseOnFocus
          placeholder={bulkMode
            ? 'اكتب بداية الاسم أو الرقم العسكري لإضافة فرد'
            : 'اكتب بداية الاسم بالتسلسل أو بداية الرقم العسكري'}
        />
        {bulkMode && bulkPeople.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {bulkPeople.map((person) => (
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-900" key={person.military_number}>
                {person.full_name} · {person.military_number}
                <button type="button" aria-label={`إزالة ${person.full_name}`} onClick={() => onRemovePerson(person.military_number)}>×</button>
              </span>
            ))}
          </div>
        )}
      </>
    );
  }

  if (field.type === 'template') {
    return editing ? (
      <textarea className="field min-h-24" value={valueText} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    ) : (
      <>
        <TemplatePicker
          templates={templates}
          scope={scope}
          value={selectedTemplate?.id || null}
          onSelect={onSelectTemplate}
          onAdd={onAddTemplate}
          previewValues={templatePreviewValues}
          disabled={disabled}
        />
        {currentTemplatePreview && (
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-emerald-50 p-2 text-xs font-normal text-emerald-900">{currentTemplatePreview}</p>
        )}
      </>
    );
  }

  if (field.type === 'select') {
    return (
      <select className="field" value={valueText} required={field.required} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        <option value="">اختر قيمة</option>
        {(field.options || []).map((option) => <option value={option} key={option}>{option}</option>)}
      </select>
    );
  }

  if (field.type === 'saved_value') {
    return (
      <>
        <input
          className="field"
          value={valueText}
          onChange={(event) => onSearchSaved(event.target.value)}
          list={`saved-${scope}-${field.key}`}
          required={field.required}
          disabled={disabled}
        />
        <datalist id={`saved-${scope}-${field.key}`}>
          {suggestions.map((suggestion) => <option value={suggestion} key={suggestion} />)}
        </datalist>
      </>
    );
  }

  if (field.type === 'linked_record') {
    return (
      <>
        <input className="field mb-2" value={linkedQuery} onChange={(event) => onSearchLinked(event.target.value)} placeholder="ابحث في السجلات" disabled={disabled} />
        <select className="field" value={valueText} required={field.required} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          <option value="">بدون ربط</option>
          {linkedChoices.map((record) => <option value={record.id} key={`${record.submodule_id}-${record.id}`}>{record.summary}</option>)}
        </select>
        {valueText && <p className="mt-1 text-xs text-slate-500">{linkedChoices.find((record) => String(record.id) === valueText)?.summary || `السجل رقم ${valueText}`}</p>}
      </>
    );
  }

  if (field.type === 'duration') {
    return (
      <>
        <div className="flex gap-2">
          <input className="field" type="number" min="0" step="1" value={valueText} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled} />
          <button className="button button-outline shrink-0 px-3 text-xs" type="button" onClick={onToggleDurationRange} disabled={disabled}>احسب من تاريخين</button>
        </div>
        {durationRange && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input className="field" type="date" aria-label="من تاريخ" value={durationRange.from || ''} onChange={(event) => onDurationRangeChange('from', event.target.value)} />
            <input className="field" type="date" aria-label="إلى تاريخ" value={durationRange.to || ''} onChange={(event) => onDurationRangeChange('to', event.target.value)} />
            <button className="button button-outline col-span-2" type="button" onClick={onApplyDuration}>استخدم المدة المحسوبة</button>
          </div>
        )}
      </>
    );
  }

  if (field.type === 'percentage') {
    return (
      <div className="relative">
        <input className="field pe-10" type="number" step="any" value={valueText} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled} />
        <span className="absolute inset-y-0 end-3 flex items-center text-slate-600">%</span>
      </div>
    );
  }

  if (field.type === 'number') {
    return <input className="field" type="number" step="any" value={valueText} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled} />;
  }

  if (field.type === 'date') {
    return <input className="field" type="date" value={valueText} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled} />;
  }

  if (/ملاحظات/.test(field.label)) {
    return <textarea className="field min-h-24" value={valueText} onChange={(event) => onChange(event.target.value)} required={field.required} disabled={disabled} />;
  }

  return <input className="field" value={valueText} onChange={(event) => onChange(event.target.value)} placeholder={field.label} required={field.required} disabled={disabled} />;
}
