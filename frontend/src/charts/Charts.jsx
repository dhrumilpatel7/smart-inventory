import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCompact, formatDate, formatNumber, formatPeriod } from '../utils/format';
import { ChartFrame, ChartLegend, ChartTooltip } from './ChartParts';
import { BAR_SIZE, useChartTheme } from './theme';

// True on phone-sized screens, so charts can give less room to axis labels.
function useNarrow() {
  const query = '(max-width: 560px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

const periodLabel = (v) => (String(v).length === 10 ? formatDate(v) : formatPeriod(v));

/** One measure over time (e.g. revenue per day). Single series, so the card title names it - no legend. */
export function TrendChart({ data, xKey = 'period', yKey, name, valueFormatter = formatNumber, height = 280 }) {
  const { colors, axisProps, yAxisProps, gridProps, isDark } = useChartTheme();

  return (
    <ChartFrame height={height} empty={!data || data.length === 0}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.primary} stopOpacity={isDark ? 0.4 : 0.25} />
            <stop offset="95%" stopColor={colors.primary} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={formatPeriod} minTickGap={36} />
        <YAxis {...yAxisProps} tickFormatter={formatCompact} />
        <Tooltip content={<ChartTooltip labelFormatter={periodLabel} valueFormatter={valueFormatter} />} />
        <Area
          type="monotone"
          dataKey={yKey}
          name={name}
          stroke={colors.primary}
          strokeWidth={2.5}
          fill="url(#trendGradient)"
          dot={false}
          activeDot={{ r: 5, stroke: colors.bg, strokeWidth: 2, fill: colors.primary }}
          isAnimationActive={true}
        />
      </AreaChart>
    </ChartFrame>
  );
}

/**
 * Historical demand (solid blue) followed by forecast demand (dashed orange).
 * The two are separate series with a marker where the forecast begins, so the
 * reader can never mistake a prediction for a real sale.
 */
export function DemandForecastChart({ history = [], forecast = [], historyKey = 'units', forecastKey = 'units', height = 300 }) {
  const { colors, axisProps, yAxisProps, gridProps } = useChartTheme();
  const data = [
    ...history.map((h) => ({ date: h.date, history: h[historyKey] })),
    ...forecast.map((f) => ({ date: f.date, forecast: f[forecastKey] })),
  ];
  const forecastStart = forecast.length ? forecast[0].date : null;

  return (
    <div>
      <ChartLegend items={[
        { label: 'Historical demand (actual units sold)', color: colors.primary, line: true },
        { label: 'Forecast demand (predicted by the model)', color: colors.secondary, line: true, dashed: true },
      ]} />
      <ChartFrame height={height} empty={data.length === 0}>
        <LineChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={formatPeriod} minTickGap={36} />
          <YAxis {...yAxisProps} tickFormatter={formatCompact} allowDecimals={false} />
          <Tooltip content={<ChartTooltip labelFormatter={formatDate} valueFormatter={(v) => `${formatNumber(Math.round(v * 100) / 100)} units`} />} />
          {forecastStart && (
            <ReferenceLine
              x={forecastStart}
              stroke={colors.axis}
              strokeDasharray="3 3"
              label={{ value: 'Forecast starts', position: 'insideTopLeft', fill: colors.tick, fontSize: 12, dx: 4, dy: -14 }}
            />
          )}
          <Line
            type="monotone"
            dataKey="history"
            name="Historical"
            stroke={colors.primary}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, stroke: colors.bg, strokeWidth: 2, fill: colors.primary }}
            isAnimationActive={true}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke={colors.secondary}
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 5, stroke: colors.bg, strokeWidth: 2, fill: colors.secondary }}
            isAnimationActive={true}
          />
        </LineChart>
      </ChartFrame>
    </div>
  );
}

/** Actual vs predicted on the hold-out (test) period - how well the model would have done. */
export function ActualVsPredictedChart({ data = [], height = 260 }) {
  const { colors, axisProps, yAxisProps, gridProps } = useChartTheme();

  return (
    <div>
      <ChartLegend items={[
        { label: 'Actual units sold', color: colors.primary, line: true },
        { label: 'Model prediction', color: colors.secondary, line: true, dashed: true },
      ]} />
      <ChartFrame height={height} empty={data.length === 0}>
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={formatPeriod} minTickGap={36} />
          <YAxis {...yAxisProps} allowDecimals={false} />
          <Tooltip content={<ChartTooltip labelFormatter={formatDate} valueFormatter={(v) => `${Math.round(v * 100) / 100} units`} />} />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke={colors.primary}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={true}
          />
          <Line
            type="monotone"
            dataKey="predicted"
            name="Predicted"
            stroke={colors.secondary}
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={true}
          />
        </LineChart>
      </ChartFrame>
    </div>
  );
}

/** Stock IN vs stock OUT per period, side by side on one shared axis. */
export function InOutChart({ data = [], height = 280 }) {
  const { colors, axisProps, yAxisProps, gridProps, isDark } = useChartTheme();

  return (
    <div>
      <ChartLegend items={[
        { label: 'IN (stock received)', color: colors.primary },
        { label: 'OUT (stock sold / removed)', color: colors.secondary },
      ]} />
      <ChartFrame height={height} empty={data.length === 0}>
        <BarChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} barGap={3}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="period" {...axisProps} tickFormatter={formatPeriod} minTickGap={20} />
          <YAxis {...yAxisProps} tickFormatter={formatCompact} />
          <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(16,24,40,0.04)' }} content={<ChartTooltip labelFormatter={periodLabel} valueFormatter={(v) => `${formatNumber(v)} units`} />} />
          <Bar dataKey="inUnits" name="IN" fill={colors.primary} radius={[5, 5, 0, 0]} maxBarSize={BAR_SIZE} isAnimationActive={true} />
          <Bar dataKey="outUnits" name="OUT" fill={colors.secondary} radius={[5, 5, 0, 0]} maxBarSize={BAR_SIZE} isAnimationActive={true} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}

/** Horizontal bars for comparing named things (categories, products, suppliers). One series, one colour. */
export function RankedBarChart({ data = [], labelKey, valueKey, name, valueFormatter = formatNumber, labelWidth = 150, rowHeight = 34 }) {
  const { colors, axisProps, isDark } = useChartTheme();
  const narrow = useNarrow();
  const height = Math.max(120, data.length * rowHeight + 30);
  const textMuted = isDark ? '#94a3b8' : '#475467';

  return (
    <ChartFrame height={height} empty={data.length === 0}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: narrow ? 48 : 60, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={colors.grid} horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" {...axisProps} axisLine={false} tickFormatter={formatCompact} />
        <YAxis
          type="category"
          dataKey={labelKey}
          {...axisProps}
          width={narrow ? Math.min(labelWidth, 104) : labelWidth}
          interval={0}
          tick={{ fill: textMuted, fontSize: narrow ? 11.5 : 12.5 }}
        />
        <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(16,24,40,0.04)' }} content={<ChartTooltip valueFormatter={valueFormatter} />} />
        <Bar
          dataKey={valueKey}
          name={name}
          fill={colors.primary}
          radius={[0, 5, 5, 0]}
          maxBarSize={18}
          isAnimationActive={true}
          label={{ position: 'right', formatter: (v) => formatCompact(v), fill: textMuted, fontSize: 12 }}
        />
      </BarChart>
    </ChartFrame>
  );
}

/** Vertical columns for a short ordered list (weekdays, models). */
export function ColumnChart({ data = [], labelKey, valueKey, name, valueFormatter = formatNumber, labelFormatter = formatCompact, height = 240 }) {
  const { colors, axisProps, yAxisProps, gridProps, isDark } = useChartTheme();
  const textMuted = isDark ? '#94a3b8' : '#475467';

  return (
    <ChartFrame height={height} empty={data.length === 0}>
      <BarChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey={labelKey} {...axisProps} interval={0} />
        <YAxis {...yAxisProps} tickFormatter={formatCompact} />
        <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(16,24,40,0.04)' }} content={<ChartTooltip valueFormatter={valueFormatter} />} />
        <Bar
          dataKey={valueKey}
          name={name}
          fill={colors.primary}
          radius={[5, 5, 0, 0]}
          maxBarSize={BAR_SIZE}
          isAnimationActive={true}
          label={{ position: 'top', formatter: labelFormatter, fill: textMuted, fontSize: 12 }}
        />
      </BarChart>
    </ChartFrame>
  );
}
