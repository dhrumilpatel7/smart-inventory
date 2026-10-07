const env = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

// Converts every error into a consistent, safe JSON response:
//   { "error": { "message": "...", "details": ... } }
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    details = Object.fromEntries(Object.entries(err.errors).map(([field, e]) => [field, e.message]));
    message = Object.values(details).join('; ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for "${err.path}"`;
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || err.keyPattern || {})[0] || 'value';
    const value = err.keyValue ? err.keyValue[field] : '';
    message = `A record with ${field} "${value}" already exists`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  }

  if (status >= 500) {
    if (env.nodeEnv !== 'test') console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n`, err);
    // Never leak internal details (stack traces, driver messages) to the client.
    if (!err.status) message = 'Internal server error';
  }

  const body = { error: { message } };
  if (details !== undefined) body.error.details = details;
  if (env.nodeEnv === 'development' && status >= 500 && !err.status) body.error.debug = err.message;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
