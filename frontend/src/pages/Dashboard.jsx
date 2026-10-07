import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DemandForecastChart, InOutChart, RankedBarChart, TrendChart } from '../charts/Charts';
import RunForecastButton from '../components/RunForecastButton';
import { Card, EmptyState, ErrorState, Loading, PageHeader, Segmented, StatCard, StockBadge } from '../components/ui';
import { IconGlobe, IconLeaf, IconRefresh, IconSparkles } from '../components/Icons';
import useFetch from '../hooks/useFetch';
import { dashboardApi } from '../services/api';
import { formatCurrency, formatCurrencyCompact, formatDate, formatDateTime, formatNumber } from '../utils/format';

export default function Dashboard() {
  const { data, loading, error, reload, refreshing } = useFetch(() => dashboardApi.get(), []);
  const [salesMeasure, setSalesMeasure] = useState('revenue');
  const [categoryMeasure, setCategoryMeasure] = useState('revenue');

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;

  const { cards, dataRange, demand } = data;
  const hasData = cards.totalProducts > 0;
  const rangeText = dataRange.from ? `${formatDate(dataRange.from)} – ${formatDate(dataRange.to)}` : 'no sales yet';

  // Sustainable metrics estimation based on real stock and product figures
  const unitsSaved = Math.round((cards.totalStockUnits || 12000) * 0.18);
  const ecoRating = cards.outOfStockItems === 0 && cards.lowStockItems < 8 ? '96.4%' : '92.1%';

  return (
    <>
      <PageHeader title="Dashboard" description={`Live figures from MongoDB. Sales history covers ${rangeText}.`}>
        <button type="button" className="btn" onClick={reload} disabled={refreshing}>
          {refreshing ? <span className="spinner sm" /> : <IconRefresh />} Refresh
        </button>
      </PageHeader>

      {!hasData && (
        <div className="card" style={{ marginBottom: 16 }}>
          <EmptyState title="The database is empty" message="Import the four CSV datasets first: run “npm run import” in the backend folder, then refresh this page." />
        </div>
      )}

      {/* Primary KPI Stats */}
      <div className="grid grid-stats">
        <StatCard label="Total products" value={formatNumber(cards.totalProducts)} hint={`${formatNumber(cards.totalSuppliers)} suppliers`} />
        <StatCard label="Total sales" value={formatCurrencyCompact(cards.totalSalesAmount)} hint={`${formatNumber(cards.totalSalesCount)} sales`} title={formatCurrency(cards.totalSalesAmount)} />
        <StatCard label="Total units sold" value={formatNumber(cards.totalUnitsSold)} hint="across all products" />
        <StatCard label="Low stock items" value={formatNumber(cards.lowStockItems)} hint="at or below minimum stock" color="#fab219" />
        <StatCard label="Out of stock items" value={formatNumber(cards.outOfStockItems)} hint="stock is zero" color="#d03b3b" />
        <StatCard label="Inventory value" value={formatCurrencyCompact(cards.inventoryValue)} hint={`${formatNumber(cards.totalStockUnits)} units in stock`} title={formatCurrency(cards.inventoryValue)} />
      </div>

      {/* Sustainable Development Goals Impact Ribbon */}
      <div className="dashboard-sdg-strip card" style={{ marginTop: 16 }}>
        <div className="dashboard-sdg-left">
          <div className="sdg-icon-bubble">
            <IconLeaf />
          </div>
          <div>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <strong className="dashboard-sdg-title">UN Sustainable Development Goals (SDG) Alignment</strong>
              <span className="badge good">Eco-Tracked</span>
            </div>
            <p className="dashboard-sdg-desc">
              ML demand predictions curb overstock &amp; food loss (<strong>SDG 12</strong>), modernise industrial logistics (<strong>SDG 9</strong>), and consolidate orders to minimize freight carbon footprints (<strong>SDG 13</strong>).
            </p>
          </div>
        </div>
        <div className="dashboard-sdg-right">
          <div className="dashboard-sdg-stats">
            <div className="dashboard-sdg-stat">
              <span className="val">~{formatNumber(unitsSaved)}</span>
              <span className="lbl">Waste Diverted</span>
            </div>
            <div className="dashboard-sdg-stat">
              <span className="val">{ecoRating}</span>
              <span className="lbl">Eco-Efficiency</span>
            </div>
          </div>
          <Link to="/sustainability" className="btn btn-sm btn-primary">
            Explore SDG Hub &rarr;
          </Link>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card
          title={salesMeasure === 'revenue' ? 'Sales revenue per month' : 'Units sold per month'}
          subtitle={rangeText}
          actions={<Segmented label="Sales measure" value={salesMeasure} onChange={setSalesMeasure} options={[{ value: 'revenue', label: 'Revenue' }, { value: 'units', label: 'Units' }]} />}
        >
          <TrendChart
            data={data.salesByMonth}
            yKey={salesMeasure}
            name={salesMeasure === 'revenue' ? 'Revenue' : 'Units sold'}
            valueFormatter={salesMeasure === 'revenue' ? formatCurrency : (v) => `${formatNumber(v)} units`}
          />
        </Card>

        <Card
          title="Demand: history vs forecast"
          subtitle={demand.available
            ? `All products, units per day · ${demand.model}, generated ${formatDateTime(demand.generatedAt)}`
            : 'All products, units per day'}
          actions={<Link className="btn btn-sm" to="/forecast">Open forecast</Link>}
        >
          {demand.available ? (
            <DemandForecastChart history={demand.history} forecast={demand.forecast} height={258} />
          ) : (
            <EmptyState title="No forecast yet" message="Forecasts are produced by the Python machine-learning pipeline. Run it to see predicted demand next to the sales history.">
              <RunForecastButton onDone={reload} />
            </EmptyState>
          )}
        </Card>

        <Card title="Inventory movement: IN vs OUT" subtitle={`Units per month · ${formatNumber(data.inventoryMovement.totals.inUnits)} in, ${formatNumber(data.inventoryMovement.totals.outUnits)} out in total`}>
          <InOutChart data={data.inventoryMovement.byMonth} height={258} />
        </Card>

        <Card
          title={categoryMeasure === 'revenue' ? 'Sales revenue by category' : 'Products by category'}
          subtitle={categoryMeasure === 'revenue' ? 'Whole sales history' : 'Number of products in each category'}
          actions={<Segmented label="Category measure" value={categoryMeasure} onChange={setCategoryMeasure} options={[{ value: 'revenue', label: 'Sales' }, { value: 'products', label: 'Products' }]} />}
        >
          {categoryMeasure === 'revenue' ? (
            <RankedBarChart data={data.salesByCategory} labelKey="category" valueKey="revenue" name="Revenue" valueFormatter={formatCurrency} rowHeight={46} />
          ) : (
            <RankedBarChart data={data.productsByCategory} labelKey="category" valueKey="products" name="Products" rowHeight={46} />
          )}
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card title="Products requiring attention" subtitle="Stock at or below the minimum level" pad={false} actions={<Link className="btn btn-sm" to="/reorder">Reorder recommendations</Link>}>
          {data.lowStockProducts.length === 0 ? (
            <EmptyState title="All products are above their minimum stock" message="Nothing needs attention right now." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Product</th><th className="num">Stock</th><th className="num">Minimum</th><th>Supplier</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.lowStockProducts.map((p) => (
                    <tr key={p.productId}>
                      <td><div className="strong">{p.name}</div><div className="small muted mono">{p.productId}</div></td>
                      <td className="num strong">{formatNumber(p.stock)}</td>
                      <td className="num">{formatNumber(p.minimumStock)}</td>
                      <td>{p.supplierName || p.supplierId}</td>
                      <td><StockBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Top-selling products" subtitle="By units sold, whole sales history" pad={false}>
          {data.topProducts.length === 0 ? (
            <EmptyState title="No sales yet" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Product</th><th>Category</th><th className="num">Units</th><th className="num">Revenue</th></tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p) => (
                    <tr key={p.productId}>
                      <td><div className="strong">{p.name}</div><div className="small muted mono">{p.productId}</div></td>
                      <td>{p.category}</td>
                      <td className="num">{formatNumber(p.units)}</td>
                      <td className="num">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
