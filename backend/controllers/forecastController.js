const asyncHandler = require('../utils/asyncHandler');
const forecastService = require('../services/forecastService');
const reorderService = require('../services/reorderService');
const n8nAlertService = require('../services/n8nAlertService');

// POST /api/forecasts/run  - React -> Node -> Python -> Node -> React
exports.run = asyncHandler(async (req, res) => {
  const result = await forecastService.runForecast({ triggeredBy: req.user.email });
  n8nAlertService.checkInBackground();
  res.status(201).json({ message: `Forecast generated with ${result.run.model}.`, ...result });
});

// GET /api/forecasts/status
exports.status = asyncHandler(async (req, res) => {
  res.json(await forecastService.status());
});

// GET /api/forecasts?productId=&horizon=7|30
exports.list = asyncHandler(async (req, res) => {
  const horizon = forecastService.parseHorizon(req.query.horizon, 30);
  const productId = req.query.productId ? String(req.query.productId).trim().toUpperCase() : undefined;
  const data = await forecastService.listForecasts({ productId, horizon });
  res.json({ horizon, count: data.length, data });
});

// GET /api/forecasts/summary
exports.summary = asyncHandler(async (req, res) => {
  res.json(await forecastService.summary());
});

// GET /api/forecasts/runs
exports.runs = asyncHandler(async (req, res) => {
  res.json({ data: await forecastService.runs() });
});

// GET /api/forecasts/product/:productId?horizon=7|30&historyDays=60
exports.product = asyncHandler(async (req, res) => {
  const horizon = forecastService.parseHorizon(req.query.horizon, 30);
  const historyDays = Math.min(400, Math.max(7, parseInt(req.query.historyDays, 10) || 60));
  const productId = String(req.params.productId).trim().toUpperCase();
  res.json(await forecastService.productForecast({ productId, horizon, historyDays }));
});

// GET /api/reorder?horizon=7|30
exports.reorder = asyncHandler(async (req, res) => {
  const horizon = forecastService.parseHorizon(req.query.horizon, 7);
  res.json(await reorderService.recommendations({ horizon }));
});
