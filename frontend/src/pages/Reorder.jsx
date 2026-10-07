import { IconLeaf } from '../components/Icons';
import { Fragment, useState } from 'react';
import StaleForecastNotice from '../components/ForecastNotice';
import RunForecastButton from '../components/RunForecastButton';
import { Alert, Card, ConfirmDialog, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Segmented, StatCard, StockBadge } from '../components/ui';
import { useToast } from '../context/ToastContext';
import useFetch from '../hooks/useFetch';
import { errorMessage, reorderApi } from '../services/api';
import { formatCurrency, formatDateTime, formatNumber } from '../utils/format';

const PRIORITY = {
  CRITICAL: { cls: 'danger', text: 'Critical' },
  HIGH: { cls: 'warn', text: 'High' },
  MEDIUM: { cls: 'info', text: 'Medium' },
  NONE: { cls: 'neutral', text: 'Not needed' },
};
const PO_STATUS = { PENDING: 'warn', ORDERED: 'info', RECEIVED: 'good', CANCELLED: 'neutral' };
const NEXT_LABEL = { ORDERED: 'Mark ordered', RECEIVED: 'Mark received', CANCELLED: 'Cancel' };

function OrderForm({ item, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(String(Math.max(1, item.reorderQuantity)));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const q = Number(quantity);
  const valid = Number.isInteger(q) && q > 0;

  async function submit(e) {
    e.preventDefault();
    if (!valid) { setError('Quantity must be a whole number greater than 0.'); return; }
    setBusy(true);
    try {
      const result = await reorderApi.createOrder({ productId: item.productId, quantity: q, note });
      toast.success(`${result.data.orderId} created for ${item.name}.`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Create purchase order"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="po-form" className="btn btn-primary" disabled={busy || !valid}>{busy ? 'Creating…' : 'Create order'}</button>
        </>
      )}
    >
      <form id="po-form" onSubmit={submit} className="stack" noValidate>
        {error && <Alert type="error">{error}</Alert>}
        <div className="formula">
          <dl className="kv">
            <dt>Product</dt><dd>{item.name} ({item.productId})</dd>
            <dt>Supplier</dt><dd>{item.supplierName || item.supplierId}</dd>
            <dt>Recommended quantity</dt><dd>{formatNumber(item.reorderQuantity)} units</dd>
            <dt>Estimated cost at selling price</dt><dd>{valid ? formatCurrency(q * item.price) : '—'}</dd>
          </dl>
        </div>
        <Field label="Order quantity">
          <input className="input" type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required autoFocus />
        </Field>
        <Field label="Note (optional)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <p className="small muted">The order starts as PENDING. When it is marked RECEIVED, the quantity is added to stock and an IN inventory transaction is created.</p>
      </form>
    </Modal>
  );
}

export default function Reorder() {
  const toast = useToast();
  const [horizon, setHorizon] = useState(7);
  const [show, setShow] = useState('needed');
  const [expanded, setExpanded] = useState(null);
  const [ordering, setOrdering] = useState(null);
  const [statusChange, setStatusChange] = useState(null); // { order, status }
  const [statusBusy, setStatusBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const rec = useFetch(() => reorderApi.recommendations({ horizon }), [horizon, version]);
  const orders = useFetch(() => reorderApi.orders({ limit: 50 }), [version]);

  async function applyStatus() {
    setStatusBusy(true);
    try {
      const result = await reorderApi.setOrderStatus(statusChange.order.orderId, statusChange.status);
      toast.success(result.message);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStatusBusy(false);
      setStatusChange(null);
    }
  }

  if (rec.loading) return <Loading label="Calculating reorder recommendations…" />;
  if (rec.error) return <div className="card"><ErrorState message={rec.error} onRetry={rec.reload} /></div>;

  const { data } = rec;
  const items = show === 'needed' ? data.items.filter((i) => i.needsReorder) : data.items;
  const { settings, summary } = data;

  return (
    <>
      <PageHeader title="Reorder recommendations" description="Which products to order and how many, based on the demand forecast and the current stock in MongoDB.">
        <Segmented label="Planning period" value={horizon} onChange={setHorizon} options={[{ value: 7, label: 'Next 7 days' }, { value: 30, label: 'Next 30 days' }]} />
      </PageHeader>

      <StaleForecastNotice stale={data.forecast.stale} onDone={refresh} />
      {!data.forecast.available && (
        <div style={{ marginBottom: 16 }}>
          <Alert type="warn" action={<RunForecastButton onDone={refresh} primary={false} />}>
            <b>No demand forecast is available yet.</b> Predicted demand is shown as 0, so these recommendations are incomplete. Run the forecast first.
          </Alert>
        </div>
      )}

      <div className="grid grid-stats">
        <StatCard label="Products to reorder" value={formatNumber(summary.productsNeedingReorder)} hint={`of ${formatNumber(summary.totalProducts)} products`} />
        <StatCard label="Units to order" value={formatNumber(summary.totalUnitsToOrder)} hint={`to cover the next ${horizon} days`} />
        <StatCard label="Estimated value" value={formatCurrency(summary.estimatedCost)} hint="at selling price (cost price is not in the data)" />
        <StatCard label="Critical / high priority" value={`${summary.critical} / ${summary.high}`} hint="out of stock / low or below forecast" color="#d03b3b" />
      </div>

      <div className="formula" style={{ margin: '16px 0' }}>
        <div className="strong" style={{ marginBottom: 6 }}>How the quantity is calculated</div>
        <div><code>Reorder quantity = Forecast demand + Safety stock − Current stock − On order</code> &nbsp; (if negative, 0)</div>
        <div style={{ marginTop: 6 }}><code>Safety stock = {settings.safetyZ} × standard deviation of daily demand × √{settings.leadTimeDays}</code></div>
        <div className="small muted" style={{ marginTop: 8 }}>
          Forecast demand is the model’s predicted units for the next {horizon} days{data.forecast.available ? ` (${data.forecast.model}, generated ${formatDateTime(data.forecast.generatedAt)})` : ''}.
          Safety stock is extra stock for demand swings: {settings.safetyZ} is the factor for a 95% service level, the standard deviation is measured over the last {settings.safetyWindowDays} trading days,
          and {settings.leadTimeDays} days is the assumed supplier lead time. “On order” is the quantity in open purchase orders.
        </div>
        <div className="sdg-inline-tip" style={{ marginTop: 10 }}>
          <IconLeaf />
          <span>
            <strong>SDG 12.5 &amp; 13.2 Smart Replenishment:</strong> This deterministic formula prevents over-purchasing and minimizes dead stock. Batching orders per supplier also consolidates delivery dispatches to lower transportation fuel emissions.
          </span>
        </div>
      </div>

      <Card
        title="Recommendations"
        subtitle="Columns: current stock, minimum stock, forecast demand, safety stock, on order, recommended reorder quantity. Click “Why?” for the reason."
        pad={false}
        actions={<Segmented label="Rows" value={show} onChange={setShow} options={[{ value: 'needed', label: `Needs reorder (${summary.productsNeedingReorder})` }, { value: 'all', label: `All products (${summary.totalProducts})` }]} />}
      >
        {items.length === 0 ? (
          <EmptyState title="Nothing to reorder" message={`Current stock and open orders cover the forecast demand and safety stock of every product for the next ${horizon} days.`} />
        ) : (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num" title="Current stock">Stock</th>
                  <th className="num" title="Minimum stock">Min.</th>
                  <th className="num" title={`Forecast demand for the next ${horizon} days`}>Forecast</th>
                  <th className="num" title="Safety stock">Safety</th>
                  <th className="num">On order</th>
                  <th className="num" title="Recommended reorder quantity">Reorder qty</th>
                  <th>Supplier</th>
                  <th>Priority</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <Fragment key={i.productId}>
                    <tr>
                      <td className="col-main">
                        <div className="strong">{i.name}</div>
                        <div className="small muted"><span className="mono">{i.productId}</span>{i.stockStatus !== 'OK' && <> · <StockBadge status={i.stockStatus} /></>}</div>
                      </td>
                      <td className="num strong">{formatNumber(i.currentStock)}</td>
                      <td className="num">{formatNumber(i.minimumStock)}</td>
                      <td className="num">{i.forecastAvailable ? formatNumber(i.forecastDemand) : <span className="muted" title="No forecast for this product">n/a</span>}</td>
                      <td className="num">{formatNumber(i.safetyStock)}</td>
                      <td className="num">{formatNumber(i.onOrder)}</td>
                      <td className="num strong" style={{ fontSize: 15 }}>{formatNumber(i.reorderQuantity)}</td>
                      <td>{i.supplierName || i.supplierId}</td>
                      <td><span className={`badge ${PRIORITY[i.priority].cls}`}>{PRIORITY[i.priority].text}</span></td>
                      <td className="actions">
                        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={expanded === i.productId} onClick={() => setExpanded(expanded === i.productId ? null : i.productId)}>Why?</button>
                        <button type="button" className="btn btn-sm" disabled={!i.needsReorder} onClick={() => setOrdering(i)}>Create order</button>
                      </td>
                    </tr>
                    {expanded === i.productId && (
                      <tr className="reason-row">
                        <td colSpan={10}>
                          <div><b>Reason:</b> {i.reason}</div>
                          <div style={{ marginTop: 4 }}>
                            <b>Calculation:</b> <span className="mono">{i.calculation}</span> → order <b>{formatNumber(i.reorderQuantity)}</b> units.
                            {' '}Daily demand over the last {settings.safetyWindowDays} days: average {i.averageDailyDemand}, standard deviation {i.dailyDemandStdDev}.
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <h2 className="section-title">Purchase orders</h2>
      <div className="card">
        {orders.loading ? <Loading /> : orders.error ? <ErrorState message={orders.error} onRetry={orders.reload} /> : orders.data.data.length === 0 ? (
          <EmptyState title="No purchase orders yet" message="Create one from a recommendation above." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Order ID</th><th>Created</th><th>Product</th><th>Supplier</th><th className="num">Quantity</th><th>Status</th><th className="actions">Actions</th></tr>
              </thead>
              <tbody>
                {orders.data.data.map((o) => (
                  <tr key={o.orderId}>
                    <td className="mono">{o.orderId}</td>
                    <td className="nowrap">{formatDateTime(o.createdAt)}</td>
                    <td><span className="strong">{o.productName}</span> <span className="small muted mono">{o.productId}</span>{o.note && <div className="small muted">{o.note}</div>}</td>
                    <td>{o.supplierName || o.supplierId}</td>
                    <td className="num">{formatNumber(o.quantity)}</td>
                    <td><span className={`badge ${PO_STATUS[o.status]}`}>{o.status}</span></td>
                    <td className="actions">
                      {o.allowedStatuses.length === 0 ? <span className="muted small">Closed</span> : o.allowedStatuses.map((s) => (
                        <button key={s} type="button" className={`btn btn-ghost btn-sm ${s === 'CANCELLED' ? 'danger' : ''}`} onClick={() => setStatusChange({ order: o, status: s })}>{NEXT_LABEL[s]}</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ordering && <OrderForm item={ordering} onClose={() => setOrdering(null)} onSaved={() => { setOrdering(null); refresh(); }} />}
      {statusChange && (
        <ConfirmDialog
          title={`${NEXT_LABEL[statusChange.status]}: ${statusChange.order.orderId}?`}
          message={statusChange.status === 'RECEIVED'
            ? `This adds ${statusChange.order.quantity} units to the stock of ${statusChange.order.productName} and creates an IN inventory transaction. It cannot be undone.`
            : statusChange.status === 'CANCELLED'
              ? `Cancel the order for ${statusChange.order.quantity} units of ${statusChange.order.productName}? It cannot be reopened.`
              : `Mark the order for ${statusChange.order.quantity} units of ${statusChange.order.productName} as sent to the supplier?`}
          confirmLabel={NEXT_LABEL[statusChange.status]}
          danger={statusChange.status === 'CANCELLED'}
          busy={statusBusy}
          onConfirm={applyStatus}
          onCancel={() => setStatusChange(null)}
        />
      )}
    </>
  );
}
