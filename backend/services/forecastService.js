/**
 * Runs the Python ML pipeline, stores its output in MongoDB and serves it to
 * the API. Forecast numbers are only ever produced by the Python process.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const env = require('../config/env');
const Forecast = require('../models/Forecast');
const ForecastRun = require('../models/ForecastRun');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const ApiError = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { toDateString } = require('../utils/validators');
const { runForecastScript, MlError } = require('./mlRunner');
const { dailyDemand } = require('./demandService');

const HORIZONS = [7, 30];
let running = false;

const asDate = (text) => new Date(`${text}T00:00:00.000Z`);
const round2 = (n) => Math.round(n * 100) / 100;

function parseHorizon(value, fallback = 30) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 60) throw ApiError.badRequest('horizon must be a whole number of days between 1 and 60');
  return n;
}

async function latestRun() {
  return ForecastRun.findOne({ status: 'SUCCESS' }).sort({ createdAt: -1 }).lean();
}

// True when sales were added after the forecast was generated (so it should be re-run).
async function isStale(run) {
  if (!run) return false;
  const marker = mongoose.Types.ObjectId.createFromTime(Math.floor(new Date(run.createdAt).getTime() / 1000));
  return Boolean(await Sale.exists({ _id: { $gt: marker } }));
}

function publicRun(run) {
  if (!run) return null;
  const { _id, backtest, ...rest } = run;
  return rest;
}

/**
 * Executes the ML pipeline and replaces the stored forecasts with the new ones.
 * A failed run is recorded too, and leaves the previous forecasts untouched.
 */
async function runForecast({ triggeredBy = 'system' } = {}) {
  if (running) throw ApiError.conflict('A forecast is already being generated. Please wait for it to finish.');
  running = true;
  const started = Date.now();
  const runId = `RUN-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(2).toString('hex')}`;
  const horizon = Math.max(...HORIZONS, env.ml.horizonDays);

  try {
    // Today is not over yet, so today's sales are not used as a full day of demand.
    const result = await runForecastScript({ horizon, today: toDateString(new Date()) });

    // Keep only forecasts for products that still exist in MongoDB.
    const known = new Set(await Product.distinct('productId'));
    const createdAt = new Date();
    const docs = [];
    const backtest = {};
    for (const product of result.products) {
      if (!known.has(product.productId)) continue;
      backtest[product.productId] = product.backtest;
      for (const point of product.forecast) {
        const value = Number(point.predictedDemand);
        if (!Number.isFinite(value) || value < 0) {
          throw new MlError('INVALID_OUTPUT', `The forecasting process returned an invalid value for ${product.productId}.`, 502);
        }
        docs.push({
          runId,
          productId: product.productId,
          forecastDate: asDate(point.date),
          predictedDemand: value,
          dayAhead: point.dayAhead,
          model: result.selectedModel,
          metrics: {
            mae: product.metrics.mae,
            rmse: product.metrics.rmse,
            mape: product.metrics.mape,
            wape: product.metrics.wape,
            testDays: product.metrics.testDays,
          },
          createdAt,
        });
      }
    }
    if (!docs.length) throw new MlError('EMPTY_FORECAST', 'The forecasting process returned no forecasts for existing products.', 502);

    const forecastProducts = new Set(docs.map((d) => d.productId));
    const runDoc = {
      runId,
      status: 'SUCCESS',
      model: result.selectedModel,
      selectionReason: result.selectionReason,
      horizonDays: result.horizonDays,
      metrics: result.metrics,
      modelComparison: result.models,
      split: result.split,
      dataSummary: result.dataSummary,
      features: result.features,
      featureImportance: result.featureImportance,
      backtest,
      forecastStartDate: asDate(result.forecastStartDate),
      forecastEndDate: asDate(result.forecastEndDate),
      historyEndDate: asDate(result.dataSummary.endDate),
      productsForecast: forecastProducts.size,
      skippedProducts: [...known].filter((id) => !forecastProducts.has(id)).sort(),
      durationMs: Date.now() - started,
      triggeredBy,
      createdAt,
    };

    // Swap old forecasts for new ones atomically, so readers never see a half-written set.
    await runInTransaction(async (session) => {
      const o = session ? { session } : {};
      await Forecast.deleteMany({}, o);
      await Forecast.insertMany(docs, o);
      await ForecastRun.create([runDoc], o);
    });

    return { run: publicRun(runDoc), forecastsStored: docs.length };
  } catch (err) {
    const isMl = err instanceof MlError;
    await ForecastRun.create({
      runId,
      status: 'FAILED',
      errorCode: isMl ? err.code : 'SERVER_ERROR',
      errorMessage: isMl ? err.message : 'Unexpected server error while storing the forecast',
      durationMs: Date.now() - started,
      triggeredBy,
    }).catch((logErr) => console.error('Could not record failed forecast run:', logErr.message));
    if (isMl) throw new ApiError(err.status, err.message, { code: err.code });
    throw err;
  } finally {
    running = false;
  }
}

async function status() {
  const [run, lastAttempt, forecastCount] = await Promise.all([
    latestRun(),
    ForecastRun.findOne().sort({ createdAt: -1 }).lean(),
    Forecast.countDocuments(),
  ]);
  return {
    available: Boolean(run) && forecastCount > 0,
    running,
    stale: await isStale(run),
    forecastCount,
    run: publicRun(run),
    lastAttempt: lastAttempt
      ? { runId: lastAttempt.runId, status: lastAttempt.status, errorMessage: lastAttempt.errorMessage, createdAt: lastAttempt.createdAt }
      : null,
  };
}

// Raw forecast rows (optionally for one product), limited to the first `horizon` days.
async function listForecasts({ productId, horizon }) {
  const filter = { dayAhead: { $lte: horizon } };
  if (productId) filter.productId = productId;
  const rows = await Forecast.find(filter).sort({ productId: 1, forecastDate: 1 }).lean();
  return rows.map((r) => ({
    productId: r.productId,
    forecastDate: toDateString(r.forecastDate),
    dayAhead: r.dayAhead,
    predictedDemand: r.predictedDemand,
    model: r.model,
    metrics: r.metrics,
    runId: r.runId,
    createdAt: r.createdAt,
  }));
}

// Total predicted demand per product for each standard horizon: Map(productId -> { 7: x, 30: y, metrics, model })
async function totalsByProduct() {
  const rows = await Forecast.aggregate([
    {
      $group: {
        _id: '$productId',
        d7: { $sum: { $cond: [{ $lte: ['$dayAhead', 7] }, '$predictedDemand', 0] } },
        d30: { $sum: { $cond: [{ $lte: ['$dayAhead', 30] }, '$predictedDemand', 0] } },
        days: { $sum: 1 },
        metrics: { $first: '$metrics' },
        model: { $first: '$model' },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, { 7: round2(r.d7), 30: round2(r.d30), days: r.days, metrics: r.metrics, model: r.model }]));
}

// Everything the Forecast page needs for one product.
async function productForecast({ productId, horizon, historyDays }) {
  const product = await Product.findOne({ productId }).lean();
  if (!product) throw ApiError.notFound(`Product "${productId}" does not exist`);

  const [history, forecast, run] = await Promise.all([
    dailyDemand({ productId, days: historyDays }),
    listForecasts({ productId, horizon }),
    ForecastRun.findOne({ status: 'SUCCESS' }).sort({ createdAt: -1 }).select('+backtest').lean(),
  ]);

  const bt = run && run.backtest ? run.backtest[productId] : null;
  return {
    product: { productId: product.productId, name: product.name, category: product.category, stock: product.stock, minimumStock: product.minimumStock },
    horizon,
    available: forecast.length > 0,
    reason: forecast.length > 0
      ? null
      : run
        ? 'This product has no sales history yet, so the model could not forecast it.'
        : 'No forecast has been generated yet. Run the forecast first.',
    history,
    forecast: forecast.map((f) => ({ date: f.forecastDate, dayAhead: f.dayAhead, predictedDemand: f.predictedDemand })),
    totalPredictedDemand: round2(forecast.reduce((sum, f) => sum + f.predictedDemand, 0)),
    model: forecast.length ? forecast[0].model : null,
    metrics: forecast.length ? forecast[0].metrics : null,
    backtest: bt
      ? bt.dates.map((date, i) => ({ date, actual: bt.actual[i], predicted: bt.predicted[i] }))
      : [],
    stale: await isStale(run),
    run: publicRun(run),
  };
}

// Per-product table for the Forecast / Analytics pages.
async function summary() {
  const [run, totals, products] = await Promise.all([
    latestRun(),
    totalsByProduct(),
    Product.find().sort({ productId: 1 }).lean(),
  ]);
  return {
    available: Boolean(run) && totals.size > 0,
    stale: await isStale(run),
    run: publicRun(run),
    products: products.map((p) => {
      const t = totals.get(p.productId);
      return {
        productId: p.productId,
        name: p.name,
        category: p.category,
        stock: p.stock,
        forecastAvailable: Boolean(t),
        demand7Days: t ? t[7] : null,
        demand30Days: t ? t[30] : null,
        metrics: t ? t.metrics : null,
      };
    }),
  };
}

// Shop-wide demand: history (all products) + forecast (sum of all product forecasts) per day.
async function totalDemandSeries({ historyDays = 60, horizon = 30 } = {}) {
  const [history, forecastRows, run] = await Promise.all([
    dailyDemand({ days: historyDays }),
    Forecast.aggregate([
      { $match: { dayAhead: { $lte: horizon } } },
      { $group: { _id: '$forecastDate', units: { $sum: '$predictedDemand' } } },
      { $sort: { _id: 1 } },
    ]),
    latestRun(),
  ]);
  return {
    available: forecastRows.length > 0,
    model: run ? run.model : null,
    generatedAt: run ? run.createdAt : null,
    history,
    forecast: forecastRows.map((r) => ({ date: toDateString(r._id), units: round2(r.units) })),
  };
}

async function runs(limit = 20) {
  const rows = await ForecastRun.find().sort({ createdAt: -1 }).limit(limit).lean();
  return rows.map((r) => ({
    runId: r.runId,
    status: r.status,
    model: r.model,
    metrics: r.metrics ? { mae: r.metrics.mae, rmse: r.metrics.rmse, mape: r.metrics.mape, wape: r.metrics.wape } : null,
    productsForecast: r.productsForecast,
    horizonDays: r.horizonDays,
    errorCode: r.errorCode,
    errorMessage: r.errorMessage,
    durationMs: r.durationMs,
    triggeredBy: r.triggeredBy,
    createdAt: r.createdAt,
  }));
}

module.exports = { HORIZONS, parseHorizon, runForecast, status, listForecasts, totalsByProduct, productForecast, summary, totalDemandSeries, runs, latestRun, isStale };
