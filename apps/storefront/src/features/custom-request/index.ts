/**
 * Public surface of the custom-request capability (`APP5-S01`).
 *
 * The route mounts the provider, which owns the route-local TanStack client and
 * renders the screen. Hooks, models, the flow reducer and the API module stay
 * encapsulated — nothing outside this feature composes a submission body or
 * reads an upload's bindability.
 *
 * The copy is exported because the route segment names the page from it, so the
 * screen's vocabulary lives in exactly one file.
 */
export { CustomRequestQueryProvider } from './ui/custom-request-query-provider';
export { CUSTOM_REQUEST_COPY } from './model/custom-request-copy';
