import axios from 'axios';

// Every request from React goes to the Express backend under /api.
// (During development Vite proxies /api to http://localhost:5000.)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

const TOKEN_KEY = 'smart_inventory_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// Attach the JWT to every request.
api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the token is missing/expired, tell the app to log out.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/register')) {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  }
);

// Turns any axios error into a message that can be shown to the user.
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.response?.data?.error?.message) return error.response.data.error.message;
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (error?.request && !error.response) return 'Cannot reach the server. Check that the backend is running.';
  if (error?.response?.status >= 500) return 'The server had a problem (is the backend running and connected to MongoDB?).';
  return error?.message || fallback;
}

// Removes empty filter values so they are not sent as "?category=".
export function cleanParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}

const get = (url, params, config) => api.get(url, { params: cleanParams(params), ...config }).then((r) => r.data);

export const authApi = {
  login: (body) => api.post('/auth/login', body).then((r) => r.data),
  register: (body) => api.post('/auth/register', body).then((r) => r.data),
  me: () => get('/auth/me'),
};

export const dashboardApi = { get: () => get('/dashboard') };

export const productApi = {
  list: (params) => get('/products', params),
  categories: () => get('/products/categories'),
  create: (body) => api.post('/products', body).then((r) => r.data),
  update: (id, body) => api.put(`/products/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
};

export const supplierApi = {
  list: (params) => get('/suppliers', params),
  get: (id) => get(`/suppliers/${id}`),
  analytics: () => get('/suppliers/analytics'),
  create: (body) => api.post('/suppliers', body).then((r) => r.data),
  update: (id, body) => api.put(`/suppliers/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/suppliers/${id}`).then((r) => r.data),
};

export const salesApi = {
  list: (params) => get('/sales', params),
  analytics: (params) => get('/sales/analytics', params),
  create: (body) => api.post('/sales', body).then((r) => r.data),
};

export const inventoryApi = {
  list: (params) => get('/inventory-transactions', params),
  analytics: (params) => get('/inventory/analytics', params),
  create: (body) => api.post('/inventory-transactions', body).then((r) => r.data),
};

export const forecastApi = {
  status: () => get('/forecasts/status'),
  summary: () => get('/forecasts/summary'),
  product: (productId, params) => get(`/forecasts/product/${productId}`, params),
  runs: () => get('/forecasts/runs'),
  // Training the models can take a while, so this call gets a longer timeout.
  run: () => api.post('/forecasts/run', {}, { timeout: 240000 }).then((r) => r.data),
};

export const reorderApi = {
  recommendations: (params) => get('/reorder', params),
  orders: (params) => get('/purchase-orders', params),
  createOrder: (body) => api.post('/purchase-orders', body).then((r) => r.data),
  setOrderStatus: (id, status) => api.patch(`/purchase-orders/${id}/status`, { status }).then((r) => r.data),
};

export default api;
