const fs = require('node:fs/promises');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

const TEMPLATE_OPTIONS = {
  paragraphLoop: true,
  linebreaks: true,
  errorLogging: false
};
const ARABIC_TEXT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

async function renderWordTemplate(templatePath, data) {
  try {
    const file = await fs.readFile(templatePath);
    return renderWordTemplateBuffer(file, data);
  } catch (error) {
    throw toTemplateError(error);
  }
}

async function renderWordTemplateBatch(templatePath, records, sharedData = {}) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('اختر سجلاً واحداً على الأقل للطباعة.');
  }
  try {
    const templateBuffer = await fs.readFile(templatePath);
    const inspectionDocument = new Docxtemplater(new PizZip(templateBuffer), TEMPLATE_OPTIONS);
    const templateText = inspectionDocument.getFullText().replace(/\s+/g, '');
    const singleLoopRowTemplate = removeRepeatedRecordsTableRows(templateBuffer);
    if (singleLoopRowTemplate) {
      return renderWordTemplateBuffer(singleLoopRowTemplate, {
        ...sharedData,
        records
      });
    }
    if (templateText.includes('{#records}') && templateText.includes('{/records}')) {
      return renderWordTemplateBuffer(templateBuffer, {
        ...sharedData,
        records
      });
    }
    const automaticTableTemplate = addAutomaticTableRecordLoop(templateBuffer);
    if (automaticTableTemplate) {
      return renderWordTemplateBuffer(automaticTableTemplate, {
        ...sharedData,
        records
      });
    }

    const firstOutput = renderWordTemplateBuffer(templateBuffer, records[0]);
    if (records.length === 1) return firstOutput;
    const zip = new PizZip(firstOutput);
    const documentXml = zip.file('word/document.xml')?.asText();
    if (!documentXml) throw new Error('قالب Word لا يحتوي على مستند صالح.');
    const firstBody = extractWordBody(documentXml);
    const pageContents = [firstBody.content];
    for (const record of records.slice(1)) {
      const output = renderWordTemplateBuffer(templateBuffer, record);
      const pageXml = new PizZip(output).file('word/document.xml')?.asText();
      pageContents.push(extractWordBody(pageXml).content);
    }
    const repeatedContent = pageContents.join('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    const bodyStart = documentXml.indexOf('<w:body');
    const contentStart = documentXml.indexOf('>', bodyStart) + 1;
    const bodyEnd = documentXml.lastIndexOf('</w:body>');
    if (bodyStart < 0 || contentStart <= bodyStart || bodyEnd < contentStart) {
      throw new Error('تعذر تجهيز صفحات قالب Word للطباعة الجماعية.');
    }
    const mergedXml = `${documentXml.slice(0, contentStart)}${repeatedContent}${firstBody.sectionProperties}${documentXml.slice(bodyEnd)}`;
    zip.file('word/document.xml', mergedXml);
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (error) {
    throw toTemplateError(error);
  }
}

function removeRepeatedRecordsTableRows(templateBuffer) {
  const zip = new PizZip(templateBuffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) return null;

  const documentXml = documentFile.asText();
  const replacements = [];
  for (const table of extractWordTables(documentXml)) {
    const rowTexts = table.rows.map((row) => getWordRowText(row.content).replace(/\s+/g, ''));
    const openingCount = rowTexts.reduce((count, text) => count + (text.match(/\{#records\}/g) || []).length, 0);
    if (openingCount < 2) continue;

    const templateRowIndex = rowTexts.findIndex((text) => text.includes('{#records}'));
    if (templateRowIndex < 0
      || !rowTexts[templateRowIndex].includes('{/records}')) {
      continue;
    }
    for (const row of table.rows.slice(templateRowIndex + 1)) {
      replacements.push({ start: row.start, end: row.end, content: '' });
    }
  }
  if (!replacements.length) return null;

  replacements.sort((left, right) => right.start - left.start);
  let updatedXml = documentXml;
  for (const replacement of replacements) {
    updatedXml = `${updatedXml.slice(0, replacement.start)}${replacement.content}${updatedXml.slice(replacement.end)}`;
  }
  zip.file('word/document.xml', updatedXml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function addAutomaticTableRecordLoop(templateBuffer) {
  const zip = new PizZip(templateBuffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) return null;

  const documentXml = documentFile.asText();
  const tables = extractWordTables(documentXml);
  let modified = false;
  const replacements = [];
  for (const table of tables) {
    const templateRowIndex = table.rows.findIndex((row) => hasWordFieldPlaceholder(row.content));
    if (templateRowIndex < 0) continue;

    const templateRow = table.rows[templateRowIndex];
    let rowXml = addRowLoopMarkers(templateRow.content);
    for (const row of table.rows.slice(templateRowIndex + 1)) {
      if (hasWordFieldPlaceholder(row.content)) {
        replacements.push({ start: row.start, end: row.end, content: '' });
      }
    }
    replacements.push({
      start: templateRow.start,
      end: templateRow.end,
      content: rowXml
    });
    modified = true;
  }
  if (!modified) return null;

  replacements.sort((left, right) => right.start - left.start);
  let updatedXml = documentXml;
  for (const replacement of replacements) {
    updatedXml = `${updatedXml.slice(0, replacement.start)}${replacement.content}${updatedXml.slice(replacement.end)}`;
  }
  zip.file('word/document.xml', updatedXml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function extractWordTables(documentXml) {
  const tables = [];
  const tableStack = [];
  const rowStack = [];
  const tags = /<\/?w:(?:tbl|tr)\b[^>]*>/g;
  let depth = 0;
  let match;
  while ((match = tags.exec(documentXml))) {
    const tag = match[0];
    if (tag.startsWith('</')) {
      if (tag.startsWith('</w:tr')) {
        const row = rowStack[rowStack.length - 1];
        if (row && depth === row.table.depth + 1) {
          row.end = tags.lastIndex;
          row.content = documentXml.slice(row.start, row.end);
          row.table.rows.push(row);
          rowStack.pop();
        }
      } else {
        depth -= 1;
        tableStack.pop();
        continue;
      }
      depth -= 1;
      continue;
    }

    if (tag.startsWith('<w:tbl')) {
      const table = { depth: depth + 1, rows: [] };
      tables.push(table);
      tableStack.push(table);
    } else if (tableStack.length && depth === tableStack[tableStack.length - 1].depth) {
      rowStack.push({
        start: match.index,
        table: tableStack[tableStack.length - 1]
      });
    }
    depth += 1;
  }
  return tables;
}

function hasWordFieldPlaceholder(rowXml) {
  const text = getWordRowText(rowXml);
  return /\{(?![#/^!@])[^{}]+\}/.test(text);
}

function getWordRowText(rowXml) {
  return rowXml
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function addRowLoopMarkers(rowXml) {
  const firstParagraph = /<w:p(?:\s[^>]*)?>/.exec(rowXml);
  const lastParagraphStart = [...rowXml.matchAll(/<w:p(?:\s[^>]*)?>/g)].pop();
  const lastParagraphEnd = rowXml.lastIndexOf('</w:p>');
  if (!firstParagraph || !lastParagraphStart || lastParagraphEnd < lastParagraphStart.index) {
    throw new Error('تعذر تحديد صف البيانات في جدول قالب Word.');
  }

  const paragraphProperties = /^\s*(?:<w:pPr\b[^>]*\/>|<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>)/.exec(
    rowXml.slice(firstParagraph.index + firstParagraph[0].length)
  );
  const openingMarker = '<w:r><w:t>{#records}</w:t></w:r>';
  const openingPosition = firstParagraph.index + firstParagraph[0].length
    + (paragraphProperties ? paragraphProperties[0].length : 0);
  const closingMarker = '<w:r><w:t>{/records}</w:t></w:r>';
  const withClosingMarker = `${rowXml.slice(0, lastParagraphEnd)}${closingMarker}${rowXml.slice(lastParagraphEnd)}`;
  return `${withClosingMarker.slice(0, openingPosition)}${openingMarker}${withClosingMarker.slice(openingPosition)}`;
}

function renderWordTemplateBuffer(templateBuffer, data) {
  try {
    const document = new Docxtemplater(new PizZip(templateBuffer), TEMPLATE_OPTIONS);
    document.render(data);
    const zip = document.getZip();
    const documentXml = zip.file('word/document.xml')?.asText();
    if (!documentXml) throw new Error('قالب Word لا يحتوي على مستند صالح.');
    zip.file('word/document.xml', setArabicParagraphDirection(documentXml));
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (error) {
    throw toTemplateError(error);
  }
}

function toTemplateError(error) {
  if (error?.name === 'WordTemplateError') return error;
  const issues = Array.isArray(error?.properties?.errors) ? error.properties.errors : [];
  const details = issues
    .map((issue) => issue.properties?.explanation || issue.message || issue.properties?.id)
    .filter(Boolean);
  const message = details.length
    ? `تعذر معالجة قالب Word؛ راجع وسوم الحقول وحلقة {#records}/{/records}: ${[...new Set(details)].join('؛ ')}`
    : `تعذر تجهيز قالب Word: ${error instanceof Error ? error.message : 'خطأ غير معروف.'}`;
  const templateError = new Error(message);
  templateError.name = 'WordTemplateError';
  return templateError;
}

function setArabicParagraphDirection(documentXml) {
  return documentXml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((match) => match[1])
      .join('');
    if (!ARABIC_TEXT.test(text)) return paragraph;

    let directed = paragraph.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
      const runText = [...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((match) => match[1])
        .join('');
      if (!ARABIC_TEXT.test(runText)) return run;
      if (/<w:rtl\b[^>]*\/>/.test(run)) return run.replace(/<w:rtl\b[^>]*\/>/, '<w:rtl/>');
      if (/<w:rPr\b[^>]*\/>/.test(run)) {
        return run.replace(/<w:rPr\b[^>]*\/>/, '<w:rPr><w:rtl/></w:rPr>');
      }
      if (/<w:rPr\b[^>]*>/.test(run)) {
        const runProperties = run.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/)?.[0];
        if (!runProperties) return run;
        const propertyPosition = runProperties.search(/<w:(?:cs|em|lang|eastAsianLayout|specVanish|oMath|rPrChange)\b/);
        const rtlProperty = '<w:rtl/>';
        const updatedProperties = propertyPosition < 0
          ? runProperties.replace('</w:rPr>', `${rtlProperty}</w:rPr>`)
          : `${runProperties.slice(0, propertyPosition)}${rtlProperty}${runProperties.slice(propertyPosition)}`;
        return run.replace(runProperties, updatedProperties);
      }
      return run.replace(/<w:r(?:\s[^>]*)?>/, (opening) => `${opening}<w:rPr><w:rtl/></w:rPr>`);
    });

    if (/<w:bidi\b[^>]*\/>/.test(directed)) {
      return directed.replace(/<w:bidi\b[^>]*\/>/, '<w:bidi/>');
    }
    if (/<w:pPr\b[^>]*\/>/.test(directed)) {
      return directed.replace(/<w:pPr\b[^>]*\/>/, '<w:pPr><w:bidi/></w:pPr>');
    }
    if (/<w:pPr\b[^>]*>/.test(directed)) {
      const paragraphProperties = directed.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0];
      if (!paragraphProperties) return directed;
      const styleElement = paragraphProperties.match(/<w:pStyle\b[^>]*\/>|<w:pStyle\b[^>]*>[\s\S]*?<\/w:pStyle>/)?.[0];
      const updatedProperties = styleElement
        ? paragraphProperties.replace(styleElement, `${styleElement}<w:bidi/>`)
        : paragraphProperties.replace(/(<w:pPr\b[^>]*>)/, '$1<w:bidi/>');
      return directed.replace(paragraphProperties, updatedProperties);
    }
    return directed.replace(/<w:p(?:\s[^>]*)?>/, (opening) => `${opening}<w:pPr><w:bidi/></w:pPr>`);
  });
}

function extractWordBody(documentXml) {
  if (typeof documentXml !== 'string') throw new Error('قالب Word لا يحتوي على مستند صالح.');
  const bodyStart = documentXml.indexOf('<w:body');
  const contentStart = documentXml.indexOf('>', bodyStart) + 1;
  const bodyEnd = documentXml.lastIndexOf('</w:body>');
  if (bodyStart < 0 || contentStart <= bodyStart || bodyEnd < contentStart) {
    throw new Error('تعذر تجهيز صفحات قالب Word للطباعة الجماعية.');
  }
  let content = documentXml.slice(contentStart, bodyEnd);
  let sectionProperties = '';
  const sectionStart = content.lastIndexOf('<w:sectPr');
  if (sectionStart >= 0) {
    const selfClosingEnd = content.indexOf('/>', sectionStart);
    const closingEnd = content.indexOf('</w:sectPr>', sectionStart);
    const sectionEnd = closingEnd >= 0
      ? closingEnd + '</w:sectPr>'.length
      : selfClosingEnd >= 0
        ? selfClosingEnd + 2
        : -1;
    if (sectionEnd < 0) throw new Error('تعذر قراءة إعدادات صفحات قالب Word.');
    sectionProperties = content.slice(sectionStart, sectionEnd);
    content = `${content.slice(0, sectionStart)}${content.slice(sectionEnd)}`;
  }
  return { content, sectionProperties };
}

function createPenaltyTemplateData(penalty) {
  const days = penalty.days ?? '';
  const duration = `${days}${days === '' ? '' : ' يوم'}${penalty.penalty_type ? ` ${penalty.penalty_type}` : ''}`;
  const reason = penalty.reason || penalty.penalty_type || '';
  const actionDate = penalty.action_date || '';
  const clauseNo = penalty.clause_no || '';
  const generatedText = reason.startsWith('تجازى المذكور')
    ? reason
    : reason || duration || actionDate || clauseNo
      ? `تجازى المذكور ${duration || '…'} نظير ${reason || '…'} بتاريخ ${actionDate || '…'} بند رقم ${clauseNo || '—'}`
      : '';
  return {
    NAME: penalty.full_name || '',
    MILITARY_ID: penalty.military_number || '',
    RANK: penalty.rank || '',
    PENALTY_REASON: reason,
    PENALTY_DAYS: duration,
    PENALTY_TYPE: penalty.penalty_type || '',
    DATE: actionDate,
    CLAUSE_NO: clauseNo,
    GENERATED_TEXT: generatedText,
    PENALTY_TEXT: generatedText
  };
}

function createCommonTemplateData(record, linkedPerson = {}, personnelColumns = [], officialValues = {}) {
  const mergedRecord = { ...linkedPerson, ...record };
  const excelAliases = {};
  for (const column of personnelColumns) {
    excelAliases[column.column_key] = linkedPerson[column.column_key] ?? record[column.column_key] ?? '';
  }
  for (let index = 1; index <= 9; index += 1) {
    const key = `excel_${index}`;
    excelAliases[key] = linkedPerson[key] ?? record[key] ?? '';
  }
  const actionDate = mergedRecord.action_date
    || mergedRecord.date
    || mergedRecord.order_date
    || mergedRecord.invoice_date
    || mergedRecord.effective_month
    || '';
  return {
    ...linkedPerson,
    ...record,
    ...excelAliases,
    ...createPenaltyTemplateData({
      full_name: mergedRecord.full_name,
      military_number: mergedRecord.military_number,
      rank: mergedRecord.rank,
      penalty_type: mergedRecord.action_type || mergedRecord.penalty_type,
      days: mergedRecord.action_days ?? mergedRecord.days,
      reason: mergedRecord.action_reason || mergedRecord.reason,
      action_date: actionDate,
      clause_no: mergedRecord.clause_no
    }),
    DATE: actionDate,
    ...officialValues
  };
}

function createSubmoduleTemplateData(record, linkedPerson = {}, personnelColumns = [], officialValues = {}) {
  const aliases = {};
  for (const column of personnelColumns) {
    aliases[column.column_key] = linkedPerson[column.column_key] ?? '';
  }
  for (let index = 1; index <= 9; index += 1) {
    const key = `excel_${index}`;
    aliases[key] = linkedPerson[key] ?? '';
  }
  for (const field of record.fields || []) {
    const rawValue = record.data?.[field.key] ?? '';
    const value = field.type === 'person'
      ? linkedPerson.full_name || record.full_name || rawValue
      : field.type === 'percentage' && rawValue
        ? `${rawValue}%`
        : rawValue;
    aliases[field.key] = value;
    aliases[field.label] = value;
    aliases[field.label.replace(/\s+/g, '_')] = value;
  }
  const fieldValue = (predicate) => {
    const field = (record.fields || []).find(predicate);
    return field ? aliases[field.key] ?? '' : '';
  };
  const resolvedRecord = {
    ...record.data,
    ...aliases,
    ...record,
    action_type: record.action_type || fieldValue((field) => /نوع.*(إجراء|جزاء)/.test(field.label)),
    action_days: record.action_days ?? fieldValue((field) => field.type === 'duration' || /مدة/.test(field.label)),
    action_reason: record.action_reason || fieldValue((field) => /سبب|بيان/.test(field.label)),
    action_date: record.action_date || fieldValue((field) => field.type === 'date'),
    clause_no: record.clause_no || fieldValue((field) => /بند|أمر/.test(field.label))
  };
  return createCommonTemplateData(resolvedRecord, linkedPerson, personnelColumns, officialValues);
}

module.exports = {
  renderWordTemplate,
  renderWordTemplateBatch,
  createCommonTemplateData,
  createPenaltyTemplateData,
  createSubmoduleTemplateData
};
