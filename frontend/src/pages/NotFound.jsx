import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState title="Page not found" message="The page you are looking for does not exist.">
        <Link className="btn btn-primary" to="/">Go to the dashboard</Link>
      </EmptyState>
    </div>
  );
}
