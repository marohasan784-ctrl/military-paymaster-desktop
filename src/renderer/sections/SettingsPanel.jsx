import { useState } from 'react';
import { Card, Checkbox, Select, notifyToast } from '../components/ui/index.jsx';

export default function SettingsPanel({ legacySalaryScreenVisible, onChangeLegacySalaryScreenVisible, onClose }) {
  const [numberingSystem, setNumberingSystem] = useState(
    () => window.localStorage.getItem('finance.numberingSystem') || 'arab'
  );
  const [calendar, setCalendar] = useState(
    () => window.localStorage.getItem('finance.calendar') || 'gregory'
  );

  const updatePreference = (key, value, setValue) => {
    try {
      window.localStorage.setItem(key, value);
      setValue(value);
      window.dispatchEvent(new Event('finance:formatting-preferences-change'));
      notifyToast('تم حفظ تفضيلات العرض.', 'success');
    } catch (issue) {
      notifyToast(`تعذر حفظ تفضيلات العرض: ${issue.message}`, 'danger');
    }
  };

  return (
    <Card className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">إعدادات النظام</h2>
          <p className="mt-1 text-xs text-slate-500">إخفاء الشاشة القديمة لا يحذف بياناتها أو يغيرها.</p>
        </div>
        <button className="button button-outline" type="button" onClick={onClose}>إغلاق الإعدادات</button>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm">
        <Checkbox
          className="mt-1"
          checked={legacySalaryScreenVisible}
          onChange={(event) => onChangeLegacySalaryScreenVisible(event.target.checked)}
        />
        <span>
          <span className="block font-semibold text-slate-800">إظهار شاشة الماهيات القديمة</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">عند إلغاء الخيار تختفي الشاشة من القائمة والاختصارات فقط؛ تظل البيانات محفوظة كما هي.</span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-slate-800">
          <span className="block">نظام عرض الأرقام</span>
          <Select
            value={numberingSystem}
            onChange={(event) => updatePreference('finance.numberingSystem', event.target.value, setNumberingSystem)}
          >
            <option value="arab">عربية (١٢٣)</option>
            <option value="latn">لاتينية (123)</option>
          </Select>
        </label>
        <label className="space-y-2 text-sm font-semibold text-slate-800">
          <span className="block">التقويم</span>
          <Select
            value={calendar}
            onChange={(event) => updatePreference('finance.calendar', event.target.value, setCalendar)}
          >
            <option value="gregory">ميلادي</option>
            <option value="islamic">هجري</option>
          </Select>
        </label>
      </div>
    </Card>
  );
}
