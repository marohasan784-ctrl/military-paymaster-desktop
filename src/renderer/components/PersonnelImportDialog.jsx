import { useEffect, useMemo, useState } from 'react';
import { Modal, Select, useToastErrorState } from './ui/index.jsx';

const FIELD_LABELS = {
  military_number: 'الرقم العسكري',
  full_name: 'الاسم الكامل',
  category: 'الفئة',
  rank: 'الرتبة',
  unit: 'الوحدة',
  notes: 'ملاحظات'
};
const REQUIRED_FIELDS = ['military_number', 'full_name'];

export default function PersonnelImportDialog({ preview, onImport, onClose }) {
  const [mappings, setMappings] = useState(preview.mappings || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useToastErrorState();
  const duplicateHeaders = useMemo(() => {
    const assigned = Object.entries(mappings).filter(([, header]) => header);
    return new Set(assigned
      .filter(([, header]) => assigned.filter(([, value]) => value === header).length > 1)
      .map(([, header]) => header));
  }, [mappings]);
  const missingRequired = REQUIRED_FIELDS.some((field) => !mappings[field]);

  useEffect(() => {
    setMappings(preview.mappings || {});
  }, [preview.previewId, preview.mappings]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onImport(preview.previewId, mappings);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="مراجعة أعمدة كشف الأفراد"
      titleId="personnel-import-title"
      onClose={onClose}
      closeOnEscape={!busy}
      size="large"
    >
        <form className="space-y-4" onSubmit={submit}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mt-1 text-sm text-slate-500">ستُحفظ رؤوس الأعمدة كما هي تماماً، وتُعرض كأعمدة قابلة للاستخدام في المستندات والأقسام.</p>
            </div>
            <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>إلغاء</button>
          </div>

          <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
            عُثر على {preview.rowCount} صفاً و{preview.headers.length} عموداً. اربط الرقم العسكري والاسم؛ الفئة اختيارية وتُقبل قيمها كما وردت في الملف.
          </p>
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
            استيراد آمن: يُحدّث بيانات الأفراد المطابقين بالرقم العسكري ويضيف الجدد فقط. الأفراد غير الموجودين في هذا الملف ورواتبهم وجزاءاتهم وسجلاتهم التاريخية لا تُحذف.
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            {Object.keys(FIELD_LABELS).map((field) => (
              <label className="text-xs font-semibold text-slate-700" key={field}>
                {FIELD_LABELS[field]}{REQUIRED_FIELDS.includes(field) ? ' *' : ''}
                <Select
                  className="mt-1"
                  value={mappings[field] || ''}
                  onChange={(event) => setMappings((current) => ({ ...current, [field]: event.target.value }))}
                  disabled={busy}
                >
                  <option value="">غير مربوط</option>
                  {preview.headers.map((header) => (
                    <option value={header.name} key={`${header.index}:${header.name}`}>{header.name}</option>
                  ))}
                </Select>
              </label>
            ))}
          </div>

          {duplicateHeaders.size > 0 && <p role="alert" className="text-sm text-rose-700">لا يمكن ربط عنوان Excel واحد بأكثر من حقل أساسي.</p>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

          <div className="data-table-scroll">
            <table className="data-table min-w-[700px]">
              <thead className="bg-slate-100 text-slate-700">
                <tr>{preview.headers.map((header) => <th className="whitespace-nowrap px-3 py-2" key={`${header.index}:${header.name}`}>{header.name}</th>)}</tr>
              </thead>
              <tbody>
                {preview.previewRows.map((row, rowIndex) => (
                  <tr className="border-t border-slate-100" key={rowIndex}>
                    {preview.headers.map((header) => (
                      <td className="whitespace-nowrap px-3 py-2" key={`${header.index}:${header.name}`}>{row[header.name] || '—'}</td>
                    ))}
                  </tr>
                ))}
                {!preview.previewRows.length && <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={preview.headers.length}>لا توجد صفوف بيانات للمعاينة.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>إلغاء</button>
            <button type="submit" className="button button-primary" disabled={busy || missingRequired || duplicateHeaders.size > 0 || !preview.rowCount}>
              {busy ? 'جارٍ استيراد البيانات...' : 'اعتماد الاستيراد'}
            </button>
          </div>
        </form>
    </Modal>
  );
}
