/**
 * The secure Ready-Made order capability (`APP12-S03`).
 *
 * One export: the screen. The route mounts APP4's `SecureLinkQueryProvider`
 * around it and nothing else in the app reaches inside.
 *
 * Deliberately not exported: the session controller, the API module, the state
 * model, the failure classification, the copy catalog and every card. The
 * session controller is the only thing that may spend the secure credential and
 * the FULL hook is the only thing that may open a payment attempt; exporting
 * either would let another surface do so on its own terms. The copy catalog
 * stays private for the same reason `APP5-S02`, `APP6-S01`, `APP7-S01` and
 * `APP9-S01` keep theirs — these sentences are the approved wording for this
 * one route, not a shared string table, and a payment sentence borrowed by
 * another screen is a payment claim made in the wrong place.
 */
export { SecureOrderScreen } from './ui/secure-order-screen';
