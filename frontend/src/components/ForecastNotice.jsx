import { Alert } from './ui';
import RunForecastButton from './RunForecastButton';

// Shown when sales were recorded after the forecast was generated.
export default function StaleForecastNotice({ stale, onDone }) {
  if (!stale) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <Alert type="warn" action={<RunForecastButton onDone={onDone} label="Re-run forecast" primary={false} />}>
        <b>The forecast is out of date.</b> Sales were recorded after it was generated. Re-run it so the predictions include the latest data.
      </Alert>
    </div>
  );
}
