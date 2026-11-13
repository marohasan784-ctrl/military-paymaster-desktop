const {
  AlignmentType,
  BorderStyle,
  Paragraph,
  ShadingType,
  TextRun
} = require('docx');
const { createReportDocument, createStyledTable } = require('./wordReportStyle');

const designs = {
  classic: { color: '334155', light: 'F1F5F9', frame: false, sidebar: false },
  modern: { color: '0F766E', light: 'CCFBF1', frame: false, sidebar: false },
  framed: { color: '1D4ED8', light: 'DBEAFE', frame: true, sidebar: false },
  sidebar: { color: '7C2D12', light: 'FFEDD5', frame: false, sidebar: true }
};

function rtl(text, options = {}) {
  const { run = {}, ...paragraphOptions } = options;
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    ...paragraphOptions,
    children: [new TextRun({ text: String(text ?? ''), font: 'Arial', ...run })]
  });
}

function border(color, size = 5) {
  return { style: BorderStyle.SINGLE, size, color };
}

function createInvoiceTable(invoice, design) {
  const headers = ['م / مسلسل', 'كود الصنف', 'الصنف / البيان', 'الوحدة', 'سعر الوحدة', 'الكمية', 'الإجمالي'];
  const rows = invoice.items.map((item) => [
    item.serial,
    item.product_code,
    item.description,
    item.unit,
    formatMoney(item.unit_price),
    item.quantity,
    formatMoney(item.total)
  ]);
  return createStyledTable(headers, rows, {
    headerColor: design.color,
    borderColor: design.color,
    stripeColor: design.light,
    fontSize: 16,
    headerFontSize: 16,
    cellMargins: { top: 100, bottom: 100, left: 80, right: 80 }
  });
}

async function createInvoiceDocument(invoice) {
  const design = designs[invoice.template_id] || designs.classic;
  const fields = new Map((invoice.headerFields || []).map((field) => [field.id, field]));
  const layout = invoice.layout?.length
    ? invoice.layout
    : [...fields.keys()].map((id) => ({ type: 'field', id }));
  const documentTitle = invoice.document_type === 'quotation' ? 'بيان أسعار' : 'فاتورة إلكترونية';
  const children = [
    rtl(documentTitle, {
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 300 },
      run: { bold: true, size: 34, color: design.color }
    })
  ];

  for (const block of layout) {
    if (block.type === 'divider') {
      children.push(new Paragraph({
        border: { bottom: border(design.color, 8) },
        spacing: { before: 160, after: 180 }
      }));
      continue;
    }
    const field = fields.get(block.id);
    if (field) {
      children.push(rtl(`${field.label}: ${field.value}`, {
        spacing: { before: 50, after: 50 },
        run: { size: 20, color: '334155' }
      }));
    }
  }

  children.push(rtl('', { spacing: { after: 160 } }));
  children.push(createInvoiceTable(invoice, design));
  children.push(rtl(`المجموع قبل الضريبة: ${formatMoney(invoice.subtotal)}`, {
    alignment: AlignmentType.LEFT,
    spacing: { before: 300, after: 100 },
    run: { size: 22 }
  }));
  children.push(rtl(`ضريبة القيمة المضافة (${(invoice.vat_rate * 100).toLocaleString('ar-EG')}%): ${formatMoney(invoice.vat_amount)}`, {
    alignment: AlignmentType.LEFT,
    spacing: { after: 100 },
    run: { size: 22 }
  }));
  children.push(rtl(`الإجمالي النهائي: ${formatMoney(invoice.grand_total)}`, {
    alignment: AlignmentType.LEFT,
    spacing: { before: 100, after: 180 },
    run: { bold: true, size: 26, color: design.color }
  }));

  const headers = design.sidebar ? {
    default: {
      children: [new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: design.color },
        spacing: { after: 200 },
        children: [new TextRun({ text: '     ', font: 'Arial', color: design.color })]
      })]
    }
  } : undefined;
  return createReportDocument(children, {
    pageBorder: design.frame,
    borderColor: design.color,
    margins: { top: 900, right: 900, bottom: 900, left: 900 },
    headers
  });
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ج.م`;
}

module.exports = { createInvoiceDocument };
