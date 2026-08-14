/**
 * The public answers a verification endpoint may give (`APP4-B03` §15).
 *
 * Two audiences, deliberately not the same. Internally a refusal has a
 * {@link VerificationIssueFailure}, because a metric or a test that cannot tell
 * "policy missing" from "rate exceeded" cannot prove a rule. Externally there
 * are four shapes, and the boundary between them is the rule:
 *
 * - **400** — the body did not parse. The platform pipe owns this one.
 * - **422** — the contact is not a usable target, or the session reference is
 *   not real. About the caller's own input.
 * - **429** — too soon, or too many. About the caller's own recent behaviour.
 * - **503** — the service is not configured to issue. About the server.
 *
 * None of them depends on **who owns the target**. There is deliberately no
 * `CUSTOMER_NOT_FOUND`, no `ALREADY_REGISTERED` and no variant reachable only
 * for a contact that belongs to someone: an unknown address and a long-standing
 * customer's address produce byte-identical answers, which is
 * `ADR-APP4-001` §1.3 rule 4 as a property of this file rather than a comment.
 *
 * `CHALLENGE_NOT_RESENDABLE` is 422 rather than 404 on purpose. A 404 would
 * separate "no such challenge" from "that challenge cannot be resent", and an id
 * that answers differently is an id an attacker can confirm.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

import type { VerificationIssueFailure } from './verification-issue-outcome';

/** The contact cannot become a verification target. */
function contactNotAcceptable(): HttpException {
  return new HttpException(
    { message: 'That contact cannot be used for verification.' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/** The named challenge cannot be resent, for any reason. */
function challengeNotResendable(): HttpException {
  return new HttpException(
    { message: 'That verification challenge cannot be resent.' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/** The referenced design session does not exist. */
function sessionReferenceInvalid(): HttpException {
  return new HttpException(
    { message: 'That verification request references something that does not exist.' },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/** The resend cooldown has not elapsed. Carries no instant: the client has it. */
function resendTooSoon(): HttpException {
  return new HttpException(
    { message: 'A code was sent recently. Please wait before requesting another.' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/** The issuance budget for this target and purpose is spent. */
function issuanceRateExceeded(): HttpException {
  return new HttpException(
    { message: 'Too many verification requests. Please try again later.' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * The service cannot issue because its policy is not published or not valid.
 *
 * 503 rather than 500: nothing about the request is wrong, and the condition is
 * an operator action away from resolved. The client is told nothing about which
 * value is missing.
 */
function verificationUnavailable(): HttpException {
  return new HttpException(
    { message: 'Verification is temporarily unavailable.' },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

/**
 * A lost CST-007 race, presented as the ordinary "too soon".
 *
 * Reachable only if the advisory lock was not held. Another transaction has just
 * opened a challenge for this exact target, so from the caller's point of view a
 * code is already on its way and asking again immediately is precisely what the
 * cooldown exists to refuse. Reporting a conflict would leak that a *concurrent*
 * request for the same address is in flight.
 */
const RESPONSE_OF: Readonly<Record<VerificationIssueFailure, () => HttpException>> = {
  CONTACT_NOT_ACCEPTABLE: contactNotAcceptable,
  VERIFICATION_POLICY_UNAVAILABLE: verificationUnavailable,
  ISSUANCE_RATE_EXCEEDED: issuanceRateExceeded,
  RESEND_TOO_SOON: resendTooSoon,
  CHALLENGE_NOT_RESENDABLE: challengeNotResendable,
  SESSION_REFERENCE_INVALID: sessionReferenceInvalid,
  CONCURRENT_ISSUE_LOSS: resendTooSoon,
};

export function verificationFailureResponse(failure: VerificationIssueFailure): HttpException {
  return RESPONSE_OF[failure]();
}
