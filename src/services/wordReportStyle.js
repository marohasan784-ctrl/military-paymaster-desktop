const {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  PageBorderDisplay,
  PageBorderOffsetFrom,
  PageBorderZOrder,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  Packer
} = require('docx');
const officialIdentity = require('../config/officialIdentity.json');

const REPORT_COLORS = Object.freeze({
  navy: '1E293B',
  border: 'CBD5E1',
  stripe: 'F1F5F9',
  text: '1E293B',
  muted: '64748B'
});

const TABLE_CELL_MARGINS = { top: 100, bottom: 100, left: 120, right: 120 };

function rtlParagraph(text, options = {}) {
  return {
    text,
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    ...options
  };
}

function createOfficialHeader(reportTitle, subtitle = '', logo = null) {
  return [
    ...(logo ? [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({
        data: logo.data,
        type: logo.type,
        transformation: { width: 72, height: 72 }
      })],
      spacing: { after: 120 }
    })] : []),
    new Paragraph({
      ...rtlParagraph('', {
        children: [new TextRun({
          text: `الجهة: ${officialIdentity.unitName}`,
          bold: true,
          font: 'Arial'
        })]
      }),
      style: 'OfficialHeader',
      spacing: { after: 80 }
    }),
    new Paragraph({
      ...officialContextRun(`${officialIdentity.commanderTitle}: ${officialIdentity.commanderName}`),
      style: 'OfficialContext'
    }),
    new Paragraph({
      ...officialContextRun(`${officialIdentity.financeChiefTitle}: ${officialIdentity.financeChiefName}`),
      style: 'OfficialContext'
    }),
    new Paragraph({
      ...officialContextRun(`${officialIdentity.softwareEngineerTitle}: ${officialIdentity.softwareEngineerName}`),
      style: 'OfficialContext',
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: REPORT_COLORS.navy, space: 8 }
      },
      spacing: { after: 240 }
    }),
    new Paragraph({
      ...rtlParagraph('', {
        children: [new TextRun({ text: reportTitle, bold: true, font: 'Arial' })]
      }),
      style: 'ReportTitle',
      spacing: { before: 80, after: 100 }
    }),
    ...(subtitle ? [new Paragraph({
      ...rtlParagraph('', {
        children: [new TextRun({ text: subtitle, font: 'Arial' })]
      }),
      style: 'ReportSubtitle',
      spacing: { after: 240 }
    })] : [])
  ];
}

function officialContextRun(text) {
  return rtlParagraph('', {
    children: [new TextRun({ text, font: 'Arial' })]
  });
}

function createStyledTable(headers, rows, options = {}) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new TypeError('بيانات جدول Word غير صالحة.');
  }
  const {
    headerColor = REPORT_COLORS.navy,
    borderColor = REPORT_COLORS.border,
    stripeColor = REPORT_COLORS.stripe,
    textColor = REPORT_COLORS.text,
    fontSize = 18,
    headerFontSize,
    cellMargins = TABLE_CELL_MARGINS
  } = options;
  const borders = Object.fromEntries(
    ['top', 'bottom', 'left', 'right'].map((side) => [
      side,
      { style: BorderStyle.SINGLE, size: 4, color: borderColor }
    ])
  );
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((header) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: headerColor },
      borders,
      margins: cellMargins,
      verticalAlign: 'center',
      children: [new Paragraph({
        ...rtlParagraph('', {
          children: [new TextRun({
            text: header,
            bold: true,
            color: 'FFFFFF',
            font: 'Arial',
            ...(headerFontSize ? { size: headerFontSize } : {})
          })]
        })
      })]
    }))
  });
  const dataRows = [];
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) throw new TypeError('كل صف في جدول Word يجب أن يكون مصفوفة خلايا.');
    dataRows.push(new TableRow({
      cantSplit: true,
      children: headers.map((_, columnIndex) => {
        const value = row[columnIndex];
        return new TableCell({
          shading: rowIndex % 2 === 1
            ? { type: ShadingType.CLEAR, fill: stripeColor }
            : { type: ShadingType.CLEAR, fill: 'FFFFFF' },
          borders,
          margins: cellMargins,
          verticalAlign: 'center',
          children: [new Paragraph({
            ...rtlParagraph('', {
              children: [new TextRun({
                text: value == null || value === '' ? '—' : String(value),
                font: 'Arial',
                size: fontSize,
                color: textColor
              })]
            }),
            style: 'TableText'
          })]
        });
      })
    }));
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: 'fixed',
    visuallyRightToLeft: true,
    margins: cellMargins,
    borders,
    rows: [headerRow, ...dataRows]
  });
}

function createSignatureSection() {
  const officials = [
    [officialIdentity.commanderTitle, officialIdentity.commanderName],
    [officialIdentity.financeChiefTitle, officialIdentity.financeChiefName],
    [officialIdentity.softwareEngineerTitle, officialIdentity.softwareEngineerName]
  ];
  return [
    new Paragraph({
      ...rtlParagraph('الاعتماد والتوقيعات'),
      style: 'SectionTitle',
      spacing: { before: 360, after: 100 }
    }),
    ...officials.map(([label, name]) => new Paragraph({
      ...rtlParagraph('', {
        children: [
          new TextRun({ text: `${label}: ${name}    `, bold: true, color: REPORT_COLORS.text, font: 'Arial' }),
          new TextRun({ text: 'التوقيع: __________________', color: REPORT_COLORS.muted, font: 'Arial' })
        ]
      }),
      spacing: { before: 180, after: 120 },
      keepLines: true
    }))
  ];
}

function reportSectionProperties({
  pageBorder = true,
  borderColor = REPORT_COLORS.navy,
  margins = {}
} = {}) {
  const page = {
    margin: {
      top: 1000,
      right: 1000,
      bottom: 1000,
      left: 1000,
      header: 500,
      footer: 500,
      ...margins
    }
  };
  if (!pageBorder) return { page };

  page.borders = {
    pageBorders: {
      display: PageBorderDisplay.ALL_PAGES,
      offsetFrom: PageBorderOffsetFrom.PAGE,
      zOrder: PageBorderZOrder.BACK
    },
    pageBorderTop: { style: BorderStyle.SINGLE, size: 8, color: borderColor, space: 18 },
    pageBorderBottom: { style: BorderStyle.SINGLE, size: 8, color: borderColor, space: 18 },
    pageBorderLeft: { style: BorderStyle.SINGLE, size: 8, color: borderColor, space: 18 },
    pageBorderRight: { style: BorderStyle.SINGLE, size: 8, color: borderColor, space: 18 }
  };
  return {
    page
  };
}

function reportStyles() {
  return {
    default: {
      document: {
        run: { font: 'Arial', size: 20, color: REPORT_COLORS.text },
        paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 80 } }
      }
    },
    paragraphStyles: [
      {
        id: 'OfficialHeader',
        name: 'Official Header',
        basedOn: 'Normal',
        run: { font: 'Arial', size: 28, bold: true, color: REPORT_COLORS.navy },
        paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 100 } }
      },
      {
        id: 'OfficialContext',
        name: 'Official Context',
        basedOn: 'Normal',
        run: { font: 'Arial', size: 18, color: REPORT_COLORS.text },
        paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { after: 50 } }
      },
      {
        id: 'ReportTitle',
        name: 'Report Title',
        basedOn: 'Normal',
        run: { font: 'Arial', size: 30, bold: true, color: REPORT_COLORS.navy },
        paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT }
      },
      {
        id: 'ReportSubtitle',
        name: 'Report Subtitle',
        basedOn: 'Normal',
        run: { font: 'Arial', size: 18, color: REPORT_COLORS.muted },
        paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT }
      },
      {
        id: 'SectionTitle',
        name: 'Section Title',
        basedOn: 'Normal',
        run: { font: 'Arial', size: 24, bold: true, color: REPORT_COLORS.navy },
        paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { before: 240, after: 100 } }
      },
      {
        id: 'TableText',
        name: 'Table Text',
        basedOn: 'Normal',
        run: { font: 'Arial', size: 18, color: REPORT_COLORS.text },
        paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { before: 20, after: 20 } }
      }
    ]
  };
}

function createReportDocument(children, options = {}) {
  const document = new Document({
    styles: reportStyles(),
    sections: [{
      properties: reportSectionProperties(options),
      ...(options.headers ? { headers: options.headers } : {}),
      children
    }]
  });
  return Packer.toBuffer(document);
}

module.exports = {
  createOfficialHeader,
  createReportDocument,
  createSignatureSection,
  createStyledTable,
  rtlParagraph,
  REPORT_COLORS
};
