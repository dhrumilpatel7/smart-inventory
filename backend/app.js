const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Render terminates TLS and forwards requests through a trusted proxy.
// This lets express-rate-limit use the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);

app.use(helmet());
// Only the configured frontend origin(s) may call the API from a browser.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '100kb' }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

app.get('/', (req, res) => res.json({ name: 'Smart Inventory & Demand Forecasting API', docs: 'See README.md', health: '/api/health' }));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
