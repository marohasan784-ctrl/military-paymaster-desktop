import { normalizeArabic } from './arabicSearch.js';

const PERSONNEL_FIELD_ALIASES = [
  ['military_number', ['الرقم العسكري', 'رقم عسكري', 'رقم العسكري', 'رقم الفرد']],
  ['full_name', ['الاسم', 'اسم', 'اسم الفرد', 'الاسم الكامل', 'الاسم بالكامل', 'اسم العسكري', 'اسم الضابط']],
  ['rank', ['الرتبة', 'الرتبة العسكرية', 'رتبة الفرد']],
  ['category', ['الفئة', 'فئة الفرد', 'نوع الفرد']],
  ['unit', ['الوحدة', 'وحدة الفرد', 'جهة العمل']]
];

function normalizePersonnelLabel(value) {
  return normalizeArabic(value).toLocaleLowerCase('ar').replace(/[^a-z0-9\u0600-\u06FF]/g, '');
}

function personnelValueForField(field, person, personnelColumns) {
  if (field.type === 'person') return person.military_number || '';

  const fieldLabel = normalizePersonnelLabel(field.label);
  const canonicalField = PERSONNEL_FIELD_ALIASES.find(([, aliases]) => (
    aliases.some((alias) => normalizePersonnelLabel(alias) === fieldLabel)
  ));
  let value = canonicalField ? person[canonicalField[0]] : undefined;
  if (value === undefined) {
    const column = personnelColumns.find((item) => (
      [item.placeholder_label, item.source_header, item.column_key]
        .some((label) => normalizePersonnelLabel(label) === fieldLabel)
    ));
    if (column) value = person[column.column_key] ?? person.source_data?.[column.source_header];
  }
  if (value === undefined || value === null || value === '') return undefined;
  const stringValue = String(value);
  if (field.type === 'select' && !field.options?.includes(stringValue)) return undefined;
  if (['number', 'duration', 'percentage'].includes(field.type) && !Number.isFinite(Number(stringValue))) return undefined;
  return stringValue;
}

export { personnelValueForField };
