/**
 * The secure design review capability (`APP6-S02`).
 *
 * One export: the screen. The route mounts APP4's `SecureLinkQueryProvider`
 * around it and nothing else in the app reaches inside.
 *
 * Deliberately not exported: the controller, the API module, the scene adapter,
 * the consent model, the watermark and every card. The controller is the only
 * thing that may spend the secure credential and the only thing that may name a
 * version, a document hash and an agreement set in a decision; exporting it
 * would let another surface do any of those on its own terms. The scene adapter
 * and the watermark stay private because a second consumer is the moment to
 * extract a shared primitive deliberately, not the moment to acquire one by
 * import. The copy catalog stays private for the same reason `APP6-S01` keeps
 * its own — these sentences are the approved wording for this route, not a
 * shared string table.
 */
export { SecureDesignReviewScreen } from './ui/secure-design-review-screen';
