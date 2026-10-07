const mongoose = require('mongoose');

const metricsSchema = new mongoose.Schema(
  {
    mae: Number,
    rmse: Number,
    mape: Number, // percent; null when the product had no non-zero actuals in the test window
    wape: Number, // percent; sum(|error|) / sum(actual)
    testDays: Number,
  },
  { _id: false }
);

// One document per product per future day, written by the Python ML pipeline
// (via Node). Each successful run replaces the previous run's documents.
const forecastSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, index: true },
    productId: { type: String, required: true, trim: true, uppercase: true },
    forecastDate: { type: Date, required: true },
    predictedDemand: { type: Number, required: true, min: 0 },
    // 1 = first day after the last day of sales history, 2 = second day, ...
    dayAhead: { type: Number, required: true, min: 1 },
    model: { type: String, required: true },
    // Back-test accuracy of this product's forecasts (hold-out period).
    metrics: metricsSchema,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'forecasts', versionKey: false }
);

forecastSchema.index({ productId: 1, forecastDate: 1 }, { unique: true });
forecastSchema.index({ forecastDate: 1 });

module.exports = mongoose.model('Forecast', forecastSchema);
