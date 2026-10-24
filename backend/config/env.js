// Loads and validates environment variables in one place.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable ${name}. Copy backend/.env.example to backend/.env and fill it in.`
    );
  }
  return value.trim();
}

function number(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number`);
  return n;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: number('PORT', 5000),
  mongoUri: required('MONGODB_URI'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  admin: {
    name: process.env.ADMIN_NAME || 'Admin',
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
  },
  ml: {
    pythonPath: (process.env.PYTHON_PATH || '').trim(),
    scriptPath: (process.env.ML_SCRIPT_PATH || '').trim() || path.join(__dirname, '..', 'ml', 'forecast.py'),
    timeoutMs: number('ML_TIMEOUT_MS', 180000),
    horizonDays: number('FORECAST_HORIZON_DAYS', 30),
  },
  reorder: {
    safetyZ: number('SAFETY_Z', 1.65),
    leadTimeDays: number('LEAD_TIME_DAYS', 7),
    safetyWindowDays: number('SAFETY_WINDOW_DAYS', 30),
  },
  openai: {
    apiKey: (process.env.OPENAI_API_KEY || '').trim(),
    model: (process.env.OPENAI_MODEL || '').trim() || 'gpt-4.1-mini',
  },
};

if (env.jwtSecret.length < 16 || env.jwtSecret.startsWith('change_me')) {
  throw new Error('JWT_SECRET must be a long random string (not the placeholder from .env.example).');
}

module.exports = env;
