import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import { useAuth } from './context/AuthContext';
import Analytics from './pages/Analytics';
import Dashboard from './pages/Dashboard';
import Forecast from './pages/Forecast';
import Inventory from './pages/Inventory';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import Products from './pages/Products';
import Reorder from './pages/Reorder';
import Sales from './pages/Sales';
import Suppliers from './pages/Suppliers';
import Sustainability from './pages/Sustainability';

// Sends visitors without a valid login to the login page.
function ProtectedRoute({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="sales" element={<Sales />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="forecast" element={<Forecast />} />
        <Route path="reorder" element={<Reorder />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="sustainability" element={<Sustainability />} />
        <Route path="sdg" element={<Navigate to="/sustainability" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
