export default function OfficialHeader({
  logo,
  onSelectLogo,
  logoBusy,
  onToggleNavigation,
  navigationExpanded,
  navigationToggleRef
}) {
  return (
    <header className="official-header m-4 rounded-2xl border border-slate-700 bg-slate-900 px-6 py-4 text-slate-100 shadow-lg">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex items-center gap-3">
          <button
            ref={navigationToggleRef}
            className="button button-outline min-h-11 border-slate-600 bg-slate-800 px-3 text-slate-100 hover:border-amber-400 hover:bg-slate-700"
            type="button"
            onClick={onToggleNavigation}
            aria-controls="app-navigation"
            aria-expanded={navigationExpanded}
            aria-label={navigationExpanded ? 'طي القائمة الجانبية أو إغلاقها' : 'توسيع القائمة الجانبية أو فتحها'}
            title={navigationExpanded ? 'طي القائمة أو إغلاقها' : 'توسيع القائمة أو فتحها'}
          >
            <span aria-hidden="true">☰</span>
            <span className="hidden sm:inline">القائمة</span>
          </button>
          {logo ? (
            <img className="h-14 w-14 rounded-xl bg-white p-1 object-contain" src={logo} alt="شعار الفوج" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-xs font-bold text-slate-300">
              شعار
            </div>
          )}
          <div className="min-w-24">
            <p className="text-base font-bold text-white">مكتب الماليات</p>
            <p className="mt-1 text-xs text-slate-300">الجهة التجريبية</p>
          </div>
          <button className="button min-h-11 border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 hover:border-amber-400 hover:bg-slate-700" onClick={onSelectLogo} disabled={logoBusy}>
            {logoBusy ? 'جارٍ حفظ الشعار...' : logo ? 'تغيير الشعار' : 'إضافة شعار'}
          </button>
        </div>
        <div className="grid gap-x-5 gap-y-2 text-xs leading-5 text-slate-300 sm:grid-cols-2 xl:grid-cols-3">
          <p><span className="font-bold text-amber-400">قائد الجهة</span><br />اسم القائد التجريبي</p>
          <p><span className="font-bold text-amber-400">رئيس قسم الماليات</span><br />اسم المسؤول المالي التجريبي</p>
          <p><span className="font-bold text-amber-400">مهندس تطوير النظام</span><br />اسم المطور التجريبي</p>
        </div>
      </div>
    </header>
  );
}
