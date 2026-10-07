/**
 * Node -> Python bridge. Starts ml/forecast.py as a child process, waits for
 * it to finish and returns the JSON document it printed on stdout.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const env = require('../config/env');

const logError = (...args) => { if (env.nodeEnv !== 'test') console.error(...args); };

class MlError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'MlError';
    this.code = code;
    this.status = status;
  }
}

// HTTP status to use for each error code reported by the Python pipeline.
const STATUS_BY_CODE = {
  EMPTY_DATA: 422,
  INSUFFICIENT_DATA: 422,
  INVALID_DATA: 422,
  INVALID_ARGUMENT: 400,
  DB_ERROR: 502,
  DEPENDENCY_ERROR: 500,
  INTERNAL_ERROR: 500,
};

function resolvePython() {
  if (env.ml.pythonPath) return env.ml.pythonPath;
  const venv = path.join(__dirname, '..', 'ml', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (fs.existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runForecastScript({ horizon, today }) {
  const python = resolvePython();
  const script = env.ml.scriptPath;

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(script)) {
      reject(new MlError('SCRIPT_NOT_FOUND', 'The forecasting script could not be found on the server.', 500));
      return;
    }

    const child = spawn(python, [script, '--horizon', String(horizon), ...(today ? ['--today', today] : [])], {
      env: {
        ...process.env,
        MONGODB_URI: env.mongoUri,
        MONGO_DB: mongoose.connection?.name || '',
        PYTHONUNBUFFERED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new MlError('TIMEOUT', `The forecasting process did not finish within ${Math.round(env.ml.timeoutMs / 1000)} seconds and was stopped.`, 504));
    }, env.ml.timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      // e.g. ENOENT: the Python executable does not exist.
      logError('Could not start Python:', err.message);
      finish(reject, new MlError(
        'PYTHON_NOT_AVAILABLE',
        'Python could not be started. Install the ML dependencies with "npm run ml:setup" or set PYTHON_PATH in backend/.env.',
        500
      ));
    });

    child.on('close', (exitCode) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch (err) {
        parsed = null;
      }

      if (parsed && parsed.status === 'ok' && exitCode === 0) {
        if (!Array.isArray(parsed.products) || parsed.products.length === 0) {
          finish(reject, new MlError('EMPTY_FORECAST', 'The forecasting process returned no forecasts.', 502));
          return;
        }
        finish(resolve, parsed);
        return;
      }
      if (parsed && parsed.status === 'error') {
        finish(reject, new MlError(parsed.code || 'ML_ERROR', parsed.message || 'Forecasting failed', STATUS_BY_CODE[parsed.code] || 502));
        return;
      }
      // Crash without JSON (syntax error, missing package, killed process, ...).
      logError(`Python exited with code ${exitCode}. stderr:\n${stderr.slice(-2000)}`);
      const missingModule = /ModuleNotFoundError|No module named/.test(stderr);
      finish(reject, new MlError(
        missingModule ? 'DEPENDENCY_ERROR' : 'ML_PROCESS_FAILED',
        missingModule
          ? 'Python packages are missing. Run "npm run ml:setup" in the backend folder.'
          : 'The forecasting process failed unexpectedly. See the server log for details.',
        missingModule ? 500 : 502
      ));
    });
  });
}

module.exports = { runForecastScript, MlError, resolvePython };
