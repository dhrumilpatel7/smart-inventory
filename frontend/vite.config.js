import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In development the React app calls "/api/..." and Vite forwards those
// requests to the Express backend, so the browser never talks to MongoDB or
// Python directly.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: env.VITE_API_PROXY || 'http://localhost:5000', changeOrigin: true },
      },
    },
  };
});
