/**
 * The closed public vocabulary of secure-link resolution (`APP4-B06`,
 * IMP-D049 PO-04).
 *
 * **One code, and the shape of this file is the non-disclosure rule.**
 *
 * `SECURE_LINK_UNAVAILABLE` is the single answer to every reason a link does not
 * resolve: an unknown token, an expired grant, a revoked one, one superseded by
 * a reissue, one presented for the wrong target, and one whose scope does not
 * cover the operation. There is deliberately no `…_EXPIRED`, no `…_REVOKED`, no
 * `…_SUPERSEDED` and no `…_WRONG_TARGET`.
 *
 * The reason is that this endpoint's caller may be an attacker holding a leaked
 * or guessed link, and each finer answer is a free oracle. "Expired" confirms
 * the token was real and tells them to look for a fresher message. "Revoked"
 * confirms the token was real *and* that somebody noticed. "Wrong target" is the
 * most dangerous of the three: it confirms a valid credential exists and that
 * only the accompanying identifiers were wrong — which is an invitation to try
 * other identifiers. A single answer makes all six indistinguishable, so a probe
 * learns exactly nothing it did not already know.
 *
 * This follows the delivered `PUBLIC_DESIGN_TEMPLATE_NOT_FOUND` shape
 * (`APP3-B05`), which IMP-D049 PO-04 names as the precedent.
 *
 * Nothing here interpolates a token, a digest, a grant, a customer, a request id
 * or a status into a message. There is one message string and it is a constant.
 */
import { NotFoundException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';

/** The one public code. A second member of this union would be the defect. */
export const SECURE_LINK_ERROR_CODES = ['SECURE_LINK_UNAVAILABLE'] as const;

export type SecureLinkErrorCode = (typeof SECURE_LINK_ERROR_CODES)[number];

/**
 * The one public message.
 *
 * Deliberately says nothing about *why*, and deliberately does not suggest a
 * remedy that would depend on the cause — "request a new link" would imply the
 * old one had existed.
 */
export const SECURE_LINK_UNAVAILABLE_MESSAGE = 'That secure link is not available.';

export class SecureLinkError extends Error {
  constructor(readonly code: SecureLinkErrorCode) {
    super(SECURE_LINK_UNAVAILABLE_MESSAGE);
    this.name = 'SecureLinkError';
  }
}

export function isSecureLinkError(error: unknown): error is SecureLinkError {
  return error instanceof SecureLinkError;
}

/**
 * The only way to refuse a resolution.
 *
 * A function taking no argument, on purpose: a `reason` parameter would be the
 * first step towards a response that varied with it, and there is nothing a
 * caller of *this* factory could pass that should reach the client. The internal
 * reason class travels to the audit trail on its own path
 * (`secure-link-audit.recorder.ts`), never through here.
 */
export function secureLinkUnavailable(): SecureLinkError {
  return new SecureLinkError('SECURE_LINK_UNAVAILABLE');
}

/**
 * Maps the transport-free domain error onto its HTTP exception.
 *
 * 404 rather than 401/403: the resource is not "forbidden to you", which would
 * confirm it exists. It is, as far as this caller may know, absent.
 *
 * 4xx survives the global exception filter with its code and message intact,
 * whereas a 5xx would be flattened to `INTERNAL_SERVER_ERROR` and say nothing.
 */
export function toSecureLinkHttpException(error: SecureLinkError): HttpException {
  return new NotFoundException({ code: error.code, message: error.message });
}
