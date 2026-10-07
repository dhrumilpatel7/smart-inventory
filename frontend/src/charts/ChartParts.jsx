import { ResponsiveContainer } from 'recharts';
import { EmptyState } from '../components/ui';

// Tooltip shared by all charts. `rows` maps each series to a label + formatter.
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload || !payload.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{labelFormatter ? labelFormatter(label) : label}</div>
      {rows.map((p) => (
        <div className="chart-tip-row" key={p.dataKey}>
          <span className="swatch" style={{ background: p.color || p.fill }} />
          {p.name}
          <b>{valueFormatter ? valueFormatter(p.value, p.dataKey) : p.value}</b>
        </div>
      ))}
    </div>
  );
}

// Legend drawn in HTML so the text uses normal text colours (not the series colour).
export function ChartLegend({ items }) {
  return (
    <div className="legend">
      {items.map((item) => (
        <span className="legend-item" key={item.label}>
          {item.line
            ? <span className={`legend-line ${item.dashed ? 'dashed' : ''}`} style={{ borderColor: item.color }} />
            : <span className="swatch" style={{ background: item.color }} />}
          {item.label}
        </span>
      ))}
    </div>
  );
}

// Fixed-height responsive wrapper with an empty state when there is no data.
export function ChartFrame({ height = 280, empty, emptyMessage = 'There is no data for this chart yet.', children }) {
  if (empty) return <EmptyState title="No data" message={emptyMessage} />;
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}
