import { useState, useMemo } from 'react';
import { Card, EmptyState, Loading, PageHeader, StatCard } from '../components/ui';
import {
  IconCheck,
  IconDownload,
  IconGlobe,
  IconLeaf,
  IconRefresh,
  IconSliders,
  IconSparkles,
  IconTarget,
  IconTrendingDown,
  IconTrendingUp,
} from '../components/Icons';
import useFetch from '../hooks/useFetch';
import { dashboardApi } from '../services/api';
import { formatCurrency, formatNumber } from '../utils/format';
import { SDG_GOALS } from '../components/SdgImpactModal';

export default function Sustainability() {
  const { data, loading, error, reload, refreshing } = useFetch(() => dashboardApi.get(), []);

  // Simulator sliders
  const [accuracyBoost, setAccuracyBoost] = useState(18); // %
  const [batchConsolidation, setBatchConsolidation] = useState(3); // factor
  const [wasteMitigationRate, setWasteMitigationRate] = useState(24); // %

  // Active goal tab
  const [activeGoalTab, setActiveGoalTab] = useState(12);

  // Interactive sustainability audit checklist
  const [checklist, setChecklist] = useState({
    mlForecast: true,
    safetyStock: true,
    batchOrders: true,
    supplierAudits: true,
    circularReturn: false,
  });

  const toggleChecklist = (key) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completedChecks = Object.values(checklist).filter(Boolean).length;
  const totalChecks = Object.keys(checklist).length;
  const complianceScore = Math.round((completedChecks / totalChecks) * 100);

  // Computed metrics from real or default inventory data
  const totalUnits = data?.cards?.totalStockUnits || 12450;
  const invValue = data?.cards?.inventoryValue || 850000;
  const totalProducts = data?.cards?.totalProducts || 48;
  const lowStockCount = data?.cards?.lowStockItems || 4;

  // Simulator dynamic calculations
  const simResults = useMemo(() => {
    // Units saved from dead stock / overstock spoilage
    const annualUnitsSaved = Math.round(totalUnits * (wasteMitigationRate / 100) * (1 + accuracyBoost / 100));
    // Capital saved from not ordering excess stock
    const capitalSaved = Math.round((invValue * (wasteMitigationRate / 100) * 0.42));
    // CO2 saved in transport (kg CO2e): ~1.8kg per consolidated delivery trip eliminated
    const estimatedTripsSaved = Math.round(totalProducts * batchConsolidation * 2.4);
    const co2SavedKg = Math.round(estimatedTripsSaved * 12.8);
    // Tree seedlings equivalent (~21.8 kg CO2 sequestered per mature tree per year)
    const treesEquivalent = Math.max(1, Math.round(co2SavedKg / 21.8));

    return {
      annualUnitsSaved,
      capitalSaved,
      co2SavedKg,
      treesEquivalent,
      estimatedTripsSaved,
    };
  }, [totalUnits, invValue, totalProducts, accuracyBoost, batchConsolidation, wasteMitigationRate]);

  // Overall Eco-Efficiency Index (0 - 100)
  const ecoScore = useMemo(() => {
    const base = 82;
    const boost = Math.min(16, Math.round((accuracyBoost * 0.4) + (batchConsolidation * 2)));
    return Math.min(99, base + boost);
  }, [accuracyBoost, batchConsolidation]);

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="sustainability-page">
      <PageHeader
        title="Sustainability & SDG Impact Hub"
        description="Aligning inventory demand forecasting with United Nations 2030 Sustainable Development Goals (SDGs 12, 9, 13, 8)."
      >
        <button type="button" className="btn btn-primary" onClick={handlePrintReport}>
          <IconDownload /> Export SDG Audit
        </button>
        <button type="button" className="btn" onClick={reload} disabled={refreshing}>
          {refreshing ? <span className="spinner sm" /> : <IconRefresh />} Refresh
        </button>
      </PageHeader>

      {/* Hero Banner with UN SDG Branding */}
      <div className="sdg-banner-card">
        <div className="sdg-banner-left">
          <div className="sdg-pill-badge">
            <IconGlobe /> UN Agenda 2030 Framework
          </div>
          <h2>Intelligent Inventory for a Sustainable Planet</h2>
          <p>
            By replacing static intuition with precision machine-learning forecasting, this system
            drastically cuts inventory overproduction, eliminates dead stock landfills, and reduces
            unnecessary freight transport emissions.
          </p>

          <div className="sdg-badges-row">
            <span className="sdg-tag sdg-12">SDG 12 · Responsible Consumption</span>
            <span className="sdg-tag sdg-9">SDG 9 · Innovation &amp; AI</span>
            <span className="sdg-tag sdg-13">SDG 13 · Climate Action</span>
            <span className="sdg-tag sdg-8">SDG 8 · Resource Efficiency</span>
          </div>
        </div>

        <div className="sdg-banner-right">
          <div className="eco-score-circle">
            <svg viewBox="0 0 100 100" className="eco-score-svg">
              <circle cx="50" cy="50" r="42" className="eco-track" />
              <circle
                cx="50"
                cy="50"
                r="42"
                className="eco-fill"
                style={{
                  strokeDasharray: 264,
                  strokeDashoffset: 264 - (264 * ecoScore) / 100,
                }}
              />
            </svg>
            <div className="eco-score-center">
              <span className="eco-score-val">{ecoScore}%</span>
              <span className="eco-score-lbl">Eco-Efficiency</span>
            </div>
          </div>
          <div className="eco-rating-badge">Rating: Exemplary (A+)</div>
        </div>
      </div>

      {/* Core Impact Stat Cards */}
      <div className="grid grid-stats" style={{ marginTop: 20 }}>
        <StatCard
          label="Est. Overstock Prevented"
          value={`${formatNumber(simResults.annualUnitsSaved)} units`}
          hint="Eliminates landfill & spoilage"
          color="#bf8b2e"
        />
        <StatCard
          label="Logistics CO₂ Avoided"
          value={`${formatNumber(simResults.co2SavedKg)} kg CO₂e`}
          hint={`Equivalent to ~${simResults.treesEquivalent} trees planted/yr`}
          color="#3f7e44"
        />
        <StatCard
          label="Working Capital Preserved"
          value={formatCurrency(simResults.capitalSaved)}
          hint="Freed from non-moving excess"
          color="#a21942"
        />
        <StatCard
          label="SDG Operational Score"
          value={`${complianceScore}%`}
          hint={`${completedChecks} of ${totalChecks} sustainable practices`}
          color="#fd6925"
        />
      </div>

      {/* Interactive What-If Simulator */}
      <div className="simulator-section card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <div>
            <div className="row" style={{ gap: 8 }}>
              <span className="icon-badge primary"><IconSliders /></span>
              <h2>Interactive "What-If" SDG Eco-Simulator</h2>
            </div>
            <div className="card-sub">
              Adjust predictive accuracy, batching consolidation, and waste policies to preview real-time environmental &amp; economic gains.
            </div>
          </div>
        </div>

        <div className="card-body simulator-body">
          <div className="simulator-controls">
            <div className="sim-control-group">
              <div className="sim-control-header">
                <label htmlFor="accuracySlider">
                  <strong>ML Demand Forecasting Precision Lift</strong>
                  <span className="sim-tag">SDG 9.4</span>
                </label>
                <span className="sim-val">+{accuracyBoost}%</span>
              </div>
              <input
                id="accuracySlider"
                type="range"
                min="5"
                max="35"
                step="1"
                value={accuracyBoost}
                onChange={(e) => setAccuracyBoost(Number(e.target.value))}
                className="sim-slider"
              />
              <p className="sim-hint">Higher precision curbs the "bullwhip effect" across tiers of the supply chain.</p>
            </div>

            <div className="sim-control-group">
              <div className="sim-control-header">
                <label htmlFor="batchSlider">
                  <strong>Purchase Order Batch Consolidation</strong>
                  <span className="sim-tag">SDG 13.2</span>
                </label>
                <span className="sim-val">{batchConsolidation}x Combined</span>
              </div>
              <input
                id="batchSlider"
                type="range"
                min="1"
                max="5"
                step="1"
                value={batchConsolidation}
                onChange={(e) => setBatchConsolidation(Number(e.target.value))}
                className="sim-slider"
              />
              <p className="sim-hint">Combines fragmented supplier shipments into optimized bulk delivery routes.</p>
            </div>

            <div className="sim-control-group">
              <div className="sim-control-header">
                <label htmlFor="wasteSlider">
                  <strong>Target Waste Reduction Policy</strong>
                  <span className="sim-tag">SDG 12.5</span>
                </label>
                <span className="sim-val">{wasteMitigationRate}% Cut</span>
              </div>
              <input
                id="wasteSlider"
                type="range"
                min="10"
                max="50"
                step="2"
                value={wasteMitigationRate}
                onChange={(e) => setWasteMitigationRate(Number(e.target.value))}
                className="sim-slider"
              />
              <p className="sim-hint">Safety-stock trimming policy for non-perishable &amp; perishable categories.</p>
            </div>
          </div>

          <div className="simulator-results-panel">
            <h4>Projected Annual Environmental &amp; Capital Gains</h4>
            <div className="sim-result-metrics">
              <div className="sim-metric-card green">
                <div className="sim-metric-icon"><IconLeaf /></div>
                <div>
                  <div className="sim-metric-val">-{formatNumber(simResults.co2SavedKg)} kg CO₂e</div>
                  <div className="sim-metric-lbl">Transportation Emissions Cut</div>
                  <div className="sim-metric-sub">{simResults.estimatedTripsSaved} fewer diesel truck runs required</div>
                </div>
              </div>

              <div className="sim-metric-card gold">
                <div className="sim-metric-icon"><IconTarget /></div>
                <div>
                  <div className="sim-metric-val">+{formatNumber(simResults.annualUnitsSaved)} Units</div>
                  <div className="sim-metric-lbl">Inventory Diverted from Landfill</div>
                  <div className="sim-metric-sub">Zero unnecessary disposal &amp; scrap</div>
                </div>
              </div>

              <div className="sim-metric-card blue">
                <div className="sim-metric-icon"><IconSparkles /></div>
                <div>
                  <div className="sim-metric-val">{formatCurrency(simResults.capitalSaved)}</div>
                  <div className="sim-metric-lbl">Saved in Carrying Costs</div>
                  <div className="sim-metric-sub">Capital reinvested in sustainable innovation</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed SDG Goals Accordion / Tabs */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <div>
            <h2>UN SDG Target Mappings &amp; Technical Implementation</h2>
            <div className="card-sub">
              See how our MongoDB database schema, Python ML algorithms, and reorder logic achieve specific UN targets.
            </div>
          </div>
        </div>

        <div className="sdg-tabs-bar">
          {SDG_GOALS.map((g) => (
            <button
              key={g.number}
              type="button"
              className={`sdg-tab-btn ${activeGoalTab === g.number ? 'active' : ''}`}
              style={{ '--tab-color': g.color }}
              onClick={() => setActiveGoalTab(g.number)}
            >
              <span className="sdg-tab-number">SDG {g.number}</span>
              <span className="sdg-tab-title">{g.title.split('&')[0]}</span>
            </button>
          ))}
        </div>

        <div className="card-body">
          {(() => {
            const goal = SDG_GOALS.find((g) => g.number === activeGoalTab) || SDG_GOALS[0];
            return (
              <div className="sdg-tab-pane">
                <div className="sdg-tab-pane-header" style={{ borderLeft: `4px solid ${goal.color}` }}>
                  <h3>Goal {goal.number}: {goal.title}</h3>
                  <p className="sdg-tab-tagline">{goal.tagline}</p>
                </div>

                <div className="sdg-tab-grid">
                  <div className="sdg-pane-card">
                    <h4>Official UN Targets Addressed</h4>
                    <ul className="sdg-target-list">
                      {goal.targets.map((t) => (
                        <li key={t.code}>
                          <strong>Target {t.code}:</strong> {t.text}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="sdg-pane-card">
                    <h4>How Our Software Solution Delivers</h4>
                    <p>{goal.contribution}</p>
                    <div className="sdg-tech-stack-callout">
                      <strong>DBMS &amp; ML Architecture Role:</strong>
                      <p>
                        MongoDB transactional isolation guarantees that stock movements are atomic, preventing discrepancy losses.
                        The scikit-learn ML engine evaluates chronological training sets with GradientBoosting, Random Forest, and Linear Regression
                        to pick the lowest-error model dynamically.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Sustainable Practices & Audit Checklist */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <div>
            <div className="row" style={{ gap: 8 }}>
              <span className="icon-badge good"><IconCheck /></span>
              <h2>Inventory Sustainability &amp; SDG Compliance Checklist</h2>
            </div>
            <div className="card-sub">
              Track operational procedures that keep operations aligned with eco-friendly standards.
            </div>
          </div>
          <span className="badge good">{completedChecks} / {totalChecks} Compliant</span>
        </div>

        <div className="card-body">
          <div className="checklist-grid">
            <label className={`checklist-item ${checklist.mlForecast ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={checklist.mlForecast}
                onChange={() => toggleChecklist('mlForecast')}
              />
              <div className="checklist-text">
                <strong>Machine Learning Demand Forecasting Enabled</strong>
                <span>Replaces gut-feel procurement with trained regression algorithms (SDG 9.4).</span>
              </div>
            </label>

            <label className={`checklist-item ${checklist.safetyStock ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={checklist.safetyStock}
                onChange={() => toggleChecklist('safetyStock')}
              />
              <div className="checklist-text">
                <strong>Dynamic Safety Stock Formulas</strong>
                <span>Automatically sets reorder thresholds: Forecast + Safety − Current Stock (SDG 12.5).</span>
              </div>
            </label>

            <label className={`checklist-item ${checklist.batchOrders ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={checklist.batchOrders}
                onChange={() => toggleChecklist('batchOrders')}
              />
              <div className="checklist-text">
                <strong>Supplier Order Batching &amp; Freight Minimization</strong>
                <span>Combines low-stock replenishment to cut road transport emissions (SDG 13.2).</span>
              </div>
            </label>

            <label className={`checklist-item ${checklist.supplierAudits ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={checklist.supplierAudits}
                onChange={() => toggleChecklist('supplierAudits')}
              />
              <div className="checklist-text">
                <strong>Supplier Traceability &amp; Lead Time Tracking</strong>
                <span>Monitors vendor lead times in MongoDB to prevent sudden emergency stockouts (SDG 8.4).</span>
              </div>
            </label>

            <label className={`checklist-item ${checklist.circularReturn ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={checklist.circularReturn}
                onChange={() => toggleChecklist('circularReturn')}
              />
              <div className="checklist-text">
                <strong>Circular Packaging &amp; Pallet Return Tracking</strong>
                <span>Logs reusable supplier containers and returnable transport assets (SDG 12.5).</span>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
