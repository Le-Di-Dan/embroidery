/**
 * Submission confirmation (`APP5-S02`).
 *
 * Two exports, and the pair is the boundary: the route reads and validates the
 * display code, then renders the screen with it. Validation is separated from
 * rendering so the "this is not a credential, it is only printed" rule has one
 * place it is enforced and one place it can be tested.
 */
export { readRequestCode } from './model/request-code';
export { CustomRequestConfirmationScreen } from './ui/custom-request-confirmation-screen';
