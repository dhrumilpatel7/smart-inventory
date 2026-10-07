import { useMemo, useState } from 'react';
import { IconPlus } from '../components/Icons';
import { Alert, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pagination, SortTh, StatCard } from '../components/ui';
import { useToast } from '../context/ToastContext';
import useFetch from '../hooks/useFetch';
import { useProductOptions } from '../hooks/useOptions';
import { errorMessage, salesApi } from '../services/api';
import { formatCurrency, formatDate, formatNumber, todayLocal } from '../utils/format';

function SaleForm({ products, onClose, onSaved }) {
  const [form, setForm] = useState({ productId: '', quantity: '1', saleDate: todayLocal() });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const product = useMemo(() => products.find((p) => p.productId === form.productId), [products, form.productId]);
  const quantity = Number(form.quantity);
  const validQuantity = Number.isInteger(quantity) && quantity > 0;
  const tooMany = product && validQuantity && quantity > product.stock;
  // Shown for information only - the server calculates and stores the real totalAmount.
  const total = product && validQuantity ? product.price * quantity : null;

  async function submit(e) {
    e.preventDefault();
    if (!product) { setError('Choose a product.'); return; }
    if (!validQuantity) { setError('Quantity must be a whole number greater than 0.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await salesApi.create({ productId: form.productId, quantity, saleDate: form.saleDate });
      toast.success(`${result.data.saleId} recorded. ${result.product.name} stock is now ${result.product.stock}; ${result.inventoryTransaction.transactionId} (OUT) created.`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Record a sale"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="sale-form" className="btn btn-primary" disabled={busy || !product || !validQuantity || tooMany}>{busy ? 'Recording…' : 'Record sale'}</button>
        </>
      )}
    >
      <form id="sale-form" onSubmit={submit} className="stack" noValidate>
        {error && <Alert type="error">{error}</Alert>}
        <Field label="Product">
          <select className="select" value={form.productId} onChange={set('productId')} required autoFocus>
            <option value="">Select a product…</option>
            {products.map((p) => (
              <option key={p.productId} value={p.productId} disabled={p.stock <= 0}>
                {p.name} ({p.productId}) — {p.stock > 0 ? `${p.stock} in stock` : 'out of stock'}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Quantity" error={tooMany ? `Only ${product.stock} in stock.` : undefined}>
            <input className="input" type="number" min="1" step="1" max={product ? product.stock : undefined} value={form.quantity} onChange={set('quantity')} required />
          </Field>
          <Field label="Sale date">
            <input className="input" type="date" value={form.saleDate} max={todayLocal()} onChange={set('saleDate')} required />
          </Field>
        </div>
        <div className="formula">
          <dl className="kv">
            <dt>Unit price</dt><dd>{product ? formatCurrency(product.price) : '—'}</dd>
            <dt>Total amount (price × quantity)</dt><dd>{total === null ? '—' : formatCurrency(total)}</dd>
            <dt>Stock after this sale</dt><dd>{product && validQuantity && !tooMany ? formatNumber(product.stock - quantity) : '—'}</dd>
          </dl>
        </div>
        <p className="small muted">Saving will, in one database transaction: create the sale, reduce the product stock, and add an OUT inventory transaction.</p>
      </form>
    </Modal>
  );
}

export default function Sales() {
  const [filters, setFilters] = useState({ productId: '', from: '', to: '' });
  const [sort, setSort] = useState({ field: 'saleDate', order: 'desc' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);

  const { products } = useProductOptions([version]);
  const { data, loading, error, reload, refreshing } = useFetch(
    () => salesApi.list({ ...filters, sort: sort.field, order: sort.order, page, limit: 15 }),
    [filters, sort, page, version]
  );

  const setFilter = (key) => (e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(1); };
  const hasFilters = Boolean(filters.productId || filters.from || filters.to);

  return (
    <>
      <PageHeader title="Sales" description="Sales history. Recording a sale reduces stock and creates an OUT inventory transaction automatically.">
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><IconPlus /> Record sale</button>
      </PageHeader>

      {data && (
        <div className="grid grid-stats" style={{ marginBottom: 16 }}>
          <StatCard label={hasFilters ? 'Revenue (filtered)' : 'Total revenue'} value={formatCurrency(data.totals.revenue)} />
          <StatCard label="Units sold" value={formatNumber(data.totals.units)} />
          <StatCard label="Number of sales" value={formatNumber(data.totals.orders)} />
          <StatCard label="Average sale value" value={formatCurrency(data.totals.averageOrderValue)} />
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <Field label="Product" className="wide">
            <select className="select" value={filters.productId} onChange={setFilter('productId')}>
              <option value="">All products</option>
              {products.map((p) => <option key={p.productId} value={p.productId}>{p.name} ({p.productId})</option>)}
            </select>
          </Field>
          <Field label="From"><input className="input" type="date" value={filters.from} max={filters.to || undefined} onChange={setFilter('from')} /></Field>
          <Field label="To"><input className="input" type="date" value={filters.to} min={filters.from || undefined} onChange={setFilter('to')} /></Field>
          {hasFilters && <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ productId: '', from: '', to: '' }); setPage(1); }}>Clear filters</button>}
        </div>

        {loading ? <Loading label="Loading sales…" /> : error ? <ErrorState message={error} onRetry={reload} /> : data.data.length === 0 ? (
          <EmptyState title={hasFilters ? 'No sales match these filters' : 'No sales yet'} message={hasFilters ? 'Try a wider date range or another product.' : 'Import the CSV data or record your first sale.'} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <SortTh field="saleId" sort={sort} onSort={setSort}>Sale ID</SortTh>
                    <SortTh field="saleDate" sort={sort} onSort={setSort}>Sale date</SortTh>
                    <SortTh field="productId" sort={sort} onSort={setSort}>Product</SortTh>
                    <th>Category</th>
                    <SortTh field="quantity" sort={sort} onSort={setSort} className="num">Quantity</SortTh>
                    <SortTh field="totalAmount" sort={sort} onSort={setSort} className="num">Total amount</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((s) => (
                    <tr key={s.saleId}>
                      <td className="mono">{s.saleId}</td>
                      <td className="nowrap">{formatDate(s.saleDate)}</td>
                      <td><span className="strong">{s.productName || '(deleted product)'}</span> <span className="small muted mono">{s.productId}</span></td>
                      <td>{s.category || '—'}</td>
                      <td className="num">{formatNumber(s.quantity)}</td>
                      <td className="num">{formatCurrency(s.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={data.pagination} onPage={setPage} refreshing={refreshing} />
          </>
        )}
      </div>

      {adding && <SaleForm products={products} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setPage(1); setVersion((v) => v + 1); }} />}
    </>
  );
}
