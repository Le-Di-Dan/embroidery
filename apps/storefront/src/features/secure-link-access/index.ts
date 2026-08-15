/**
 * The secure-link access capability (`APP4-S02`).
 *
 * The route mounts the provider, which owns the route-local TanStack client and
 * renders the screen. Nothing else in the app imports this feature's internals,
 * and nothing here is re-exported for reuse — a second mount point would be a
 * second place a fragment could be read.
 */
export { SecureLinkQueryProvider } from './ui/secure-link-query-provider';
