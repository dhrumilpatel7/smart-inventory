const mongoose = require('mongoose');

// Audit record for every execution of the ML pipeline (successful or failed).
// Holds run-level information that does not belong on individual forecast rows.
const forecastRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['SUCCESS', 'FAILED'], required: true },
    model: String, // selected model name
    selectionReason: String,
    horizonDays: Number,
    metrics: mongoose.Schema.Types.Mixed, // hold-out metrics of the selected model
    modelComparison: [mongoose.Schema.Types.Mixed],
    split: mongoose.Schema.Types.Mixed,
    dataSummary: mongoose.Schema.Types.Mixed,
    features: [String],
    featureImportance: [mongoose.Schema.Types.Mixed],
    // Hold-out comparison per product: { P001: { dates, actual, predicted } }
    backtest: { type: mongoose.Schema.Types.Mixed, select: false },
    forecastStartDate: Date,
    forecastEndDate: Date,
    historyEndDate: Date,
    productsForecast: Number,
    skippedProducts: [String],
    errorCode: String,
    errorMessage: String,
    durationMs: Number,
    triggeredBy: String,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'forecast_runs', versionKey: false }
);

forecastRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ForecastRun', forecastRunSchema);
