import { useState } from 'react';
import { ColumnChart, InOutChart, RankedBarChart, TrendChart } from '../charts/Charts';
import RunForecastButton from '../components/RunForecastButton';
import { Card, EmptyState, ErrorState, Field, Loading, PageHeader, Segmented, StatCard } from '../components/ui';
import useFetch from '../hooks/useFetch';
import { forecastApi, inventoryApi, salesApi, supplierApi } from '../services/api';
import { formatCurrency, formatDate, formatDateTime, formatDecimal, formatNumber, formatPercent } from '../utils/format';

function Section({ state, children, label }) {
  if (state.loading) return <div className="card"><Loading label={label} /></div>;
  if (state.error) return <div className="card"><ErrorState message={state.error} onRetry={state.reload} /></div>;
  return children(state.data);
}

export default function Analytics() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [groupBy, setGroupBy] = useState('week');
  const [measure, setMeasure] = useState('revenue');
  const [version, setVersion] = useState(0);

  const sales = useFetch(() => salesApi.analytics({ ...range, groupBy }), [range, groupBy]);
  const inventory = useFetch(() => inventoryApi.analytics({ ...range, groupBy: groupBy === 'day' ? 'week' : groupBy }), [range, groupBy]);
  const suppliers = useFetch(() => supplierApi.analytics(), []);
  const forecast = useFetch(() => forecastApi.summary(), [version]);
  const runs = useFetch(() => forecastApi.runs(), [version]);

  const isRevenue = measure === 'revenue';
  const valueFormatter = isRevenue ? formatCurrency : (v) => `${formatNumber(v)} units`;
  const setDate = (key) => (e) => setRange((r) => ({ ...r, [key]: e.target.value }));

  return (
    <>
      <PageHeader title="Analytics" description="Deeper analysis built with MongoDB aggregation pipelines and the output of the ML pipeline." />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <Field label="From"><input className="input" type="date" value={range.from} max={range.to || undefined} onChange={setDate('from')} /></Field>
          <Field label="To"><input className="input" type="date" value={range.to} min={range.from || undefined} onChange={setDate('to')} /></Field>
          <Field label="Group by">
            <Segmented label="Group by" value={groupBy} onChange={setGroupBy} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
          </Field>
          <Field label="Measure">
            <Segmented label="Measure" value={measure} onChange={setMeasure} options={[{ value: 'revenue', label: 'Revenue' }, { value: 'units', label: 'Units' }]} />
          </Field>
          {(range.from || range.to) && <button type="button" className="btn btn-ghost" onClick={() => setRange({ from: '', to: '' })}>Whole history</button>}
          <div className="spacer" />
          {sales.data?.dataRange.from && <div className="small muted">Sales data: {formatDate(sales.data.dataRange.from)} – {formatDate(sales.data.dataRange.to)}</div>}
        </div>
      </div>

      <h2 className="section-title" style={{ marginTop: 0 }}>Sales trends</h2>
      <Section state={sales} label="Loading sales analytics…">
        {(d) => (d.totals.orders === 0 ? <div className="card"><EmptyState title="No sales in this period" message="Choose a wider date range." /></div> : (
          <div className="stack">
            <div className="grid grid-stats">
              <StatCard label="Revenue" value={formatCurrency(d.totals.revenue)} />
              <StatCard label="Units sold" value={formatNumber(d.totals.units)} />
              <StatCard label="Number of sales" value={formatNumber(d.totals.orders)} />
              <StatCard label="Average sale value" value={formatCurrency(d.totals.averageOrderValue)} />
            </div>
            <div className="grid grid-2">
              <Card title={`${isRevenue ? 'Revenue' : 'Units sold'} per ${groupBy}`} subtitle={groupBy === 'week' ? 'Weeks start on Monday; the first and last week may be partial' : undefined}>
                <TrendChart data={d.byPeriod} yKey={measure} name={isRevenue ? 'Revenue' : 'Units sold'} valueFormatter={valueFormatter} height={260} />
              </Card>
              <Card title="Average units sold by weekday" subtitle="Shows the weekly pattern the model can learn (day_of_week feature)">
                <ColumnChart data={d.byWeekday.map((w) => ({ ...w, weekday: w.weekday.slice(0, 3) }))} labelKey="weekday" valueKey="averageUnitsPerDay" name="Average units per day" valueFormatter={(v) => `${formatDecimal(v, 1)} units`} labelFormatter={(v) => formatDecimal(v, 1)} height={260} />
              </Card>
            </div>

            <h2 className="section-title" style={{ marginBottom: 0 }}>Product and category performance</h2>
            <div className="grid grid-2">
              <Card title={`Top 10 products by ${isRevenue ? 'revenue' : 'units sold'}`}>
                <RankedBarChart
                  data={[...d.byProduct].sort((a, b) => b[measure] - a[measure]).slice(0, 10)}
                  labelKey="name" valueKey={measure} name={isRevenue ? 'Revenue' : 'Units sold'} valueFormatter={valueFormatter} labelWidth={160} rowHeight={30}
                />
              </Card>
              <div className="stack">
                <Card title={`${isRevenue ? 'Revenue' : 'Units sold'} by category`}>
                  <RankedBarChart data={[...d.byCategory].sort((a, b) => b[measure] - a[measure])} labelKey="category" valueKey={measure} name={isRevenue ? 'Revenue' : 'Units sold'} valueFormatter={valueFormatter} labelWidth={160} rowHeight={30} />
                </Card>
                <Card title="Slowest-selling products" subtitle="Fewest units sold in the period" pad={false}>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Product</th><th>Category</th><th className="num">Units</th><th className="num">Revenue</th></tr></thead>
                      <tbody>
                        {d.slowestProducts.map((p) => (
                          <tr key={p.productId}><td className="strong">{p.name}</td><td>{p.category}</td><td className="num">{formatNumber(p.units)}</td><td className="num">{formatCurrency(p.revenue)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        ))}
      </Section>

      <h2 className="section-title">Inventory movement and stock health</h2>
      <Section state={inventory} label="Loading inventory analytics…">
        {(d) => (
          <div className="stack">
            <div className="grid grid-stats">
              <StatCard label="Healthy stock" value={formatNumber(d.stock.healthy)} hint="products above minimum" color="#0ca30c" />
              <StatCard label="Low stock" value={formatNumber(d.stock.lowStock)} hint="at or below minimum" color="#fab219" />
              <StatCard label="Out of stock" value={formatNumber(d.stock.outOfStock)} hint="stock is zero" color="#d03b3b" />
              <StatCard label="Inventory value" value={formatCurrency(d.stock.inventoryValue)} hint={`${formatNumber(d.stock.totalStockUnits)} units on hand`} />
            </div>
            <div className="grid grid-2">
              <Card title="Stock IN vs OUT" subtitle={`Units per ${d.groupBy} · ${formatNumber(d.movement.inUnits)} in, ${formatNumber(d.movement.outUnits)} out`}>
                <InOutChart data={d.movementByPeriod} height={250} />
              </Card>
              <Card title="Stock value by category" subtitle="Current stock × price">
                <RankedBarChart data={[...d.byCategory].sort((a, b) => b.stockValue - a.stockValue)} labelKey="category" valueKey="stockValue" name="Stock value" valueFormatter={formatCurrency} labelWidth={160} rowHeight={38} />
              </Card>
            </div>
            <Card title="Movement by product" subtitle="Units received and removed in the period, with the current stock from the product master" pad={false}>
              <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Product</th><th>Category</th><th className="num">Units IN</th><th className="num">Units OUT</th><th className="num">Net</th><th className="num">Current stock</th></tr></thead>
                  <tbody>
                    {d.movementByProduct.map((p) => (
                      <tr key={p.productId}>
                        <td><span className="strong">{p.name}</span> <span className="small muted mono">{p.productId}</span></td>
                        <td>{p.category}</td>
                        <td className="num">{formatNumber(p.inUnits)}</td>
                        <td className="num">{formatNumber(p.outUnits)}</td>
                        <td className="num">{p.netUnits > 0 ? '+' : ''}{formatNumber(p.netUnits)}</td>
                        <td className="num strong">{formatNumber(p.currentStock)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="card-body small muted">
                Current stock comes from the product master (products.stock). It is not recalculated from the transaction history, because the imported history does not start from a known opening balance.
              </div>
            </Card>
          </div>
        )}
      </Section>

      <h2 className="section-title">Supplier–product relationships</h2>
      <Section state={suppliers} label="Loading supplier analytics…">
        {(d) => (
          <div className="stack">
            <Card title="Products per supplier">
              <RankedBarChart data={[...d.data].sort((a, b) => b.productCount - a.productCount)} labelKey="name" valueKey="productCount" name="Products" labelWidth={190} rowHeight={32} />
            </Card>
            <Card title="Supplier summary" subtitle="Sales of each supplier’s products over the whole history" pad={false}>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Supplier</th><th>Categories</th><th className="num">Products</th><th className="num">Low / out</th><th className="num">Units sold</th><th className="num">Revenue</th></tr></thead>
                  <tbody>
                    {d.data.map((s) => (
                      <tr key={s.supplierId}>
                        <td className="col-main"><span className="strong">{s.name}</span><div className="small muted">{s.address}</div></td>
                        <td className="small">{s.categories.join(', ') || '—'}</td>
                        <td className="num">{formatNumber(s.productCount)}</td>
                        <td className="num">{formatNumber(s.lowOrOut)}</td>
                        <td className="num">{formatNumber(s.unitsSold)}</td>
                        <td className="num">{formatCurrency(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </Section>

      <h2 className="section-title">Demand forecast performance</h2>
      <Section state={forecast} label="Loading forecast performance…">
        {(d) => (!d.available ? (
          <div className="card">
            <EmptyState title="No forecast yet" message="Run the Python ML pipeline to see model accuracy here.">
              <RunForecastButton onDone={() => setVersion((v) => v + 1)} />
            </EmptyState>
          </div>
        ) : (
          <div className="stack">
            <div className="grid grid-stats">
              <StatCard label="Selected model" value={<span style={{ fontSize: 19 }}>{d.run.model}</span>} hint={`generated ${formatDateTime(d.run.createdAt)}`} />
              <StatCard label="MAE (test period)" value={formatDecimal(d.run.metrics.mae)} hint="units per product per day" />
              <StatCard label="RMSE (test period)" value={formatDecimal(d.run.metrics.rmse)} hint="units per product per day" />
              <StatCard label="MAPE (test period)" value={formatPercent(d.run.metrics.mape)} hint={`on ${formatNumber(d.run.metrics.mapeSamples)} of ${formatNumber(d.run.metrics.samples)} product-days (zero-sales days excluded)`} />
              <StatCard label="30-day total demand error" value={formatPercent(d.run.metrics.totalDemandErrorPct)} hint="average per product; this drives reorder accuracy" />
            </div>
            <div className="grid grid-2">
              <Card title="Test MAE by model" subtitle="Lower is better · error in units per product per day on the unseen test period">
                <ColumnChart data={d.run.modelComparison.map((m) => ({ model: m.model.replace(' (7-day baseline)', ''), mae: m.test.mae }))} labelKey="model" valueKey="mae" name="Test MAE" valueFormatter={(v) => formatDecimal(v, 3)} labelFormatter={(v) => formatDecimal(v, 2)} height={250} />
              </Card>
              <Card title="What the model relies on" subtitle={d.run.featureImportance[0]?.kind === 'importance' ? 'Feature importance (shares add up to 1)' : 'Standardised coefficients: change in predicted units for a typical change in the feature'} pad={false}>
                <div className="table-wrap" style={{ maxHeight: 268, overflowY: 'auto' }}>
                  <table className="table">
                    <thead><tr><th>Feature</th><th className="num">Value</th></tr></thead>
                    <tbody>
                      {d.run.featureImportance.map((f) => (
                        <tr key={f.feature}><td className="mono">{f.feature}</td><td className="num">{formatDecimal(f.value, 3)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {d.run.featureImportance[0]?.kind !== 'importance' && (
                  <div className="card-body small muted">month and day_of_year rise together, so their two large opposite values mostly cancel out; read them as a pair.</div>
                )}
              </Card>
            </div>
            <Card title="Forecast and accuracy per product" subtitle="Accuracy measured on the hidden test period" pad={false}>
              <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Product</th><th>Category</th><th className="num">Stock</th><th className="num">Forecast 7 days</th><th className="num">Forecast 30 days</th><th className="num">MAE</th><th className="num">RMSE</th><th className="num">MAPE</th></tr></thead>
                  <tbody>
                    {d.products.map((p) => (
                      <tr key={p.productId}>
                        <td><span className="strong">{p.name}</span> <span className="small muted mono">{p.productId}</span></td>
                        <td>{p.category}</td>
                        <td className="num">{formatNumber(p.stock)}</td>
                        <td className="num">{p.forecastAvailable ? formatDecimal(p.demand7Days, 1) : <span className="muted">no history</span>}</td>
                        <td className="num">{p.forecastAvailable ? formatDecimal(p.demand30Days, 1) : '—'}</td>
                        <td className="num">{p.metrics ? formatDecimal(p.metrics.mae) : '—'}</td>
                        <td className="num">{p.metrics ? formatDecimal(p.metrics.rmse) : '—'}</td>
                        <td className="num">{p.metrics ? formatPercent(p.metrics.mape) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            {runs.data && runs.data.data.length > 0 && (
              <Card title="Forecast run history" subtitle="Every execution of the Python pipeline, including failures" pad={false}>
                <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  <table className="table">
                    <thead><tr><th>Run</th><th>When</th><th>Status</th><th>Model</th><th className="num">MAE</th><th className="num">Duration</th><th>Details</th></tr></thead>
                    <tbody>
                      {runs.data.data.map((r) => (
                        <tr key={r.runId}>
                          <td className="mono small">{r.runId}</td>
                          <td className="nowrap">{formatDateTime(r.createdAt)}</td>
                          <td><span className={`badge ${r.status === 'SUCCESS' ? 'good' : 'danger'}`}>{r.status}</span></td>
                          <td>{r.model || '—'}</td>
                          <td className="num">{r.metrics ? formatDecimal(r.metrics.mae) : '—'}</td>
                          <td className="num">{formatDecimal((r.durationMs || 0) / 1000, 1)} s</td>
                          <td className="small">{r.status === 'SUCCESS' ? `${r.productsForecast} products × ${r.horizonDays} days` : r.errorMessage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        ))}
      </Section>
    </>
  );
}
