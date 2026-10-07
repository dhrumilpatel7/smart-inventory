import { useTheme } from '../context/ThemeContext';
import { IconMoon, IconSun } from './Icons';

export default function ThemeToggle({ showLabel = false, className = '' }) {
  const { theme, isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className={`theme-toggle-btn ${className}`}
      onClick={toggleTheme}
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <div className="theme-toggle-track">
        <span className={`theme-toggle-icon sun ${!isDark ? 'active' : ''}`}>
          <IconSun />
        </span>
        <span className={`theme-toggle-icon moon ${isDark ? 'active' : ''}`}>
          <IconMoon />
        </span>
        <div className={`theme-toggle-thumb ${isDark ? 'dark' : 'light'}`} />
      </div>
      {showLabel && (
        <span className="theme-toggle-label">
          {isDark ? 'Dark Mode' : 'Light Mode'}
        </span>
      )}
    </button>
  );
}
