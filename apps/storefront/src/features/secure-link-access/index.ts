/**
 * The secure-link access capability (`APP4-S02`).
 *
 * What crosses this boundary is the **security machinery and the three access
 * states**, and nothing about what a link opens. `APP5-D01` reuses the APP4
 * secure-access frames rather than redrawing them (`FIG-APP5-MATRIX-STATUS`,
 * `674:3`), so `APP5-S02` composes exactly these pieces and supplies only the
 * authorized content — which is the whole reason there is one fragment parser,
 * one strip, one credential lifetime and one unavailable card in the app rather
 * than a second set that could disagree with them.
 *
 * Deliberately not exported: the fragment reader and stripper. They are reached
 * only through {@link useSecureLinkBootstrap}, so no consumer can capture a
 * credential on its own terms or move the strip relative to the request.
 */
export {
  useSecureLinkBootstrap,
  type SecureLinkBootstrap,
} from './hooks/use-secure-link-bootstrap';
export { SECURE_LINK_COPY } from './model/secure-link-copy';
export type { SecureLinkState, SecureLinkStatus } from './model/secure-link-state';
export { SecureLinkQueryProvider } from './ui/secure-link-query-provider';
export { SecureLinkShell } from './ui/secure-link-shell';
