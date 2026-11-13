const assert = require('node:assert/strict');
const test = require('node:test');
const { REPORT_COLORS } = require('../src/services/wordReportStyle');
const { renderHtmlDocument } = require('../src/services/htmlDocument');

test('applies the shared report theme and escapes filled HTML values', () => {
  const html = renderHtmlDocument(
    '<h1>{title}</h1><p>{description}</p>{records_table}',
    {
      title: 'كشف الضم',
      description: '<script>alert(1)</script>',
      records_table: '<table><tbody><tr><td>سجل</td></tr></tbody></table>'
    }
  );

  assert.match(html, new RegExp(`color:#${REPORT_COLORS.text}`));
  assert.match(html, new RegExp(`background:#${REPORT_COLORS.navy}`));
  assert.match(html, /كشف الضم/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<table><tbody><tr><td>سجل<\/td><\/tr><\/tbody><\/table>/);
});
