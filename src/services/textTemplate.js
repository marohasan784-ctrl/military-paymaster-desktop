const ALIASES = {
  الاسم: 'name',
  NAME: 'name',
  الرتبة: 'rank',
  RANK: 'rank',
  الرقم_العسكري: 'militaryNumber',
  MILITARY_ID: 'militaryNumber',
  المدة: 'duration',
  PENALTY_DAYS: 'duration',
  رقم_البند: 'clauseNo',
  CLAUSE_NO: 'clauseNo',
  التاريخ: 'date',
  DATE: 'date',
  PENALTY_REASON: 'reason',
  PENALTY_TYPE: 'kind',
  GENERATED_TEXT: 'generatedText',
  PENALTY_TEXT: 'generatedText'
};

function renderTextTemplate(body, values = {}) {
  if (typeof body !== 'string') {
    throw new TypeError('نص القالب يجب أن يكون نصاً.');
  }
  const duration = values.duration ?? (values.requiresDays
    ? `${values.days ?? 0} يوم${values.kind ? ` ${values.kind}` : ''}`
    : '');
  const replacements = {
    name: values.name ?? values.full_name ?? values.NAME ?? '',
    rank: values.rank ?? values.RANK ?? '',
    militaryNumber: values.militaryNumber ?? values.military_number ?? values.MILITARY_ID ?? '',
    duration: values.duration ?? values.PENALTY_DAYS ?? duration,
    clauseNo: values.clauseNo ?? values.clause_no ?? values.CLAUSE_NO ?? '',
    date: values.date ?? values.action_date ?? values.DATE ?? '',
    reason: values.reason ?? values.PENALTY_REASON ?? '',
    kind: values.kind ?? values.penalty_type ?? values.PENALTY_TYPE ?? '',
    generatedText: values.generatedText
      ?? values.GENERATED_TEXT
      ?? `تجازى المذكور ${duration || '…'} نظير ${values.reason || values.kind || '…'} بتاريخ ${values.date || values.action_date || '…'} بند رقم ${values.clauseNo || values.clause_no || '—'}`
  };
  for (const [key, value] of Object.entries(values)) {
    if (!Object.hasOwn(replacements, key)) replacements[key] = value ?? '';
    replacements[key.replace(/\s+/g, '_')] ??= value ?? '';
  }
  return body.replace(/\{([^{}]+)\}/g, (placeholder, key) => {
    const alias = ALIASES[key] || key;
    return Object.hasOwn(replacements, alias)
      ? String(replacements[alias] ?? '')
      : placeholder;
  }).trim();
}

export { renderTextTemplate };
