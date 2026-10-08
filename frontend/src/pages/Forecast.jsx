import { useEffect, useState } from 'react';
import { ActualVsPredictedChart, DemandForecastChart } from '../charts/Charts';
import StaleForecastNotice from '../components/ForecastNotice';
import RunForecastButton from '../components/RunForecastButton';
import { IconGlobe } from '../components/Icons';
import {
  Card, EmptyState, ErrorState, Field, Loading,
  PageHeader, Segmented, StatCard
} from '../components/ui';
import useFetch from '../hooks/useFetch';
import { useProductOptions } from '../hooks/useOptions';
import { forecastApi } from '../services/api';
import {
  formatDate, formatDateTime, formatDecimal, formatNumber
} from '../utils/format';

function ModelComparison({ run }) {
  const models = run?.modelComparison || run?.models || [];

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Model</th>
            <th className="num">Validation Accuracy</th>
            <th className="num">Test Accuracy</th>
            <th>Result</th>
          </tr>
        </thead>

        <tbody>
          {models.map(m => {
            const va =
              m.validation?.accuracy ??
              m.validationAccuracy;

            const ta =
              m.test?.accuracy ??
              m.testAccuracy;

            return (
              <tr key={m.model}>
                <td className="strong">{m.model}</td>

                <td className="num">
                  {va != null
                    ? `${formatDecimal(va)}%`
                    : '—'}
                </td>

                <td className="num">
                  {ta != null
                    ? `${formatDecimal(ta)}%`
                    : '—'}
                </td>

                <td>
                  {m.selected ? (
                    <span className="badge good">
                      Selected
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Forecast() {
  const [productId, setProductId] = useState('');
  const [horizon, setHorizon] = useState(30);
  const [version, setVersion] = useState(0);

  const {
    products,
    loading: productsLoading,
    error: productsError
  } = useProductOptions();

  useEffect(() => {
    if (!productId && products.length) {
      setProductId(
        [...products]
          .sort((a, b) =>
            a.productId.localeCompare(b.productId)
          )[0].productId
      );
    }
  }, [products, productId]);

  const {
    data,
    loading,
    error,
    reload
  } = useFetch(
    () =>
      productId
        ? forecastApi.product(productId, {
            horizon,
            historyDays: 60
          })
        : Promise.resolve(null),
    [productId, horizon, version]
  );

  const refresh = () =>
    setVersion(v => v + 1);

  const run = data?.run;

  const accuracy =
    data?.metrics?.accuracy ??
    (data?.metrics?.wape != null
      ? Math.max(
          0,
          100 - Number(data.metrics.wape)
        )
      : null);

  const totalDemand =
    Number(data?.totalPredictedDemand || 0);

  const avgDemand =
    horizon
      ? totalDemand / horizon
      : 0;

  return (
    <>
      <PageHeader
        title="Demand forecast"
        description="Predicted units per day for each product using the Python machine-learning pipeline."
      >
        <RunForecastButton
          onDone={refresh}
          label={
            run
              ? 'Re-run forecast'
              : 'Run forecast'
          }
        />
      </PageHeader>

      <div className="sdg-inline-tip" style={{ marginBottom: 16 }}>
        <IconGlobe />
        <span>
          <strong>SDG 9.4 &amp; 12.3 AI-Driven Resource Efficiency:</strong> Machine learning forecasts demand chronologically across multiple models (GradientBoosting, Random Forest, Linear Regression) to prevent overstocking and reduce waste.
        </span>
      </div>

      <StaleForecastNotice
        stale={data?.stale}
        onDone={refresh}
      />

      <div
        className="card"
        style={{ marginBottom: 16 }}
      >
        <div
          className="toolbar"
          style={{ borderBottom: 0 }}
        >
          <Field
            label="Product"
            className="wide"
          >
            <select
              className="select"
              value={productId}
              onChange={e =>
                setProductId(e.target.value)
              }
              disabled={productsLoading}
            >
              {productsLoading && (
                <option value="">
                  Loading…
                </option>
              )}

              {[...products]
                .sort((a, b) =>
                  a.productId.localeCompare(
                    b.productId
                  )
                )
                .map(p => (
                  <option
                    key={p.productId}
                    value={p.productId}
                  >
                    {p.productId} · {p.name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Forecast horizon">
            <Segmented
              label="Forecast horizon"
              value={horizon}
              onChange={setHorizon}
              options={[
                {
                  value: 7,
                  label: '7 days'
                },
                {
                  value: 30,
                  label: '30 days'
                }
              ]}
            />
          </Field>

          <div className="spacer" />

          {run && (
            <div className="small muted">
              Generated{' '}
              {formatDateTime(
                run.createdAt
              )}
              {' · '}
              trained on sales up to{' '}
              {run.historyEndDate
                ? formatDate(
                    run.historyEndDate
                  )
                : 'latest completed day'}
            </div>
          )}
        </div>
      </div>

      {productsError ? (
        <div className="card">
          <ErrorState
            message={productsError}
          />
        </div>
      ) : loading ||
        (!data && productsLoading) ? (
        <Loading label="Loading forecast…" />
      ) : error ? (
        <div className="card">
          <ErrorState
            message={error}
            onRetry={reload}
          />
        </div>
      ) : !data ? (
        <div className="card">
          <EmptyState
            title="No products"
            message="Import the CSV data first, then run the forecast."
          />
        </div>
      ) : !data.available ? (
        <div className="card">
          <EmptyState
            title="No forecast for this product"
            message={data.reason}
          >
            {!run && (
              <RunForecastButton
                onDone={refresh}
              />
            )}
          </EmptyState>
        </div>
      ) : (
        <div className="stack">

          <div className="grid grid-stats">

            <StatCard
              label="Model Accuracy"
              value={
                accuracy != null
                  ? `${formatDecimal(accuracy)}%`
                  : '—'
              }
              hint="measured on unseen test data"
            />

            <StatCard
              label="ML Model"
              value={
                <span
                  style={{ fontSize: 18 }}
                >
                  {data.model ||
                    'ML Model'}
                </span>
              }
              hint="selected using validation performance"
            />

            <StatCard
              label="Forecast Horizon"
              value={`${horizon} days`}
              hint="future demand prediction"
            />

            <StatCard
              label="Forecast Demand"
              value={`${formatNumber(
                Math.ceil(totalDemand)
              )} units`}
              hint={`expected demand for next ${horizon} days`}
            />

            <StatCard
              label="Average Daily Demand"
              value={`${formatDecimal(
                avgDemand
              )} units`}
              hint="predicted units per day"
            />

          </div>

          <Card
            title={`${data.product.name}: historical vs forecast demand`}
            subtitle={`Last 60 days of real sales, then the next ${horizon} days predicted`}
          >
            {data.history?.length &&
            data.forecast?.length ? (
              <DemandForecastChart
                history={data.history}
                forecast={data.forecast}
                forecastKey="predictedDemand"
                height={300}
              />
            ) : (
              <EmptyState
                title="No chart data"
                message="No historical or forecast data is available."
              />
            )}
          </Card>

          <div className="grid grid-2">

            <Card
              title="Forecast values"
              subtitle="Predicted units for each future date"
              pad={false}
            >
              <div
                className="table-wrap"
                style={{
                  maxHeight: 330,
                  overflowY: 'auto'
                }}
              >
                <table className="table">
                  <thead>
                    <tr>
                      <th>Forecast date</th>
                      <th className="num">
                        Day
                      </th>
                      <th className="num">
                        Predicted demand
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {(data.forecast || [])
                      .map(f => (
                        <tr key={f.date}>
                          <td>
                            {formatDate(
                              f.date
                            )}
                          </td>

                          <td className="num muted">
                            +{f.dayAhead}
                          </td>

                          <td className="num strong">
                            {formatDecimal(
                              f.predictedDemand
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card
              title="Model performance on unseen data"
              subtitle="Historical sales were hidden from the model and then compared with its predictions."
            >
              <ActualVsPredictedChart
                data={data.backtest}
                height={250}
              />

              <p
                className="small muted"
                style={{ marginTop: 8 }}
              >
                Model accuracy is calculated
                from forecast error on unseen
                historical data.
              </p>
            </Card>

          </div>

          {run && (
            <Card
              title="Model comparison"
              subtitle="Models are compared using chronological validation data."
              pad={false}
            >
              <ModelComparison run={run} />

              <div className="card-body small muted">

                {run?.split?.train &&
                  `Train: ${formatDate(
                    run.split.train.startDate
                  )} – ${formatDate(
                    run.split.train.endDate
                  )}. `}

                {run?.split?.validation &&
                  `Validation: ${formatDate(
                    run.split.validation.startDate
                  )} – ${formatDate(
                    run.split.validation.endDate
                  )}. `}

                {run?.split?.test &&
                  `Test: ${formatDate(
                    run.split.test.startDate
                  )} – ${formatDate(
                    run.split.test.endDate
                  )}.`}

              </div>
            </Card>
          )}

        </div>
      )}
    </>
  );
}
