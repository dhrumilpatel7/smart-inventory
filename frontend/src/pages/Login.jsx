import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { IconGlobe, IconLeaf, IconLogo } from '../components/Icons';
import ThemeToggle from '../components/ThemeToggle';
import { Alert, Field, Loading } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../services/api';

export default function Login() {
  const { user, checking, login, register } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (checking) return <Loading label="Checking your session…" />;
  if (user) return <Navigate to={location.state?.from || '/'} replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const isRegister = mode === 'register';

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (isRegister && form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    setBusy(true);
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-side">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark"><IconLogo /></div>
          <div>
            <div className="brand-name">Smart Inventory</div>
            <div className="brand-sub">Demand Forecasting &amp; SDG</div>
          </div>
        </div>
        <div>
          <div className="sdg-tag sdg-12" style={{ display: 'inline-block', marginBottom: 12 }}>
            🌱 UN Agenda 2030 · SDG 12 &amp; 9
          </div>
          <h1>Know what to stock before you run out.</h1>
          <p>
            Track products, suppliers, sales and stock movements in MongoDB, forecast demand with machine learning, and eliminate inventory waste with sustainable reorder recommendations.
          </p>
          <div className="login-flow">
            <div><span>1</span> Sales and stock movements recorded with atomic MongoDB transactions</div>
            <div><span>2</span> Python scikit-learn models evaluate daily demand patterns</div>
            <div><span>3</span> Precision 7-day and 30-day demand curves forecast future needs</div>
            <div><span>4</span> Deterministic formulas generate eco-optimized reorder quantities</div>
          </div>
        </div>
        <div className="small" style={{ color: '#94a3b8' }}>
          DBMS + Machine Learning + SDG Project · MongoDB, Express, React, Node.js, Python
        </div>
      </div>

      <div className="login-main" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 24, right: 28 }}>
          <ThemeToggle />
        </div>

        <div className="login-card">
          <h2>{isRegister ? 'Create an account' : 'Sign in'}</h2>
          <p className="muted" style={{ marginTop: 4 }}>
            {isRegister ? 'New accounts get the staff role.' : 'Use your account to open the dashboard.'}
          </p>
          <form onSubmit={submit} noValidate>
            {error && <Alert type="error">{error}</Alert>}
            {isRegister && (
              <Field label="Full name">
                <input className="input" value={form.name} onChange={set('name')} autoComplete="name" required />
              </Field>
            )}
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" required autoFocus />
            </Field>
            <Field label="Password" hint={isRegister ? 'At least 8 characters.' : undefined}>
              <input className="input" type="password" value={form.password} onChange={set('password')} autoComplete={isRegister ? 'new-password' : 'current-password'} required />
            </Field>
            <button className="btn btn-primary" type="submit" disabled={busy || !form.email || !form.password || (isRegister && !form.name)}>
              {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <p className="small" style={{ marginTop: 16 }}>
            {isRegister ? 'Already have an account? ' : 'No account yet? '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(''); }}>
              {isRegister ? 'Sign in' : 'Register'}
            </button>
          </p>
          {!isRegister && (
            <p className="small muted" style={{ marginTop: 8 }}>
              The demo administrator account is created from ADMIN_EMAIL and ADMIN_PASSWORD in <span className="mono">backend/.env</span>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
