/**
 * The contact-verification capability (`APP4-S01`).
 *
 * The route mounts the provider, which owns the route-local TanStack client and
 * renders the screen. Nothing else in the app imports this feature's internals.
 */
export { VerificationQueryProvider } from './ui/verification-query-provider';

/**
 * The flow itself, released for `APP5-S01`.
 *
 * `APP5-S01` embeds contact verification as **step 2 of a longer flow** rather
 * than as a page, so it needs the controller and the three approved cards, not
 * the route wrapper: it mounts its own TanStack boundary and draws its own step
 * rail around them. What crosses is the same hook and the same components the
 * `/xac-minh-lien-he` screen composes — one implementation of the approved
 * `APP4-D01` states, reused rather than redrawn.
 *
 * The screen itself is deliberately **not** exported. It owns the `h1` and the
 * page layout of its own route, which is exactly what an embedded step must not
 * bring with it.
 *
 * Nothing about the verification code crosses this boundary: it never enters
 * reducer state, never leaves the code-entry input and its ref, and no export
 * here can reach it.
 */
export { useContactVerification, type ContactVerification } from './hooks/use-contact-verification';
export { useNow } from './hooks/use-now';
export { VERIFICATION_COPY } from './model/verification-copy';
export { isResendAvailable, verificationUiState } from './model/verification-state';
export { CodeEntryCard } from './ui/code-entry-card';
export { ContactEntryCard } from './ui/contact-entry-card';
export { VerificationOutcomeCard } from './ui/verification-outcome-card';
