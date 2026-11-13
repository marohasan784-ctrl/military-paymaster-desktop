import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatNumber } from '../../../services/formatters.js';

const buttonVariants = {
  primary: 'button-primary',
  secondary: 'button-secondary',
  outline: 'button-outline',
  danger: 'button-danger',
  ghost: 'button-ghost'
};

export function Button({
  variant = 'primary',
  loading = false,
  size = 'default',
  className = '',
  children,
  disabled,
  ...props
}) {
  return (
    <button
      {...props}
      className={`button ${buttonVariants[variant] || buttonVariants.primary} ${size === 'small' ? 'button-sm' : ''} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="button-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

function FieldControl({ as: Element = 'input', type, className = '', validationMessage, ...props }) {
  const generatedId = useId();
  const describedBy = [props['aria-describedby'], validationMessage ? generatedId : null].filter(Boolean).join(' ') || undefined;
  return (
    <>
      <Element
        {...props}
        {...(type ? { type } : {})}
        className={`field ${className}`.trim()}
        aria-invalid={validationMessage ? true : props['aria-invalid']}
        aria-describedby={describedBy}
      />
      {validationMessage && <p className="field-error" id={generatedId} role="alert">{validationMessage}</p>}
    </>
  );
}

export function Input(props) {
  return <FieldControl {...props} />;
}

export function Select(props) {
  return <FieldControl as="select" {...props} />;
}

export function Textarea(props) {
  return <FieldControl as="textarea" {...props} />;
}

export function Checkbox({ className = '', ...props }) {
  return <input {...props} type="checkbox" className={`control-check ${className}`.trim()} />;
}

export function Radio({ className = '', ...props }) {
  return <input {...props} type="radio" className={`control-check ${className}`.trim()} />;
}

export function Card({ className = '', ...props }) {
  return <section {...props} className={`panel ${className}`.trim()} />;
}

export function PageHeader({
  as: Heading = 'h2',
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs = [],
  className = ''
}) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="min-w-0">
        {breadcrumbs.length > 0 && (
          <nav className="breadcrumbs" aria-label="مسار التنقل">
            <ol>
              {breadcrumbs.map((item, index) => (
                <li key={`${item.label}:${index}`}>
                  {index > 0 && <span className="breadcrumb-separator" aria-hidden="true">/</span>}
                  {item.onClick ? (
                    <button type="button" onClick={item.onClick}>{item.label}</button>
                  ) : (
                    <span aria-current="page">{item.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {eyebrow && <p className="page-header-eyebrow">{eyebrow}</p>}
        <Heading>{title}</Heading>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

const badgeVariants = {
  neutral: 'badge-neutral',
  gold: 'badge-gold',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info'
};

export function Badge({ variant = 'neutral', className = '', ...props }) {
  return <span {...props} className={`badge ${badgeVariants[variant] || badgeVariants.neutral} ${className}`.trim()} />;
}

export function Skeleton({ className = '', ...props }) {
  return <span {...props} className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}

export function EmptyState({ title = 'لا توجد بيانات', description, action, className = '' }) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'تعذر تحميل البيانات', description, action, className = '' }) {
  return (
    <div className={`error-state ${className}`.trim()} role="alert">
      <p className="error-state-title">{title}</p>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

const TOAST_COLORS = {
  success: { background: '#15803d', border: '#14532d' },
  danger: { background: '#dc2626', border: '#7f1d1d' }
};

export function Toast({ children, variant = 'success', onDismiss, action, className = '' }) {
  const isError = variant === 'danger';
  const colors = isError ? TOAST_COLORS.danger : TOAST_COLORS.success;
  const buttonStyle = {
    background: '#ffffff',
    color: colors.background,
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.45rem 1rem',
    fontSize: '0.85rem',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0
  };
  return (
    <div
      className={className}
      dir="rtl"
      role={isError ? 'alert' : 'status'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem 1.1rem',
        borderRadius: '0.75rem',
        background: colors.background,
        color: '#ffffff',
        border: `2px solid ${colors.border}`,
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
        opacity: 1,
        backdropFilter: 'none',
        textAlign: 'right'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '1.75rem',
            height: '1.75rem',
            flexShrink: 0,
            borderRadius: '9999px',
            background: 'rgba(255, 255, 255, 0.22)',
            fontSize: '1rem',
            fontWeight: 800
          }}
        >
          {isError ? '✕' : '✓'}
        </span>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: '0.95rem',
            fontWeight: 600,
            lineHeight: 1.7,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word'
          }}
        >
          {children}
        </div>
      </div>
      {(action || onDismiss) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: '0.5rem' }}>
          {action && (
            <button type="button" style={buttonStyle} onClick={action.onClick}>
              {action.label}
            </button>
          )}
          {onDismiss && (
            <button type="button" style={buttonStyle} onClick={onDismiss} aria-label="إغلاق الإشعار">
              إغلاق
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const TOAST_EVENT = 'finance:toast';

export function notifyToast(message, variant = 'success', action) {
  if (!message || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, {
    detail: { message, variant, action }
  }));
}

export function ToastHost() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const toastRef = useRef(null);
  const lastToastRef = useRef({ message: '', variant: '', shownAt: 0 });

  function startTimer(current) {
    window.clearTimeout(timerRef.current);
    if (!current) return;
    const duration = current.variant === 'danger' || current.action ? 10000 : 5000;
    timerRef.current = window.setTimeout(() => setToast(null), duration);
  }

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    const show = (event) => {
      if (!event.detail?.message) return;
      const now = Date.now();
      const message = String(event.detail.message);
      const previous = lastToastRef.current.message;
      const duplicate = event.detail.variant === lastToastRef.current.variant
        && now - lastToastRef.current.shownAt < 250
        && (message === previous || message.includes(previous) || previous.includes(message));
      if (duplicate) return;
      lastToastRef.current = { message, variant: event.detail.variant, shownAt: now };
      const next = { ...event.detail, id: now };
      setToast(next);
      startTimer(next);
    };
    window.addEventListener(TOAST_EVENT, show);
    return () => {
      window.removeEventListener(TOAST_EVENT, show);
      window.clearTimeout(timerRef.current);
    };
  }, []);

  function dismiss() {
    window.clearTimeout(timerRef.current);
    setToast(null);
  }

  if (!toast) return null;
  return createPortal(
    <div
      className="no-print"
      onMouseEnter={() => window.clearTimeout(timerRef.current)}
      onMouseLeave={() => startTimer(toastRef.current)}
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        width: 'min(30rem, calc(100vw - 2rem))',
        pointerEvents: 'auto'
      }}
    >
      <Toast key={toast.id} variant={toast.variant} action={toast.action} onDismiss={dismiss}>
        {toast.message}
      </Toast>
    </div>,
    document.body
  );
}

export function useToastErrorState() {
  const [error, setError] = useState('');
  function setErrorWithToast(message) {
    setError(message);
    if (message) notifyToast(message, 'danger');
  }
  return [error, setErrorWithToast];
}

function getFocusableElements(element) {
  return [...element.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((item) => item.getAttribute('aria-hidden') !== 'true');
}

export function Modal({
  open = true,
  title,
  titleId,
  onClose,
  closeOnEscape = true,
  closeOnBackdrop = false,
  size = 'large',
  children
}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const generatedTitleId = useId();
  const resolvedTitleId = titleId || generatedTitleId;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const firstFocusable = dialog && getFocusableElements(dialog)[0];
    (firstFocusable || dialog)?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = getFocusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [closeOnEscape, open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className={`modal-dialog modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? resolvedTitleId : undefined}
        tabIndex="-1"
        dir="rtl"
      >
        {title && <h2 id={resolvedTitleId} className="modal-title">{title}</h2>}
        {children}
      </section>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title = 'تأكيد العملية',
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  onConfirm,
  onCancel,
  busy = false
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} closeOnEscape={!busy} size="small">
      {description && <p className="modal-description">{description}</p>}
      <div className="modal-actions">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        <Button type="button" variant="danger" onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function DataTable({
  rows,
  columns,
  getRowKey,
  searchable = true,
  selectable = false,
  onPrintSelected,
  printSelectedLabel = 'طباعة المحدد في ملف واحد',
  searchLabel = 'بحث داخل الجدول',
  pageSize: initialPageSize = 20,
  emptyTitle = 'لا توجد سجلات مطابقة',
  emptyDescription,
  tableClassName = '',
  ariaLabel = 'جدول البيانات',
  selectionResetKey = 0
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: '', direction: 'asc' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useToastErrorState();
  const normalizedQuery = query.trim().toLocaleLowerCase('ar');
  const visibleRows = useMemo(() => {
    let result = rows;
    if (searchable && normalizedQuery) {
      result = result.filter((row) => columns.some((column) => {
        if (column.searchable === false) return false;
        const value = column.searchValue ? column.searchValue(row) : row[column.key];
        return String(value ?? '').toLocaleLowerCase('ar').includes(normalizedQuery);
      }));
    }
    const sortedColumn = columns.find((column) => column.key === sort.key);
    if (sortedColumn) {
      result = [...result].sort((first, second) => {
        const a = sortedColumn.sortValue ? sortedColumn.sortValue(first) : first[sortedColumn.key];
        const b = sortedColumn.sortValue ? sortedColumn.sortValue(second) : second[sortedColumn.key];
        const comparison = typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a ?? '').localeCompare(String(b ?? ''), 'ar', { numeric: true, sensitivity: 'base' });
        return sort.direction === 'asc' ? comparison : -comparison;
      });
    }
    return result;
  }, [columns, normalizedQuery, rows, searchable, sort]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const pageRows = visibleRows.slice(page * pageSize, (page + 1) * pageSize);
  const selectedRows = rows.filter((row) => selectedKeys.has(String(getRowKey(row))));
  const printableColumns = columns.filter((column) => column.printable !== false
    && column.searchable !== false
    && column.sortable !== false);

  useEffect(() => {
    setPage(0);
  }, [normalizedQuery, pageSize]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [selectionResetKey]);

  useEffect(() => {
    setQuery('');
    setSort({ key: '', direction: 'asc' });
    setPage(0);
    setPrintError('');
  }, [selectionResetKey]);

  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  function toggleSort(column) {
    if (column.sortable === false) return;
    setPage(0);
    setSort((current) => ({
      key: column.key,
      direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  function toggleRowSelection(row) {
    const key = String(getRowKey(row));
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectVisibleRows() {
    setSelectedKeys((current) => {
      const next = new Set(current);
      visibleRows.forEach((row) => next.add(String(getRowKey(row))));
      return next;
    });
  }

  async function printSelectedRows() {
    if (!selectedRows.length || !printableColumns.length) return;
    setPrinting(true);
    setPrintError('');
    try {
      if (onPrintSelected) {
        await onPrintSelected(selectedRows);
      } else {
        document.body.classList.add('print-selected-only');
        await window.financeApp.exportPdf();
        notifyToast('اكتملت طباعة السجلات المحددة.', 'success');
      }
    } catch (issue) {
      setPrintError(`تعذرت طباعة السجلات المحددة: ${issue.message}`);
    } finally {
      document.body.classList.remove('print-selected-only');
      setPrinting(false);
    }
  }

  return (
    <div className="data-table-container">
      {searchable && (
        <label className="data-table-search">
          <span className="sr-only">{searchLabel}</span>
          <input
            type="search"
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchLabel}
            aria-label={searchLabel}
          />
        </label>
      )}
      {selectable && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2">
          <span className="me-2 text-sm text-slate-600">المحدد: {formatNumber(selectedRows.length)}</span>
          <Button type="button" variant="outline" size="small" onClick={selectVisibleRows} disabled={!visibleRows.length}>
            تحديد النتائج
          </Button>
          <Button type="button" variant="outline" size="small" onClick={printSelectedRows} disabled={!selectedRows.length || !printableColumns.length || printing}>
            {printing ? 'جارٍ إعداد الطباعة...' : printSelectedLabel}
          </Button>
          <Button type="button" variant="ghost" size="small" onClick={() => setSelectedKeys(new Set())} disabled={!selectedRows.length || printing}>
            إلغاء التحديد
          </Button>
          {printError && <p className="w-full text-sm text-rose-700" role="alert">{printError}</p>}
        </div>
      )}
      <div className="data-table-scroll">
        <table className={`data-table ${tableClassName}`.trim()} aria-label={ariaLabel}>
          <thead>
            <tr>
              {selectable && <th className="no-print">تحديد</th>}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={column.className || ''}
                  aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortable === false ? column.label : (
                    <button className="table-sort-button" type="button" onClick={() => toggleSort(column)}>
                      {column.label}
                      <span aria-hidden="true">{sort.key === column.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => (
              <tr key={getRowKey(row)} className={`data-table-row ${selectable && selectedKeys.has(String(getRowKey(row))) ? 'is-selected' : ''}`}>
                {selectable && (
                  <td className="no-print">
                    <Checkbox
                      checked={selectedKeys.has(String(getRowKey(row)))}
                      onChange={() => toggleRowSelection(row)}
                      aria-label={`تحديد سجل ${getRowKey(row)}`}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className={column.cellClassName || ''}>
                    {column.render ? column.render(row, index) : row[column.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
            {!pageRows.length && (
              <tr>
                <td colSpan={columns.length + Number(selectable)}>
                  <EmptyState title={emptyTitle} description={emptyDescription} className="data-table-empty" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectable && selectedRows.length > 0 && (
        createPortal(
          <section className="data-table-print-sheet" dir="rtl" aria-hidden="true">
            <h1>{ariaLabel}</h1>
            <p>عدد السجلات: {formatNumber(selectedRows.length)}</p>
            <table>
              <thead>
                <tr>{printableColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {selectedRows.map((row, rowIndex) => (
                  <tr key={getRowKey(row)}>
                    {printableColumns.map((column) => (
                      <td key={column.key}>{column.render ? column.render(row, rowIndex) : row[column.key] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>,
          document.body
        )
      )}
      <div className="data-table-pagination" aria-label="ترقيم صفحات الجدول">
        <label>
          <span>صفوف في الصفحة</span>
          <select className="field data-table-page-size" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {[10, 20, 25, 50, 100].map((size) => <option value={size} key={size}>{size}</option>)}
          </select>
        </label>
        <span aria-live="polite">
          {visibleRows.length
            ? `${formatNumber(page * pageSize + 1)}–${formatNumber(Math.min((page + 1) * pageSize, visibleRows.length))} من ${formatNumber(visibleRows.length)}`
            : '٠ سجل'}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="small" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} aria-label="الصفحة السابقة">السابق</Button>
          <Button type="button" variant="outline" size="small" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1} aria-label="الصفحة التالية">التالي</Button>
        </div>
      </div>
    </div>
  );
}
