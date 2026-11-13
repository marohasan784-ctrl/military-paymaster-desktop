const assert = require('node:assert/strict');
const test = require('node:test');
const PizZip = require('pizzip');
const { createPersonnelDocument } = require('../src/services/wordDocument');

test('creates a styled formal personnel roster Word package', async () => {
  const output = await createPersonnelDocument([
    {
      military_number: '1001',
      full_name: 'الفرد الأول',
      rank: 'جندي',
      category: 'جندي',
      unit: 'الوحدة الأولى'
    },
    {
      military_number: '1002',
      full_name: 'الفرد الثاني',
      rank: 'عريف',
      category: 'صف ضابط',
      unit: 'الوحدة الثانية'
    },
    {
      military_number: '1003',
      full_name: 'الفرد الثالث',
      rank: 'رقيب',
      category: 'صف ضابط',
      unit: 'الوحدة الثالثة'
    },
    {
      military_number: '1004',
      full_name: 'الفرد الرابع',
      rank: 'مساعد',
      category: 'صف ضابط',
      unit: 'الوحدة الرابعة'
    }
  ]);
  assert.ok(Buffer.isBuffer(output));
  assert.equal(output.subarray(0, 2).toString(), 'PK');
  assert.ok(output.length > 1000);
  const zip = new PizZip(output);
  const documentXml = zip.file('word/document.xml').asText();
  assert.match(documentXml, /كشف الأفراد/);
  assert.match(documentXml, /الجهة: الجهة التجريبية/);
  assert.match(documentXml, /قائد الجهة: اسم القائد التجريبي/);
  assert.match(documentXml, /رئيس قسم الماليات: اسم المسؤول المالي التجريبي/);
  assert.match(documentXml, /مهندس تطوير النظام: اسم المطور التجريبي/);
  assert.match(documentXml, /الرقم العسكري/);
  assert.match(documentXml, /الفرد الأول/);
  assert.match(documentXml, /الفرد الثاني/);
  assert.match(documentXml, /الفرد الثالث/);
  assert.match(documentXml, /الفرد الرابع/);
  assert.equal((documentXml.match(/<w:tr\b/g) || []).length, 5);
  assert.match(documentXml, /<w:bidiVisual\/>/);
  assert.match(documentXml, /w:fill="1E293B"/);
  assert.match(documentXml, /w:fill="F1F5F9"/);
  assert.match(documentXml, /الاعتماد والتوقيعات/);
  assert.match(documentXml, /التوقيع/);
  assert.match(documentXml, /<w:pgBorders/);
});
