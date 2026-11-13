import { useEffect, useRef, useState } from 'react';

const ALLOWED_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'STRONG', 'B', 'EM', 'I', 'U',
  'S', 'STRIKE', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SPAN'
]);
const ALLOWED_STYLES = new Set([
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align',
  'color', 'background-color', 'vertical-align', 'border', 'border-collapse', 'width',
  'height', 'padding', 'white-space'
]);
const DEFAULT_EDITOR_OPTIONS = {
  paragraph_format: [
    { value: 'p', label: 'نص عادي' },
    { value: 'h1', label: 'عنوان رئيسي' },
    { value: 'h2', label: 'عنوان فرعي' },
    { value: 'h3', label: 'عنوان صغير' }
  ],
  document_font: ['Tahoma', 'Arial', 'Times New Roman', 'Courier New'].map((value) => ({ value, label: value })),
  document_font_size: [
    { value: '3', label: '12' },
    { value: '2', label: '10' },
    { value: '4', label: '14' },
    { value: '5', label: '18' },
    { value: '6', label: '24' }
  ]
};

export function sanitizeDocumentHtml(value) {
  const parsed = new DOMParser().parseFromString(String(value || ''), 'text/html');
  parsed.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((element) => element.remove());
  for (const element of [...parsed.body.querySelectorAll('*')]) {
    if (element.tagName === 'FONT') {
      const span = parsed.createElement('span');
      if (element.getAttribute('face')) span.style.fontFamily = element.getAttribute('face');
      if (element.getAttribute('color')) span.style.color = element.getAttribute('color');
      const size = Number(element.getAttribute('size'));
      if (size >= 1 && size <= 7) span.style.fontSize = `${[8, 10, 12, 14, 18, 24, 36][size - 1]}pt`;
      span.innerHTML = element.innerHTML;
      element.replaceWith(span);
      continue;
    }
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(parsed.createTextNode(element.textContent || ''));
      continue;
    }
    for (const attribute of [...element.attributes]) {
      if (attribute.name !== 'style') element.removeAttribute(attribute.name);
    }
    const style = [...element.style]
      .filter((property) => ALLOWED_STYLES.has(property)
        && !/url\s*\(|expression\s*\(/i.test(element.style.getPropertyValue(property)))
      .map((property) => `${property}:${element.style.getPropertyValue(property)}`)
      .join(';');
    if (style) element.setAttribute('style', style);
    else element.removeAttribute('style');
  }
  return parsed.body.innerHTML;
}

export default function RichDocumentEditor({ value, onChange, placeholders, editorOptions = {}, disabled = false }) {
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const paragraphFormats = editorOptions.paragraph_format?.length ? editorOptions.paragraph_format : DEFAULT_EDITOR_OPTIONS.paragraph_format;
  const fonts = editorOptions.document_font?.length ? editorOptions.document_font : DEFAULT_EDITOR_OPTIONS.document_font;
  const fontSizes = editorOptions.document_font_size?.length ? editorOptions.document_font_size : DEFAULT_EDITOR_OPTIONS.document_font_size;

  useEffect(() => {
    if (editorRef.current && editorRef.current.dataset.initialized !== 'true') {
      editorRef.current.innerHTML = sanitizeDocumentHtml(value);
      editorRef.current.dataset.initialized = 'true';
    }
  }, [value]);

  function saveSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editorRef.current?.contains(selection.anchorNode)) return;
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
  }

  function syncContent() {
    if (editorRef.current) onChange(sanitizeDocumentHtml(editorRef.current.innerHTML));
    saveSelection();
  }

  function command(name, commandValue = null) {
    restoreSelection();
    document.execCommand(name, false, commandValue);
    syncContent();
  }

  function insertTable() {
    const rowCount = Math.max(1, Math.min(20, Number(rows) || 1));
    const columnCount = Math.max(1, Math.min(12, Number(columns) || 1));
    const tableRows = Array.from({ length: rowCount }, (_, rowIndex) => (
      `<tr>${Array.from({ length: columnCount }, () => (
        rowIndex === 0
          ? '<th style="border:1px solid #9AADB0;padding:6px">&nbsp;</th>'
          : '<td style="border:1px solid #9AADB0;padding:6px">&nbsp;</td>'
      )).join('')}</tr>`
    )).join('');
    command('insertHTML', `<table style="width:100%;border-collapse:collapse"><tbody>${tableRows}</tbody></table><p><br></p>`);
  }

  function insertPlaceholder(key) {
    if (!key) return;
    command('insertText', `{${key}}`);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white" dir="rtl">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
        <select className="field !w-auto !px-2 !py-1.5 text-xs" aria-label="نوع الفقرة" disabled={disabled} onMouseDown={saveSelection} onChange={(event) => command('formatBlock', event.target.value)}>
          {paragraphFormats.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        <select className="field !w-auto !px-2 !py-1.5 text-xs" aria-label="نوع الخط" disabled={disabled} onMouseDown={saveSelection} onChange={(event) => command('fontName', event.target.value)}>
          {fonts.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        <select className="field !w-auto !px-2 !py-1.5 text-xs" aria-label="حجم الخط" disabled={disabled} onMouseDown={saveSelection} onChange={(event) => command('fontSize', event.target.value)}>
          {fontSizes.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        {[
          ['bold', 'عريض', 'B'],
          ['italic', 'مائل', 'I'],
          ['underline', 'تحته خط', 'U'],
          ['justifyRight', 'محاذاة لليمين', 'يمين'],
          ['justifyCenter', 'توسيط', 'وسط'],
          ['justifyLeft', 'محاذاة لليسار', 'يسار'],
          ['insertUnorderedList', 'قائمة نقطية', '• قائمة'],
          ['insertOrderedList', 'قائمة رقمية', '١. قائمة']
        ].map(([action, label, caption]) => (
          <button
            className="button button-outline !min-h-11 !px-2 !py-1 text-xs"
            type="button"
            key={action}
            title={label}
            aria-label={label}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => command(action)}
          >
            {caption}
          </button>
        ))}
        <label className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs" title="لون النص">
          لون
          <input type="color" aria-label="لون النص" disabled={disabled} onMouseDown={saveSelection} onChange={(event) => command('foreColor', event.target.value)} />
        </label>
        <label className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs" title="لون التمييز">
          تمييز
          <input type="color" aria-label="لون التمييز" disabled={disabled} onMouseDown={saveSelection} onChange={(event) => command('hiliteColor', event.target.value)} />
        </label>
        <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1">
          <span className="px-1 text-xs">جدول</span>
          <input className="w-10 border-0 text-center text-xs outline-none" type="number" min="1" max="20" value={rows} onChange={(event) => setRows(event.target.value)} aria-label="عدد الصفوف" />
          <span className="text-xs">×</span>
          <input className="w-10 border-0 text-center text-xs outline-none" type="number" min="1" max="12" value={columns} onChange={(event) => setColumns(event.target.value)} aria-label="عدد الأعمدة" />
          <button className="button button-outline !min-h-11 !px-2 !py-1 text-xs" type="button" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={insertTable}>إدراج</button>
        </div>
        <select
          className="field !w-auto !max-w-64 !px-2 !py-1.5 text-xs"
          value=""
          aria-label="إدراج متغير"
          disabled={disabled}
          onMouseDown={saveSelection}
          onChange={(event) => insertPlaceholder(event.target.value)}
        >
          <option value="">إدراج متغير ديناميكي</option>
          {placeholders.map((item) => (
            <option value={item.key} key={item.key}>{item.label} · {`{${item.key}}`}</option>
          ))}
        </select>
      </div>
      <div
        ref={editorRef}
        className="document-editor min-h-[420px] overflow-auto p-6 text-right leading-8 outline-none"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={syncContent}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={syncContent}
        role="textbox"
        aria-label="محرر المستند"
        aria-multiline="true"
      />
    </div>
  );
}
