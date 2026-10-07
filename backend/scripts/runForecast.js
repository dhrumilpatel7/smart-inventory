// Runs the ML pipeline from the command line and stores the result in MongoDB,
// exactly like the "Run forecast" button does:   npm run forecast
const { connectDB, disconnectDB } = require('../config/db');
const forecastService = require('../services/forecastService');

(async () => {
  try {
    await connectDB();
    const { run, forecastsStored } = await forecastService.runForecast({ triggeredBy: 'cli' });
    console.log(`Selected model : ${run.model}`);
    console.log(`Reason         : ${run.selectionReason}`);
    console.log(`Test metrics   : MAE ${run.metrics.mae} | RMSE ${run.metrics.rmse} | MAPE ${run.metrics.mape}% | WAPE ${run.metrics.wape}%`);
    console.log(`Forecast window: ${run.forecastStartDate.toISOString().slice(0, 10)} -> ${run.forecastEndDate.toISOString().slice(0, 10)}`);
    console.log(`Stored         : ${forecastsStored} forecast rows for ${run.productsForecast} products (${run.durationMs} ms)`);
  } catch (err) {
    console.error('Forecast failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
})();
