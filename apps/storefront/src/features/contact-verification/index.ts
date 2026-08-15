/**
 * The contact-verification capability (`APP4-S01`).
 *
 * The route mounts the provider, which owns the route-local TanStack client and
 * renders the screen. Nothing else in the app imports this feature's internals.
 */
export { VerificationQueryProvider } from './ui/verification-query-provider';
