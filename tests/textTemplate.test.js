const assert = require('node:assert/strict');
const test = require('node:test');

test('renders Arabic text template variables using the current action wording', async () => {
  const { renderTextTemplate } = await import('../src/services/textTemplate.js');
  const text = renderTextTemplate(
    'تجازى المذكور {الاسم} {الرتبة} {الرقم_العسكري} {المدة} نظير غياب بتاريخ {التاريخ} بند رقم {رقم_البند}',
    {
      name: 'أحمد علي',
      rank: 'عريف',
      militaryNumber: 'M-12',
      requiresDays: true,
      days: 5,
      kind: 'حبس',
      date: '2026-11-10',
      clauseNo: '7'
    }
  );
  assert.equal(
    text,
    'تجازى المذكور أحمد علي عريف M-12 5 يوم حبس نظير غياب بتاريخ 2026-11-10 بند رقم 7'
  );
});

test('supports existing English aliases and custom section field placeholders', async () => {
  const { renderTextTemplate } = await import('../src/services/textTemplate.js');
  const text = renderTextTemplate(
    '{NAME} {RANK} {MILITARY_ID} {PENALTY_DAYS} {PENALTY_TYPE} {DATE} {CLAUSE_NO} {PENALTY_REASON} {GENERATED_TEXT} {PENALTY_TEXT} {اسم_الحقل}',
    {
      NAME: 'اسم',
      RANK: 'جندي',
      MILITARY_ID: 'P-4',
      PENALTY_DAYS: '3 يوم حبس',
      PENALTY_TYPE: 'حبس',
      DATE: '2026-11-10',
      CLAUSE_NO: '2',
      PENALTY_REASON: 'غياب',
      GENERATED_TEXT: 'النص النهائي',
      PENALTY_TEXT: 'النص النهائي',
      field_1: 'قيمة القسم',
      اسم_الحقل: 'قيمة مخصصة'
    }
  );
  assert.equal(
    text,
    'اسم جندي P-4 3 يوم حبس حبس 2026-11-10 2 غياب النص النهائي النص النهائي قيمة مخصصة'
  );
});
