import { AdminHomeLaunchpad } from '../../features/admin-shell';

/**
 * Authenticated Admin root. It renders inside the `(protected)` layout's shell,
 * so it only needs to supply the main-region content; the shell owns the
 * chrome. URL stays `/`.
 *
 * `APP12-V02` §19 replaced the placeholder this route used to render: it told an
 * operator that the operational capabilities would arrive in later phases, on a
 * product where all of them had (`V01-UX-015`).
 */
export default function HomePage() {
  return <AdminHomeLaunchpad />;
}
