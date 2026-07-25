import { AdminHomePlaceholder } from '../../features/admin-shell';

/**
 * Authenticated Admin root. It renders inside the `(protected)` layout's shell,
 * so it only needs to supply the thin main-region placeholder; the shell owns
 * the chrome. URL stays `/`. Later phases replace the placeholder with real
 * operational content.
 */
export default function HomePage() {
  return <AdminHomePlaceholder />;
}
