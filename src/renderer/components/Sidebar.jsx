const fixedNavigationItems = [
  ['home', 'لوحة المتابعة', '⌂'],
  ['personnel', 'سجل الأفراد', '♙'],
  ['salaries', 'الماهيات', '▤'],
  ['supplies', 'أوامر التوريد', '▣'],
  ['invoices', 'الفواتير الإلكترونية', '▧']
];

const configurableCoreModules = new Set(['accessions', 'deletions', 'penalties']);

export default function Sidebar({
  activeSection,
  modules = [],
  onNavigate,
  logo,
  legacySalaryScreenVisible = true,
  collapsed = false,
  mobileOpen = false,
  compactViewport = false
}) {
  const configurableNavigationItems = modules
    .filter((module) => (
      module.is_active !== 0
      && (module.is_builtin === 0 || configurableCoreModules.has(module.id))
    ))
    .map((module) => [module.id, module.title, module.icon || '▦']);
  const items = [
    ...fixedNavigationItems.filter(([id]) => id === 'home'),
    ...configurableNavigationItems,
    ...fixedNavigationItems.filter(([id]) => (
      id !== 'home' && (id !== 'salaries' || legacySalaryScreenVisible)
    ))
  ];

  return (
    <aside
      id="app-navigation"
      className={`no-print fixed inset-y-0 end-0 z-40 flex h-screen w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-700 bg-slate-900 px-4 py-6 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:min-h-screen lg:translate-x-0 ${collapsed ? 'lg:w-20' : 'lg:w-64'} ${mobileOpen ? 'visible translate-x-0' : 'invisible translate-x-full lg:visible'}`}
      aria-hidden={compactViewport && !mobileOpen}
    >
      <div className={`mb-9 flex items-center gap-3 px-2 ${collapsed ? 'lg:justify-center' : ''}`}>
        {logo ? (
          <img
            className="h-12 w-12 shrink-0 rounded-xl border border-amber-400/40 bg-white p-1 object-contain shadow-md shadow-amber-950/30"
            src={logo}
            alt="شعار الجهة"
            title="شعار الجهة"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-400 text-lg font-bold text-slate-950">
            م
          </div>
        )}
        <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
          <h1 className="truncate text-sm font-bold text-white">الجهة التجريبية</h1>
          <p className="mt-1 text-xs text-slate-300">مكتب الماليات</p>
        </div>
      </div>

      <p className={`mb-3 px-3 text-xs font-bold text-slate-400 ${collapsed ? 'lg:hidden' : ''}`}>القائمة الرئيسية</p>
      <nav className="space-y-1" aria-label="القائمة الرئيسية">
        {items.map(([id, label, icon]) => (
          <button
            key={id}
            className={`nav-item ${collapsed ? 'lg:justify-center lg:px-2' : ''} ${activeSection === id ? 'nav-item-active' : ''}`}
            onClick={() => onNavigate(id)}
            aria-current={activeSection === id ? 'page' : undefined}
            aria-label={label}
            title={collapsed ? label : undefined}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-base" aria-hidden="true">
              {icon}
            </span>
            <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
          </button>
        ))}
      </nav>

      <div className={`mt-auto border-t border-slate-700 px-3 pt-5 ${collapsed ? 'lg:hidden' : ''}`}>
        <p className="text-xs font-semibold text-slate-300">بيئة عمل محلية</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">البيانات محفوظة على هذا الجهاز</p>
      </div>
    </aside>
  );
}
