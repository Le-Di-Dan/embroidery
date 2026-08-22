/**
 * The secure quotation capability (`APP6-S01`).
 *
 * One export: the screen. The route mounts APP4's `SecureLinkQueryProvider`
 * around it and nothing else in the app reaches inside.
 *
 * Deliberately not exported: the controller, the API module, the state model,
 * the presentation mapper and every card. The controller is the only thing that
 * may spend the secure credential and the only thing that may name a version in
 * a decision; exporting it would let another surface do either on its own terms.
 * The copy catalog stays private for the same reason `APP5-S02` keeps its own —
 * these sentences are the approved wording for this route, not a shared string
 * table.
 */
export { SecureQuotationScreen } from './ui/secure-quotation-screen';
