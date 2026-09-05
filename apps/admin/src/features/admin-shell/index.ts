// Public surface of the admin-shell feature. Route files import from here only;
// internal components/hooks/services/model stay encapsulated.
export { AdminShell } from './components/admin-shell';
export { AdminHomeLaunchpad } from './components/admin-home-launchpad';
export { ADMIN_HOME_DESTINATIONS } from './model/admin-home-destinations';
export type { AdminHomeDestination } from './model/admin-home-destinations';
