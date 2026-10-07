import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { errorMessage, forecastApi } from '../services/api';
import { IconRefresh } from './Icons';

// Asks the backend to run the Python ML pipeline (React -> Node -> Python -> Node -> React).
export default function RunForecastButton({ onDone, label = 'Run forecast', primary = true }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function run() {
    setBusy(true);
    try {
      const result = await forecastApi.run();
      toast.success(`Forecast ready: ${result.run.model}, ${result.forecastsStored} predictions stored.`);
      if (onDone) onDone(result);
    } catch (err) {
      toast.error(`Forecast failed: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={`btn ${primary ? 'btn-primary' : ''}`} onClick={run} disabled={busy}>
      {busy ? <span className="spinner sm" /> : <IconRefresh />}
      {busy ? 'Training models…' : label}
    </button>
  );
}
