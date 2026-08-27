/**
 * The secure final-payment capability (`APP9-S01`).
 *
 * One export: the screen. The route mounts APP4's `SecureLinkQueryProvider`
 * around it and nothing else in the app reaches inside.
 *
 * Deliberately not exported: the controller, the API module, the state model,
 * the failure classification, the copy catalog and every card. The controller is
 * the only thing that may spend the secure credential and the only thing that
 * may open a payment attempt; exporting it would let another surface do either
 * on its own terms. The copy catalog stays private for the same reason
 * `APP5-S02`, `APP6-S01` and `APP7-S01` keep theirs — these sentences are the
 * approved wording for this one route, not a shared string table, and a payment
 * sentence borrowed by another screen is a payment claim made in the wrong
 * place.
 */
export { SecureFinalPaymentScreen } from './ui/secure-final-payment-screen';
