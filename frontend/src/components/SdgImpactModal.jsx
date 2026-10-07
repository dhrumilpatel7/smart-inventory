import { Link } from 'react-router-dom';
import { IconCheck, IconClose, IconGlobe, IconLeaf, IconSparkles, IconTarget } from './Icons';
import { Modal } from './ui';

export const SDG_GOALS = [
  {
    number: 12,
    title: 'Responsible Consumption & Production',
    tagline: 'Minimizing overstocking and perishable inventory waste',
    color: '#bf8b2e',
    targets: [
      { code: '12.3', text: 'Halve per capita food waste and reduce post-harvest losses along supply chains' },
      { code: '12.5', text: 'Substantially reduce waste generation through prevention, reduction, and accurate demand planning' },
    ],
    contribution: 'Uses ML-based 7-day and 30-day demand predictions to order only what will be sold, preventing expired/dead stock.',
  },
  {
    number: 9,
    title: 'Industry, Innovation & Infrastructure',
    tagline: 'Upgrading enterprise systems with AI/ML capabilities',
    color: '#fd6925',
    targets: [
      { code: '9.4', text: 'Upgrade infrastructure and retrofit industries to make them sustainable with increased resource-use efficiency' },
      { code: '9.5', text: 'Enhance scientific research and upgrade technological capabilities of industrial sectors' },
    ],
    contribution: 'Replaces error-prone manual spreadsheets with automated scikit-learn time-series regression and historical demand analysis.',
  },
  {
    number: 13,
    title: 'Climate Action',
    tagline: 'Lowering transport logistics carbon footprint',
    color: '#3f7e44',
    targets: [
      { code: '13.2', text: 'Integrate climate change measures into enterprise operational planning and supply chains' },
    ],
    contribution: 'Reorder batch consolidation combines purchase orders per supplier, cutting redundant freight shipments and diesel emissions.',
  },
  {
    number: 2,
    title: 'Zero Hunger & Food Loss Prevention',
    tagline: 'Eliminating perishable spoilage across supply chains',
    color: '#dda63a',
    targets: [
      { code: '2.4', text: 'Ensure sustainable food production systems and resilient agricultural logistics' },
    ],
    contribution: 'High-frequency 7-day forecasts and safety stock formulas safeguard perishable food items from expiration before sale.',
  },
  {
    number: 8,
    title: 'Decent Work & Economic Growth',
    tagline: 'Protecting capital resilience and resource efficiency',
    color: '#a21942',
    targets: [
      { code: '8.4', text: 'Improve global resource efficiency in consumption and production' },
    ],
    contribution: 'Prevents locking valuable business working capital into dormant, non-moving inventory.',
  },
];

export default function SdgImpactModal({ onClose }) {
  return (
    <Modal title="UN Sustainable Development Goals (SDG) Alignment" onClose={onClose} size="lg">
      <div className="sdg-modal-content">
        <div className="sdg-hero-card">
          <div className="sdg-hero-icon">
            <IconGlobe />
          </div>
          <div>
            <h3>Smart Inventory &times; United Nations 2030 Agenda</h3>
            <p>
              This system actively incorporates principles of sustainable consumption, intelligent AI innovation,
              and low-carbon logistics into inventory management.
            </p>
          </div>
        </div>

        <div className="sdg-goals-list">
          {SDG_GOALS.map((goal) => (
            <div key={goal.number} className="sdg-goal-card" style={{ '--sdg-color': goal.color }}>
              <div className="sdg-badge-circle" style={{ backgroundColor: goal.color }}>
                <span>SDG</span>
                <strong>{goal.number}</strong>
              </div>
              <div className="sdg-goal-details">
                <div className="sdg-goal-header">
                  <h4>{goal.title}</h4>
                  <span className="sdg-goal-tag">{goal.tagline}</span>
                </div>
                <p className="sdg-goal-contribution">{goal.contribution}</p>
                <div className="sdg-targets-chips">
                  {goal.targets.map((t) => (
                    <span key={t.code} className="sdg-target-chip" title={t.text}>
                      <IconTarget /> Target {t.code}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="sdg-modal-footer">
          <div className="sdg-footer-tip">
            <IconSparkles />
            <span>Interactive Waste &amp; Carbon Simulator available in the Hub</span>
          </div>
          <Link to="/sustainability" className="btn btn-primary" onClick={onClose}>
            Open Sustainability Hub &rarr;
          </Link>
        </div>
      </div>
    </Modal>
  );
}
