/**
 * Why `APP4-S01`'s machinery verifies a contact.
 *
 * `SUBMISSION` — the purpose that precedes customer identity, and the only one
 * `/xac-minh-lien-he` ever issues. `STEP_UP` re-proves possession for a
 * sensitive action and belongs to whatever surface performs one.
 *
 * ### Why this is a parameter now, and still not a prop
 *
 * `APP6-S01` performs a sensitive action — accepting a quotation commits a
 * price — and `APP6-B05` refuses it with `REVERIFICATION_REQUIRED` until a
 * fresh `STEP_UP` stands for the grant's own customer. The remedy has to run
 * **inside** the mounted quote session: the secure-link credential is already
 * stripped from the URL and deliberately not persisted, so navigating to the
 * APP4 route to verify would destroy the only copy of it.
 *
 * So the purpose became an argument to {@link useContactVerification} rather
 * than a constant baked into the API call. It is deliberately *not* a component
 * prop and not part of any card's interface: it is fixed by the surface that
 * mounts the flow, in one place, at the controller seam — which is what stops
 * it from becoming a value a form could widen.
 *
 * The values come from the generated contract, so a wire string is never a
 * typed literal.
 */
import { IssueVerificationChallengeBodyPurpose } from '@embroidery/api-client';

export const VERIFICATION_PURPOSES = {
  SUBMISSION: IssueVerificationChallengeBodyPurpose.SUBMISSION,
  STEP_UP: IssueVerificationChallengeBodyPurpose.STEP_UP,
} as const;

export type VerificationPurpose =
  (typeof VERIFICATION_PURPOSES)[keyof typeof VERIFICATION_PURPOSES];

/** What `/xac-minh-lien-he` issues, unchanged since `APP4-S01`. */
export const DEFAULT_VERIFICATION_PURPOSE = VERIFICATION_PURPOSES.SUBMISSION;
