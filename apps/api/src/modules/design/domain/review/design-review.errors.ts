/**
 * The two refusal vocabularies of the customer design review read
 * (`APP6-B10` §15, §16).
 *
 * ### One is silent, the other is honest
 *
 * Everything that means *"this credential cannot obtain a current review
 * target"* reuses `APP4-B06`'s `SECURE_LINK_UNAVAILABLE` verbatim — an unknown,
 * expired, revoked or superseded grant, a wrong scope, an unreadable request, a
 * dangling or foreign Design Case pointer, no active review, and an active
 * review that belongs to another request. There is deliberately no
 * `DESIGN_CASE_UNRESOLVED`, no `DESIGN_VERSION_NOT_FOUND` and no
 * `REVIEW_ALREADY_ACTIVE` on this surface: each finer answer is a free oracle
 * about someone else's order, and "the workshop has not sent your design yet" is
 * a fact about a stranger's progress. That code is not redefined here; the
 * existing `secureLinkUnavailable()` is thrown, so there is exactly one place it
 * can ever be constructed.
 *
 * What must **not** collapse into it is a genuine configuration or service
 * failure. A deployment whose `design_approval.agreements` key was never
 * published, or whose required agreement content is missing, has a working link
 * and a real review to show — reporting `404 SECURE_LINK_UNAVAILABLE` would tell
 * the customer their link is dead, tell support to reissue a grant that is
 * perfectly live, and hide the one thing an operator can actually fix. So this
 * file adds one bounded server-side answer and nothing else.
 *
 * ### The 503 names no policy key and no agreement type
 *
 * Same rule as `secureLinkPolicyUnavailableResponse()`, for the same reason: the
 * parse reasons name fields and bounds, which is useful to an operator and
 * useless to a public caller, and the operator-facing signal is the key's own
 * state in `policy_configurations` and the agreement's in `agreements`, both
 * directly inspectable. One message string, and it is a constant.
 */
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A review that cannot be shown with a complete, approval-ready set of terms.
 *
 * Thrown for: the required-type policy missing or malformed, a required type
 * with no effective version, a required type with more than one, and an
 * effective version whose content or hash is unusable. All four are the same
 * class of defect — the deployment cannot state what a customer would be
 * agreeing to — and `APP6-B10` §15 requires every one of them to fail closed
 * rather than return a partial set the customer might approve against.
 */
export class DesignReviewTermsUnavailableError extends Error {
  constructor() {
    super('DESIGN_REVIEW_TERMS_UNAVAILABLE');
    this.name = 'DesignReviewTermsUnavailableError';
  }
}

export function isDesignReviewTermsUnavailable(
  error: unknown,
): error is DesignReviewTermsUnavailableError {
  return error instanceof DesignReviewTermsUnavailableError;
}

/** The public answer to an incompletely configured approval surface. */
export function designReviewTermsUnavailableResponse(): HttpException {
  return new HttpException(
    { message: 'Design review is temporarily unavailable.' },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
