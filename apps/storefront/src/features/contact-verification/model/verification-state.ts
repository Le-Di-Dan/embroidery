/**
 * The `APP4-S01` verification flow as one explicit state model.
 *
 * A reducer rather than Zustand, deliberately: this state is the interaction
 * state of one screen, it must not survive a reload (§10 — no authority defines
 * recovery for a live challenge), and one of the things it holds — the code the
 * customer typed — must never reach a store anything else can read.
 *
 * Two layers, and the split is the point:
 *
 * - {@link VerificationState} is what the flow *is*: a status, the contact, and
 *   the challenge the server issued. It holds no derived timing.
 * - {@link verificationUiState} is which approved frame is on screen. Cooldown
 *   and resend-availability are **computed from the server's `resendAvailableAt`
 *   against the current instant**, never stored, so they cannot go stale and no
 *   60-second constant exists anywhere in this feature.
 *
 * The verification code is not in this state at all. It lives in the code-entry
 * component's own input state and is passed to the mutation through a ref, so
 * there is no reducer action carrying it and no snapshot of this object that
 * could contain it.
 *
 * ## The contact is an email, and that is a property of the type
 *
 * `APP12-N01.S01` removed `contactKind` from this model rather than pinning it
 * to `'EMAIL'`. `CUSTOMER_OTP_CHANNEL = EMAIL_ONLY`, so a field that can only
 * hold one value is a field whose every read is already answered, and the
 * `CONTACT_KIND_CHANGED` action it existed for described a choice the product
 * no longer offers.
 *
 * That is also what closes stale `PHONE` state (`S01` §14) at its root. This
 * reducer is in-memory and reachable only through the actions below: it is
 * never written to `localStorage`, `sessionStorage`, a cookie or the URL, so it
 * cannot outlive a reload — and after `S01` there is no longer a *shape* in
 * which a `PHONE` draft could be expressed even if something tried to restore
 * one. Nothing has to detect and reset such a draft, because nothing can hold
 * one.
 */

/** The challenge facts the server publishes. Nothing here is derived locally. */
export interface VerificationChallenge {
  readonly challengeId: string;
  /** ISO instant. The code stops being answerable here; never extended. */
  readonly expiresAt: string;
  /** ISO instant. The earliest a resend is accepted (`APP4-B03` §6). */
  readonly resendAvailableAt: string;
  /**
   * The canonical `APP4-P01` mask, produced server-side.
   *
   * Displayed as received. The browser neither derives nor re-derives it —
   * that is the whole point of `FU-APP4-S01-MASKED-DESTINATION-01`.
   */
  readonly recipientMasked: string;
}

/**
 * The phase the flow is in.
 *
 * Cooldown, resend-availability and mismatch are **not** phases: the first two
 * are functions of time and the third is a notice on the code-entry phase.
 * Modelling them as phases would make "in cooldown" and "showed a mismatch"
 * mutually exclusive, which they are not.
 *
 * `CHANNEL_UNSUPPORTED` is the defensive terminal for a refusal this UI can no
 * longer provoke — see {@link VerificationAction}.
 */
export type VerificationStatus =
  | 'CONTACT_ENTRY'
  | 'REQUESTING'
  | 'CODE_ENTRY'
  | 'VERIFYING'
  | 'EXPIRED'
  | 'LOCKED'
  | 'RATE_LIMITED'
  | 'CHANNEL_UNSUPPORTED'
  | 'SUCCESS'
  | 'RECOVERABLE_ERROR';

/** A one-shot message on the code-entry card, cleared by the next action. */
export type CodeNotice = 'MISMATCH' | 'RESENT';

export interface VerificationState {
  readonly status: VerificationStatus;
  /** The email as typed. Sent once; never rendered where the design requires the mask. */
  readonly contact: string;
  /** Set only by client-side shape validation, for the `623:27` state. */
  readonly contactInvalid: boolean;
  readonly challenge: VerificationChallenge | undefined;
  /**
   * The mask of the destination this flow last targeted.
   *
   * Held separately from `challenge` because it outlives it: the approved
   * expired, lockout and success frames all still show where the code went (or
   * will go), while the challenge itself is finished and must not be answerable.
   * It is the server's mask and nothing else — no contact value survives here.
   */
  readonly recipientMasked: string | undefined;
  readonly notice: CodeNotice | undefined;
}

export const initialVerificationState: VerificationState = {
  status: 'CONTACT_ENTRY',
  contact: '',
  contactInvalid: false,
  challenge: undefined,
  recipientMasked: undefined,
  notice: undefined,
};

/**
 * Everything that can move the flow.
 *
 * `CHANNEL_UNSUPPORTED` is dispatched only from the issue error path, when the
 * server's envelope carries that business code. After `S01` no control in this
 * feature can produce a non-email challenge, so the branch is defence in depth
 * rather than a reachable state: it exists so that if the refusal ever does
 * arrive it is answered with the truth — codes go to email — instead of being
 * rendered as "that email is malformed", which is what a bare 422 maps to.
 */
export type VerificationAction =
  | { type: 'CONTACT_CHANGED'; contact: string }
  | { type: 'CONTACT_REJECTED' }
  | { type: 'ISSUE_STARTED' }
  | { type: 'CHALLENGE_OPENED'; challenge: VerificationChallenge }
  | { type: 'RESEND_SUCCEEDED'; challenge: VerificationChallenge }
  | { type: 'ATTEMPT_STARTED' }
  | { type: 'ATTEMPT_MISMATCHED' }
  | { type: 'CHALLENGE_EXPIRED' }
  | { type: 'CHALLENGE_LOCKED' }
  | { type: 'RATE_LIMITED' }
  | { type: 'CHANNEL_UNSUPPORTED' }
  | { type: 'VERIFIED' }
  | { type: 'REQUEST_FAILED' }
  | { type: 'RESTARTED' };

export function verificationReducer(
  state: VerificationState,
  action: VerificationAction,
): VerificationState {
  switch (action.type) {
    case 'CONTACT_CHANGED':
      return { ...state, contact: action.contact, contactInvalid: false };
    case 'CONTACT_REJECTED':
      return { ...state, status: 'CONTACT_ENTRY', contactInvalid: true };
    case 'ISSUE_STARTED':
      return { ...state, status: 'REQUESTING', contactInvalid: false };
    case 'CHALLENGE_OPENED':
      return {
        ...state,
        status: 'CODE_ENTRY',
        challenge: action.challenge,
        recipientMasked: action.challenge.recipientMasked,
        notice: undefined,
      };
    case 'RESEND_SUCCEEDED':
      // The replacement's identity wholly replaces the old one (§13): a later
      // attempt must answer the new challenge, never the cancelled source.
      return {
        ...state,
        status: 'CODE_ENTRY',
        challenge: action.challenge,
        recipientMasked: action.challenge.recipientMasked,
        notice: 'RESENT',
      };
    case 'ATTEMPT_STARTED':
      return { ...state, status: 'VERIFYING', notice: undefined };
    case 'ATTEMPT_MISMATCHED':
      return { ...state, status: 'CODE_ENTRY', notice: 'MISMATCH' };
    case 'CHALLENGE_EXPIRED':
      return { ...state, status: 'EXPIRED', notice: undefined };
    case 'CHALLENGE_LOCKED':
      return { ...state, status: 'LOCKED', notice: undefined };
    case 'RATE_LIMITED':
      return { ...state, status: 'RATE_LIMITED', notice: undefined };
    case 'CHANNEL_UNSUPPORTED':
      // Keeps the customer on contact entry with the field populated: the
      // remedy is an email address, and the card that takes one is the card
      // this state renders.
      return { ...state, status: 'CHANNEL_UNSUPPORTED', notice: undefined };
    case 'VERIFIED':
      // The challenge is dropped on success: nothing downstream may answer it
      // again, and its id has no purpose on the success frame.
      return { ...state, status: 'SUCCESS', challenge: undefined, notice: undefined };
    case 'REQUEST_FAILED':
      return { ...state, status: 'RECOVERABLE_ERROR', notice: undefined };
    case 'RESTARTED':
      // Back to contact entry, keeping what the customer typed so a new code can
      // be requested without retyping — the approved expiry and lockout frames
      // both keep the field populated.
      return { ...initialVerificationState, contact: state.contact };
    default:
      return state;
  }
}

/** Exactly the approved `APP4-S01` screens, one name per drawn state. */
export type VerificationUiState =
  | 'CONTACT_ENTRY'
  | 'INVALID_CONTACT'
  | 'REQUESTING'
  | 'CODE_ENTRY'
  | 'VERIFYING'
  | 'MISMATCH'
  | 'COOLDOWN'
  | 'RESEND_AVAILABLE'
  | 'EXPIRED'
  | 'LOCKED'
  | 'RATE_LIMITED'
  | 'CHANNEL_UNSUPPORTED'
  | 'SUCCESS'
  | 'RECOVERABLE_ERROR';

/**
 * Which approved frame is on screen right now.
 *
 * `nowMs` is a parameter rather than a `Date.now()` call so the mapping is a
 * pure function of state and time — testable with fake timers, and impossible to
 * make disagree with the countdown rendered beside it.
 */
export function verificationUiState(state: VerificationState, nowMs: number): VerificationUiState {
  if (state.status === 'CONTACT_ENTRY') {
    return state.contactInvalid ? 'INVALID_CONTACT' : 'CONTACT_ENTRY';
  }
  if (state.status !== 'CODE_ENTRY') {
    return state.status;
  }
  if (state.notice === 'MISMATCH') return 'MISMATCH';
  if (state.notice === 'RESENT') return 'RESEND_AVAILABLE';
  return isResendAvailable(state.challenge, nowMs) ? 'CODE_ENTRY' : 'COOLDOWN';
}

/**
 * Whether a resend is allowed, decided by the server's instant alone.
 *
 * No cooldown duration appears here or anywhere else in the feature: the server
 * publishes `resendAvailableAt` precisely so a client never hard-codes the 60
 * seconds behind it (`APP4-B03` §6, `APP4-D01` `634:181`).
 */
export function isResendAvailable(
  challenge: VerificationChallenge | undefined,
  nowMs: number,
): boolean {
  if (challenge === undefined) return false;
  return nowMs >= Date.parse(challenge.resendAvailableAt);
}

/** Milliseconds until a resend is allowed; `0` once it is. */
export function resendRemainingMs(
  challenge: VerificationChallenge | undefined,
  nowMs: number,
): number {
  if (challenge === undefined) return 0;
  return Math.max(0, Date.parse(challenge.resendAvailableAt) - nowMs);
}

/** `mm:ss`, matching the `00:47` the approved cooldown frame renders. */
export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
