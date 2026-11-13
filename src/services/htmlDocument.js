const { REPORT_COLORS } = require('./wordReportStyle');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtmlDocument(templateHtml, data) {
  const tokenPattern = /\{([A-Za-z0-9_\-\u0600-\u06FF]+)\}/g;
  const tokens = [...templateHtml.matchAll(tokenPattern)].map((match) => match[1]);
  const unknown = [...new Set(tokens.filter((token) => (
    token !== 'records_table' && !Object.prototype.hasOwnProperty.call(data, token)
  )))];
  if (unknown.length) {
    throw new Error(`تعذر إنشاء المستند؛ متغيرات غير متاحة: ${unknown.map((token) => `{${token}}`).join('، ')}`);
  }

  const content = templateHtml.replace(tokenPattern, (_match, token) => (
    token === 'records_table'
      ? String(data.records_table || '')
      : escapeHtml(data[token])
  ));
  const color = (value) => `#${value}`;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><style>
body{font-family:Arial,Tahoma,sans-serif;direction:rtl;color:${color(REPORT_COLORS.text)};font-size:11pt;line-height:1.6}
h1,h2,h3{color:${color(REPORT_COLORS.navy)}}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid ${color(REPORT_COLORS.border)};padding:6px;text-align:right;vertical-align:top}
thead{display:table-header-group}
th{background:${color(REPORT_COLORS.navy)};color:#fff;font-weight:bold}
tbody tr:nth-child(even) td{background:${color(REPORT_COLORS.stripe)}}
</style></head>
<body>${content}</body>
</html>`;
}

module.exports = { renderHtmlDocument, escapeHtml };
