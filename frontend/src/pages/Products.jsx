import { useState } from 'react';
import { IconPlus } from '../components/Icons';
import { Alert, ConfirmDialog, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pagination, SortTh, StockBadge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import useFetch, { useDebounced } from '../hooks/useFetch';
import { useCategoryOptions, useSupplierOptions } from '../hooks/useOptions';
import { errorMessage, productApi } from '../services/api';
import { formatCurrency, formatNumber } from '../utils/format';

const EMPTY = { productId: '', name: '', category: '', price: '', stock: '', minimumStock: '', supplierId: '' };

function ProductForm({ product, suppliers, categories, onClose, onSaved }) {
  const editing = Boolean(product);
  const [form, setForm] = useState(editing ? { ...product, price: String(product.price), stock: String(product.stock), minimumStock: String(product.minimumStock) } : EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate() {
    if (!form.name.trim()) return 'Product name is required.';
    if (!form.category.trim()) return 'Category is required.';
    if (form.price === '' || Number(form.price) < 0) return 'Price must be 0 or more.';
    if (!editing && (form.stock === '' || !Number.isInteger(Number(form.stock)) || Number(form.stock) < 0)) return 'Stock must be a whole number, 0 or more.';
    if (form.minimumStock === '' || !Number.isInteger(Number(form.minimumStock)) || Number(form.minimumStock) < 0) return 'Minimum stock must be a whole number, 0 or more.';
    if (!form.supplierId) return 'Choose a supplier.';
    return '';
  }

  async function submit(e) {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    const body = { name: form.name.trim(), category: form.category.trim(), price: Number(form.price), minimumStock: Number(form.minimumStock), supplierId: form.supplierId };
    try {
      if (editing) {
        await productApi.update(product.productId, body);
        toast.success(`${body.name} updated.`);
      } else {
        const created = await productApi.create({ ...body, stock: Number(form.stock), ...(form.productId.trim() ? { productId: form.productId.trim() } : {}) });
        toast.success(`${body.name} added as ${created.data.productId}.`);
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
      title={editing ? `Edit ${product.productId}` : 'Add product'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="product-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}</button>
        </>
      )}
    >
      <form id="product-form" onSubmit={submit} className="stack" noValidate>
        {error && <Alert type="error">{error}</Alert>}
        <div className="form-grid">
          <Field label="Product ID" hint={editing ? 'The ID cannot be changed.' : 'Leave empty to generate the next ID.'}>
            <input className="input" value={form.productId} onChange={set('productId')} disabled={editing} placeholder="e.g. P031" maxLength={20} />
          </Field>
          <Field label="Name">
            <input className="input" value={form.name} onChange={set('name')} maxLength={120} required />
          </Field>
          <Field label="Category">
            <input className="input" value={form.category} onChange={set('category')} list="category-options" maxLength={60} required />
            <datalist id="category-options">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Supplier">
            <select className="select" value={form.supplierId} onChange={set('supplierId')} required>
              <option value="">Select a supplier…</option>
              {suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.supplierId} · {s.name}</option>)}
            </select>
          </Field>
          <Field label="Price (₹)">
            <input className="input" type="number" min="0" step="0.01" value={form.price} onChange={set('price')} required />
          </Field>
          <Field label="Minimum stock" hint="Below this level the product is flagged as low stock.">
            <input className="input" type="number" min="0" step="1" value={form.minimumStock} onChange={set('minimumStock')} required />
          </Field>
          <Field
            label={editing ? 'Current stock' : 'Opening stock'}
            className="full"
            hint={editing ? 'Stock changes only through sales, inventory transactions and received purchase orders, so every change is recorded.' : 'Units on hand when the product is created.'}
          >
            <input className="input" type="number" min="0" step="1" value={form.stock} onChange={set('stock')} disabled={editing} required />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export default function Products() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ category: '', stockStatus: '', supplierId: '' });
  const [sort, setSort] = useState({ field: 'productId', order: 'asc' });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const q = useDebounced(search);

  const { suppliers } = useSupplierOptions();
  const categories = useCategoryOptions([version]);
  const { data, loading, error, reload, refreshing } = useFetch(
    () => productApi.list({ q, ...filters, sort: sort.field, order: sort.order, page, limit: 10 }),
    [q, filters, sort, page, version]
  );

  const setFilter = (key) => (e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(1); };
  const hasFilters = Boolean(q || filters.category || filters.stockStatus || filters.supplierId);

  async function confirmDelete() {
    setDeleteBusy(true);
    try {
      await productApi.remove(deleting.productId);
      toast.success(`${deleting.name} deleted.`);
      setDeleting(null);
      setVersion((v) => v + 1);
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Products" description="The product master list. Each product belongs to one supplier.">
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><IconPlus /> Add product</button>
      </PageHeader>

      <div className="card">
        <div className="toolbar">
          <Field label="Search" className="wide">
            <input className="input" type="search" placeholder="Name, ID or category" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </Field>
          <Field label="Category">
            <select className="select" value={filters.category} onChange={setFilter('category')}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Stock status">
            <select className="select" value={filters.stockStatus} onChange={setFilter('stockStatus')}>
              <option value="">Any stock level</option>
              <option value="ok">In stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
          </Field>
          <Field label="Supplier">
            <select className="select" value={filters.supplierId} onChange={setFilter('supplierId')}>
              <option value="">All suppliers</option>
              {suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.name}</option>)}
            </select>
          </Field>
          {hasFilters && (
            <button type="button" className="btn btn-ghost" onClick={() => { setSearch(''); setFilters({ category: '', stockStatus: '', supplierId: '' }); setPage(1); }}>Clear filters</button>
          )}
        </div>

        {loading ? <Loading label="Loading products…" /> : error ? <ErrorState message={error} onRetry={reload} /> : data.data.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No products match these filters' : 'No products yet'}
            message={hasFilters ? 'Try a different search or clear the filters.' : 'Import the CSV data or add your first product.'}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <SortTh field="productId" sort={sort} onSort={setSort}>ID</SortTh>
                    <SortTh field="name" sort={sort} onSort={setSort}>Name</SortTh>
                    <SortTh field="category" sort={sort} onSort={setSort}>Category</SortTh>
                    <SortTh field="price" sort={sort} onSort={setSort} className="num">Price</SortTh>
                    <SortTh field="stock" sort={sort} onSort={setSort} className="num">Stock</SortTh>
                    <SortTh field="minimumStock" sort={sort} onSort={setSort} className="num">Min. stock</SortTh>
                    <th>Supplier</th>
                    <th>Status</th>
                    <th className="actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((p) => (
                    <tr key={p.productId}>
                      <td className="mono">{p.productId}</td>
                      <td className="strong">{p.name}</td>
                      <td>{p.category}</td>
                      <td className="num">{formatCurrency(p.price)}</td>
                      <td className="num strong">{formatNumber(p.stock)}</td>
                      <td className="num">{formatNumber(p.minimumStock)}</td>
                      <td>{p.supplier ? p.supplier.name : <span className="muted">{p.supplierId} (missing)</span>}</td>
                      <td><StockBadge status={p.stockStatus} /></td>
                      <td className="actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>
                        <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => setDeleting(p)} disabled={!isAdmin} title={isAdmin ? undefined : 'Only an administrator can delete products'}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={data.pagination} onPage={setPage} refreshing={refreshing} />
          </>
        )}
      </div>

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          suppliers={suppliers}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setVersion((v) => v + 1); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete product?"
          message={`Delete ${deleting.name} (${deleting.productId})? Products that already have sales or stock movements cannot be deleted.`}
          confirmLabel="Delete product"
          danger
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
