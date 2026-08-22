/**
 * Browser-side calls for the contact-verification flow (`APP4-S01` §7).
 *
 * Every call goes through a **generated operation** with the repository's own
 * Axios instance; no path string appears in this feature, so a route rename
 * arrives as a regenerated client rather than a 404 nobody notices.
 *
 * The code the customer types passes through {@link submitVerificationAttempt}
 * as an ordinary argument and is gone when the promise settles. It is never
 * captured in a module-level variable, never logged, and never returned — the
 * attempt response is the challenge's state, which is what the caller needs.
 */
import {
  publicVerificationIssue,
  publicVerificationResend,
  publicVerificationSubmitAttempt,
  publicVerificationReadStatus,
  type VerificationChallengeResponse,
  type VerificationChallengeStatusResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { CONTACT_KIND_VALUES, type ContactKind } from '../model/contact-draft';
import type { VerificationPurpose } from '../model/verification-purpose';

/**
 * Requests a code for a destination. The contact is sent exactly as typed.
 *
 * `purpose` is required rather than defaulted here: a default at the transport
 * seam is the one place a step-up could silently become a submission, and the
 * server treats the two as different proofs — only a `STEP_UP` challenge
 * satisfies `APP6-B05`'s GRD-003. The controller fixes it once, from the
 * surface that mounted the flow.
 */
export async function issueVerificationChallenge(
  contactKind: ContactKind,
  contact: string,
  purpose: VerificationPurpose,
): Promise<VerificationChallengeResponse> {
  const body = await publicVerificationIssue(
    { contact, contactKind: CONTACT_KIND_VALUES[contactKind], purpose },
    { instance: getBrowserApiClient() },
  );
  return body.data;
}

/**
 * Asks for a replacement code for an open challenge.
 *
 * The resend operation, never the issue one (§13). Calling issue instead would
 * be a cooldown-free resend, which is exactly the bypass `APP4-B03` refuses —
 * and it takes no body, so there is no field through which this call could
 * redirect someone else's code.
 */
export async function resendVerificationChallenge(
  challengeId: string,
): Promise<VerificationChallengeResponse> {
  const body = await publicVerificationResend(challengeId, { instance: getBrowserApiClient() });
  return body.data;
}

/** Answers a challenge. `code` is a string so a leading zero survives. */
export async function submitVerificationAttempt(
  challengeId: string,
  code: string,
): Promise<VerificationChallengeStatusResponse> {
  const body = await publicVerificationSubmitAttempt(
    challengeId,
    { code },
    { instance: getBrowserApiClient() },
  );
  return body.data;
}

/**
 * Reads a challenge's authoritative state.
 *
 * Called only to resolve a refusal the status code cannot disambiguate — never
 * polled. A challenge past its expiry reads `EXPIRED` whether or not a sweep has
 * run, so one read after a refusal is always current.
 */
export async function readVerificationChallengeStatus(
  challengeId: string,
): Promise<VerificationChallengeStatusResponse> {
  const body = await publicVerificationReadStatus(challengeId, {
    instance: getBrowserApiClient(),
  });
  return body.data;
}
