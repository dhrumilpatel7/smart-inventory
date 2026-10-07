// Theme-aware chart colors and shared axis/grid settings.
import { useTheme } from '../context/ThemeContext';

export const LIGHT_COLORS = {
  primary: '#2563eb', // Royal blue
  secondary: '#ea580c', // Bright orange
  accent: '#0d9488', // Emerald/teal
  purple: '#8b5cf6', // Violet
  grid: '#e2e8f0',
  axis: '#cbd5e1',
  tick: '#64748b',
  bg: '#ffffff',
  tooltipBg: '#ffffff',
  tooltipBorder: '#cbd5e1',
  text: '#0f172a',
};

export const DARK_COLORS = {
  primary: '#38bdf8', // Luminous sky blue
  secondary: '#fb923c', // Warm bright orange
  accent: '#2dd4bf', // Vibrant teal
  purple: '#a78bfa', // Soft purple
  grid: '#1e293b', // Deep slate
  axis: '#334155', // Slate 700
  tick: '#94a3b8', // Slate 400
  bg: '#131c2e',
  tooltipBg: '#1a243a',
  tooltipBorder: '#334155',
  text: '#f8fafc',
};

// Fallback constant for static usages
export const COLORS = LIGHT_COLORS;

export function useChartTheme() {
  const { isDark } = useTheme();
  const palette = isDark ? DARK_COLORS : LIGHT_COLORS;

  const currentAxisProps = {
    tick: { fill: palette.tick, fontSize: 12 },
    tickLine: false,
    axisLine: { stroke: palette.axis },
  };

  const currentYAxisProps = {
    ...currentAxisProps,
    axisLine: false,
    width: 48,
  };

  const currentGridProps = {
    stroke: palette.grid,
    vertical: false,
    strokeDasharray: '3 3',
  };

  return {
    colors: palette,
    axisProps: currentAxisProps,
    yAxisProps: currentYAxisProps,
    gridProps: currentGridProps,
    isDark,
  };
}

export const axisProps = {
  tick: { fill: LIGHT_COLORS.tick, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: LIGHT_COLORS.axis },
};

export const yAxisProps = { ...axisProps, axisLine: false, width: 48 };
export const gridProps = { stroke: LIGHT_COLORS.grid, vertical: false };
export const BAR_SIZE = 22;
