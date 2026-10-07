import { useState } from 'react';
import { IconPlus } from '../components/Icons';
import { Alert, ConfirmDialog, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, SortTh, StockBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import useFetch, { useDebounced } from '../hooks/useFetch';
import { errorMessage, supplierApi } from '../services/api';
import { formatCurrency, formatNumber } from '../utils/format';

const EMPTY = { supplierId: '', name: '', email: '', phone: '', address: '' };

function SupplierForm({ supplier, onClose, onSaved }) {
  const editing = Boolean(supplier);
  const [form, setForm] = useState(editing ? { ...EMPTY, ...supplier } : EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.address.trim()) {
      setError('Name, email, phone and address are all required.');
      return;
    }
    setBusy(true);
    setError('');
    const body = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), address: form.address.trim() };
    try {
      if (editing) {
        await supplierApi.update(supplier.supplierId, body);
        toast.success(`${body.name} updated.`);
      } else {
        const created = await supplierApi.create({ ...body, ...(form.supplierId.trim() ? { supplierId: form.supplierId.trim() } : {}) });
        toast.success(`${body.name} added as ${created.data.supplierId}.`);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={editing ? `Edit ${supplier.supplierId}` : 'Add supplier'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="supplier-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add supplier'}</button>
        </>
      )}
    >
      <form id="supplier-form" onSubmit={submit} className="stack" noValidate>
        {error && <Alert type="error">{error}</Alert>}
        <div className="form-grid">
          <Field label="Supplier ID" hint={editing ? 'The ID cannot be changed.' : 'Leave empty to generate the next ID.'}>
            <input className="input" value={form.supplierId} onChange={set('supplierId')} disabled={editing} placeholder="e.g. S009" maxLength={20} />
          </Field>
          <Field label="Name"><input className="input" value={form.name} onChange={set('name')} maxLength={120} required /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={set('email')} required /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} maxLength={20} required /></Field>
          <Field label="Address" className="full"><input className="input" value={form.address} onChange={set('address')} maxLength={250} required /></Field>
        </div>
      </form>
    </Modal>
  );
}

function SupplierProducts({ supplierId, onClose }) {
  const { data, loading, error, reload } = useFetch(() => supplierApi.get(supplierId), [supplierId]);
  const supplier = data?.data;
  const statusOf = (p) => (p.stock <= 0 ? 'OUT' : p.stock <= p.minimumStock ? 'LOW' : 'OK');
  return (
    <Modal title={supplier ? `${supplier.name} · supplied products` : 'Supplied products'} size="lg" onClose={onClose}>
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : supplier.products.length === 0 ? (
        <EmptyState title="No products" message="This supplier is not linked to any product yet." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>ID</th><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th>Status</th></tr></thead>
            <tbody>
              {supplier.products.map((p) => (
                <tr key={p.productId}>
                  <td className="mono">{p.productId}</td>
                  <td className="strong">{p.name}</td>
                  <td>{p.category}</td>
                  <td className="num">{formatCurrency(p.price)}</td>
                  <td className="num">{formatNumber(p.stock)}</td>
                  <td><StockBadge status={statusOf(p)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function Suppliers() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ field: 'supplierId', order: 'asc' });
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const q = useDebounced(search);

  const { data, loading, error, reload } = useFetch(
    () => supplierApi.list({ q, sort: sort.field, order: sort.order, limit: 100 }),
    [q, sort, version]
  );

  async function confirmDelete() {
    setDeleteBusy(true);
    try {
      await supplierApi.remove(deleting.supplierId);
      toast.success(`${deleting.name} deleted.`);
      setVersion((v) => v + 1);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  }

  return (
    <>
      <PageHeader title="Suppliers" description="Companies that supply the products. A supplier with linked products cannot be deleted.">
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><IconPlus /> Add supplier</button>
      </PageHeader>

      <div className="card">
        <div className="toolbar">
          <Field label="Search" className="wide">
            <input className="input" type="search" placeholder="Name, ID, email or address" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
        </div>
        {loading ? <Loading label="Loading suppliers…" /> : error ? <ErrorState message={error} onRetry={reload} /> : data.data.length === 0 ? (
          <EmptyState title={q ? 'No suppliers match this search' : 'No suppliers yet'} message={q ? 'Try a different search.' : 'Import the CSV data or add your first supplier.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortTh field="supplierId" sort={sort} onSort={setSort}>ID</SortTh>
                  <SortTh field="name" sort={sort} onSort={setSort}>Name</SortTh>
                  <SortTh field="email" sort={sort} onSort={setSort}>Email</SortTh>
                  <th>Phone</th>
                  <SortTh field="address" sort={sort} onSort={setSort}>Address</SortTh>
                  <SortTh field="productCount" sort={sort} onSort={setSort} className="num">Products</SortTh>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.supplierId}>
                    <td className="mono">{s.supplierId}</td>
                    <td className="strong">{s.name}</td>
                    <td><a href={`mailto:${s.email}`}>{s.email}</a></td>
                    <td className="nowrap">{s.phone}</td>
                    <td>{s.address}</td>
                    <td className="num">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewing(s.supplierId)} title="View supplied products">{formatNumber(s.productCount)}</button>
                    </td>
                    <td className="actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Edit</button>
                      <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => setDeleting(s)} disabled={!isAdmin} title={isAdmin ? undefined : 'Only an administrator can delete suppliers'}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setVersion((v) => v + 1); }} />
      )}
      {viewing && <SupplierProducts supplierId={viewing} onClose={() => setViewing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete supplier?"
          message={`Delete ${deleting.name} (${deleting.supplierId})? ${deleting.productCount > 0 ? `It supplies ${deleting.productCount} product(s), so the server will refuse until they are reassigned.` : 'This cannot be undone.'}`}
          confirmLabel="Delete supplier"
          danger
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
