import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  IconBox,
  IconCart,
  IconChart,
  IconDashboard,
  IconGlobe,
  IconLeaf,
  IconLogo,
  IconLogout,
  IconMenu,
  IconReceipt,
  IconSparkles,
  IconSwap,
  IconTrend,
  IconTruck,
} from './Icons';
import SdgImpactModal from './SdgImpactModal';
import ThemeToggle from './ThemeToggle';
import OfflineAssistant from './OfflineAssistant';

const NAV = [
  { label: 'Overview', items: [{ to: '/', text: 'Dashboard', icon: IconDashboard, end: true }] },
  {
    label: 'Records',
    items: [
      { to: '/products', text: 'Products', icon: IconBox },
      { to: '/suppliers', text: 'Suppliers', icon: IconTruck },
      { to: '/sales', text: 'Sales', icon: IconReceipt },
      { to: '/inventory', text: 'Inventory', icon: IconSwap },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/forecast', text: 'Forecast', icon: IconTrend },
      { to: '/reorder', text: 'Reorder', icon: IconCart },
      { to: '/analytics', text: 'Analytics', icon: IconChart },
      { to: '/assistant', text: 'AI Copilot', icon: IconSparkles },
    ],
  },
  {
    label: 'Sustainability',
    items: [
      { to: '/sustainability', text: 'SDG Impact', icon: IconLeaf, badge: '2030' },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [sdgOpen, setSdgOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu after navigating.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const initials = (user?.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><IconLogo /></div>
          <div>
            <div className="brand-name">Smart Inventory</div>
            <div className="brand-sub">Demand forecasting &amp; SDG</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((group) => (
            <div key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map(({ to, text, icon: Icon, end, badge }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Icon /> {text}
                  {badge && <span className="nav-item-badge">{badge}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-foot-meta">DBMS + ML + SDG Project</div>
          <div className="sidebar-foot-sub">MongoDB · Express · React · Python</div>
          <div className="sidebar-foot-toggle">
            <ThemeToggle showLabel={true} className="sidebar-theme-toggle" />
          </div>
        </div>
      </aside>

      <div className="main" onClick={() => open && setOpen(false)}>
        <header className="topbar">
          <div className="row" style={{ gap: 12 }}>
            <button
              type="button"
              className="btn menu-btn"
              aria-label="Open menu"
              onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            >
              <IconMenu />
            </button>
            <span className="topbar-title">Smart Inventory &amp; Demand Forecasting System</span>
          </div>

          <div className="topbar-actions">
            {/* Interactive SDG Pill */}
            <button
              type="button"
              className="sdg-topbar-pill"
              onClick={() => setSdgOpen(true)}
              title="Click to view UN SDG Alignment &amp; Impact"
            >
              <span className="sdg-pill-dot" />
              <IconGlobe />
              <span className="sdg-pill-text">UN SDG 12 &amp; 9</span>
            </button>

            {/* Light / Dark Mode Toggle Switch */}
            <ThemeToggle />

            {/* User chip */}
            <div className="user-chip">
              <div className="avatar">{initials}</div>
              <div className="user-details">
                <div className="user-name">{user?.name}</div>
                <div className="user-role">{user?.role}</div>
              </div>
              <button type="button" className="btn btn-sm logout-btn" onClick={logout} title="Log out">
                <IconLogout /> <span className="btn-label">Log out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {sdgOpen && <SdgImpactModal onClose={() => setSdgOpen(false)} />}
      <OfflineAssistant />
    </div>
  );
}
