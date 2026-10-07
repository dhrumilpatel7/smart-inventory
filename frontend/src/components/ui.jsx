// Small reusable UI pieces used on every page.
import { useEffect } from 'react';
import { IconClose } from './Icons';

export function PageHeader({ title, description, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state" role="alert">
      <h3>Could not load this data</h3>
      <p>{message}</p>
      {onRetry && <button type="button" className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title = 'Nothing to show', message, children }) {
  return (
    <div className="state">
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {children}
    </div>
  );
}

export function Alert({ type = 'info', children, action }) {
  return (
    <div className={`alert ${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <div>{children}</div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, color, title }) {
  return (
    <div className="card stat" title={title}>
      <div className="stat-label">
        {color && <span className="stat-dot" style={{ background: color }} />}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, pad = true }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {actions}
        </div>
      )}
      <div className={pad ? 'card-body' : ''} style={pad ? undefined : { marginTop: title ? 14 : 0 }}>{children}</div>
    </section>
  );
}

const STOCK = {
  OK: { cls: 'good', text: 'In stock' },
  LOW: { cls: 'warn', text: 'Low stock' },
  OUT: { cls: 'danger', text: 'Out of stock' },
};
export function StockBadge({ status }) {
  const s = STOCK[status] || STOCK.OK;
  return <span className={`badge ${s.cls}`}>{s.text}</span>;
}

export function TypeBadge({ type }) {
  return <span className={`badge ${type === 'IN' ? 'info' : 'neutral'}`}>{type === 'IN' ? 'IN · stock added' : 'OUT · stock removed'}</span>;
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={value === o.value ? 'on' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

// Clickable column header that toggles ascending / descending sort.
export function SortTh({ field, sort, onSort, children, className = '' }) {
  const active = sort.field === field;
  return (
    <th className={className} aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => onSort({ field, order: active && sort.order === 'asc' ? 'desc' : 'asc' })}>
        {children}
        <span aria-hidden style={{ opacity: active ? 1 : 0.3 }}>{active && sort.order === 'desc' ? '↓' : '↑'}</span>
      </button>
    </th>
  );
}

export function Pagination({ pagination, onPage, refreshing }) {
  if (!pagination) return null;
  const { page, pages, total, limit } = pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="table-foot">
      <span className="row">
        Showing {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}
        {refreshing && <span className="spinner sm" aria-label="Updating" />}
      </span>
      <span className="row">
        <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </span>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      )}
    >
      <p>{message}</p>
    </Modal>
  );
}
