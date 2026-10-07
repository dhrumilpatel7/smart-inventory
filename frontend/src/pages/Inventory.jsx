import { useMemo, useState } from 'react';
import { InOutChart } from '../charts/Charts';
import { IconPlus } from '../components/Icons';
import { Alert, Card, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pagination, Segmented, SortTh, StatCard, TypeBadge } from '../components/ui';
import { useToast } from '../context/ToastContext';
import useFetch from '../hooks/useFetch';
import { useProductOptions } from '../hooks/useOptions';
import { errorMessage, inventoryApi } from '../services/api';
import { formatDate, formatNumber, todayLocal } from '../utils/format';

function TransactionForm({ products, onClose, onSaved }) {
  const [form, setForm] = useState({ productId: '', type: 'IN', quantity: '1', date: todayLocal() });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const product = useMemo(() => products.find((p) => p.productId === form.productId), [products, form.productId]);
  const quantity = Number(form.quantity);
  const validQuantity = Number.isInteger(quantity) && quantity > 0;
  const tooMany = product && validQuantity && form.type === 'OUT' && quantity > product.stock;
  const after = product && validQuantity && !tooMany ? product.stock + (form.type === 'IN' ? quantity : -quantity) : null;

  async function submit(e) {
    e.preventDefault();
    if (!product) { setError('Choose a product.'); return; }
    if (!validQuantity) { setError('Quantity must be a whole number greater than 0.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await inventoryApi.create({ productId: form.productId, type: form.type, quantity, date: form.date });
      toast.success(`${result.data.transactionId} saved. ${result.product.name} stock is now ${result.product.stock}.`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New inventory transaction"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="tx-form" className="btn btn-primary" disabled={busy || !product || !validQuantity || tooMany}>{busy ? 'Saving…' : 'Save transaction'}</button>
        </>
      )}
    >
      <form id="tx-form" onSubmit={submit} className="stack" noValidate>
        {error && <Alert type="error">{error}</Alert>}
        <Field label="Movement type">
          <Segmented label="Movement type" value={form.type} onChange={(type) => setForm((f) => ({ ...f, type }))} options={[{ value: 'IN', label: 'IN · stock received' }, { value: 'OUT', label: 'OUT · stock removed' }]} />
        </Field>
        <Field label="Product">
          <select className="select" value={form.productId} onChange={set('productId')} required>
            <option value="">Select a product…</option>
            {products.map((p) => <option key={p.productId} value={p.productId}>{p.name} ({p.productId}) — {p.stock} in stock</option>)}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Quantity" error={tooMany ? `Only ${product.stock} in stock.` : undefined}>
            <input className="input" type="number" min="1" step="1" value={form.quantity} onChange={set('quantity')} required />
          </Field>
          <Field label="Date">
            <input className="input" type="date" value={form.date} max={todayLocal()} onChange={set('date')} required />
          </Field>
        </div>
        <div className="formula">
          <dl className="kv">
            <dt>Current stock</dt><dd>{product ? formatNumber(product.stock) : '—'}</dd>
            <dt>Stock after this transaction</dt><dd>{after === null ? '—' : formatNumber(after)}</dd>
          </dl>
        </div>
        <p className="small muted">Use OUT here for removals that are not sales (damage, returns to supplier). Sales create their OUT transaction automatically on the Sales page.</p>
      </form>
    </Modal>
  );
}

export default function Inventory() {
  const [filters, setFilters] = useState({ productId: '', type: '', from: '', to: '' });
  const [groupBy, setGroupBy] = useState('month');
  const [sort, setSort] = useState({ field: 'date', order: 'desc' });
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);

  const { products } = useProductOptions([version]);
  const list = useFetch(
    () => inventoryApi.list({ ...filters, sort: sort.field, order: sort.order, page, limit: 15 }),
    [filters, sort, page, version]
  );
  // The chart follows the product and date filters, but always shows both IN and OUT.
  const chart = useFetch(
    () => inventoryApi.analytics({ productId: filters.productId, from: filters.from, to: filters.to, groupBy }),
    [filters.productId, filters.from, filters.to, groupBy, version]
  );

  const setFilter = (key) => (e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(1); };
  const hasFilters = Boolean(filters.productId || filters.type || filters.from || filters.to);
  const summary = list.data?.summary;

  return (
    <>
      <PageHeader title="Inventory" description="Every stock movement: IN adds stock, OUT removes it. This is the audit history of the inventory.">
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}><IconPlus /> New transaction</button>
      </PageHeader>

      {summary && (
        <div className="grid grid-stats" style={{ marginBottom: 16 }}>
          <StatCard label="Units IN" value={formatNumber(summary.inUnits)} hint={`${formatNumber(summary.inTransactions)} transactions`} color="#2a78d6" />
          <StatCard label="Units OUT" value={formatNumber(summary.outUnits)} hint={`${formatNumber(summary.outTransactions)} transactions`} color="#eb6834" />
          <StatCard label="Net movement (IN − OUT)" value={`${summary.netUnits > 0 ? '+' : ''}${formatNumber(summary.netUnits)}`} hint="units, for the rows listed below" />
          <StatCard label="Transactions" value={formatNumber(summary.totalTransactions)} hint={hasFilters ? 'matching the filters' : 'in total'} />
        </div>
      )}

      <Card
        title="Stock IN vs OUT"
        subtitle="Units moved per period (follows the product and date filters)"
        actions={<Segmented label="Group by" value={groupBy} onChange={setGroupBy} options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />}
      >
        {chart.loading ? <Loading /> : chart.error ? <ErrorState message={chart.error} onRetry={chart.reload} /> : (
          <InOutChart data={chart.data.movementByPeriod} height={250} />
        )}
      </Card>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="toolbar">
          <Field label="Product" className="wide">
            <select className="select" value={filters.productId} onChange={setFilter('productId')}>
              <option value="">All products</option>
              {products.map((p) => <option key={p.productId} value={p.productId}>{p.name} ({p.productId})</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select className="select" value={filters.type} onChange={setFilter('type')}>
              <option value="">IN and OUT</option>
              <option value="IN">IN only</option>
              <option value="OUT">OUT only</option>
            </select>
          </Field>
          <Field label="From"><input className="input" type="date" value={filters.from} max={filters.to || undefined} onChange={setFilter('from')} /></Field>
          <Field label="To"><input className="input" type="date" value={filters.to} min={filters.from || undefined} onChange={setFilter('to')} /></Field>
          {hasFilters && <button type="button" className="btn btn-ghost" onClick={() => { setFilters({ productId: '', type: '', from: '', to: '' }); setPage(1); }}>Clear filters</button>}
        </div>

        {list.loading ? <Loading label="Loading transactions…" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.data.length === 0 ? (
          <EmptyState title={hasFilters ? 'No transactions match these filters' : 'No inventory transactions yet'} message={hasFilters ? 'Try a wider date range or clear the filters.' : 'Import the CSV data or add a transaction.'} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <SortTh field="transactionId" sort={sort} onSort={setSort}>Transaction ID</SortTh>
                    <SortTh field="date" sort={sort} onSort={setSort}>Date</SortTh>
                    <SortTh field="productId" sort={sort} onSort={setSort}>Product</SortTh>
                    <SortTh field="type" sort={sort} onSort={setSort}>Type</SortTh>
                    <SortTh field="quantity" sort={sort} onSort={setSort} className="num">Quantity</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((t) => (
                    <tr key={t.transactionId}>
                      <td className="mono">{t.transactionId}</td>
                      <td className="nowrap">{formatDate(t.date)}</td>
                      <td><span className="strong">{t.productName || '(deleted product)'}</span> <span className="small muted mono">{t.productId}</span></td>
                      <td><TypeBadge type={t.type} /></td>
                      <td className="num">{t.type === 'IN' ? '+' : '−'}{formatNumber(t.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={list.data.pagination} onPage={setPage} refreshing={list.refreshing} />
          </>
        )}
      </div>

      {adding && <TransactionForm products={products} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setPage(1); setVersion((v) => v + 1); }} />}
    </>
  );
}
