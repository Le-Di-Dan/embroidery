/**
 * The three browser-side calls `/truy-cap/duyet-thiet-ke` makes (`APP6-S02`
 * §4, §22).
 *
 * One generated operation each, the repository's own Axios instance, and no URL
 * anywhere in this feature — a route rename arrives as a regenerated client
 * rather than as a 404 nobody notices.
 *
 * ### Why the read is not chained onto `publicSecureLinkResolve`
 *
 * `APP6-B10` performs the whole authorization chain itself — policy, the
 * secure-link limiter, grant resolution, the request the grant names, the
 * request's own current design case, then the exact `SENT_FOR_REVIEW` version.
 * Resolving the link first and reading second would authorize the same token
 * twice, spend the same abuse budget twice, and keep the raw credential alive
 * across two flights for a request id this feature never needs and must never
 * display. This is the ruling `APP5-S02` and `APP6-S01` already made.
 *
 * ### The credential's whole visible life, in this file
 *
 * It arrives as an argument, is placed in a request body, and is gone when the
 * promise settles. No module-level variable holds it, nothing logs it, and none
 * of the three responses echoes it, so there is nothing to strip on the way
 * back. Each body is built through its generated body type rather than an
 * object literal, so a token cannot land in the wrong field and still compile —
 * and neither can a document hash reach the revision request, which publishes
 * no field for one.
 *
 * ### Why the exact facts are parameters and are not read from anywhere
 *
 * Both decisions name the exact version the customer was shown, and the
 * approval additionally names the exact stored document hash and the exact
 * agreement set. Taking them as arguments means this module has no notion of
 * "the current review" to fall back on: the caller must pass what B10 returned
 * and the customer consented to, and `APP6-B11` re-proves every one of them
 * inside its own transaction.
 */
import {
  publicDesignReviewApprove,
  publicDesignReviewCurrent,
  publicDesignReviewRequestRevision,
  type ApproveDesignVersionBody,
  type CustomerDesignReviewResponse,
  type DesignApprovedResponse,
  type DesignRevisionRequestedResponse,
  type ReadCurrentDesignReviewBody,
  type RequestDesignRevisionBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

/** The exact agreement identities an approval submits. Ids and hashes only. */
export interface AcceptedAgreementBody {
  readonly agreementVersionId: string;
  readonly contentHash: string;
}

/**
 * Exchanges a secure-link token for the design version awaiting review now.
 *
 * The read requires no step-up, consumes nothing and writes nothing, which is
 * why it is safe to offer as a manual retry after a transport failure and safe
 * to repeat as the single reconciliation re-read (§13, §14, §15, §19).
 */
export async function readCurrentDesignReview(
  token: string,
): Promise<CustomerDesignReviewResponse> {
  const requestBody: ReadCurrentDesignReviewBody = { token };
  const body = await publicDesignReviewCurrent(requestBody, { instance: getBrowserApiClient() });
  return body.data;
}

/**
 * Commits approval of one exact version, on one exact document, under one exact
 * agreement set.
 *
 * Approving twice replays the first approval and writes nothing, so the
 * `replayed` flag on the result is an outcome to report honestly rather than a
 * failure to hide (§16, §17).
 */
export async function approveDesignVersion(
  token: string,
  versionId: string,
  documentHash: string,
  acceptedAgreements: readonly AcceptedAgreementBody[],
): Promise<DesignApprovedResponse> {
  const requestBody: ApproveDesignVersionBody = {
    token,
    versionId,
    documentHash,
    acceptedAgreements: acceptedAgreements.map((agreement) => ({
      agreementVersionId: agreement.agreementVersionId,
      contentHash: agreement.contentHash,
    })),
  };
  const body = await publicDesignReviewApprove(requestBody, { instance: getBrowserApiClient() });
  return body.data;
}

/**
 * Asks for a revision of one exact version.
 *
 * No hash and no agreements: `RequestDesignRevisionBody` is `additionalProperties:
 * false` and declares neither, so the shape itself is what keeps a revision
 * request from carrying consent it never asked for. Feedback is sent trimmed,
 * as the customer's own words.
 */
export async function requestDesignRevision(
  token: string,
  versionId: string,
  feedback: string,
): Promise<DesignRevisionRequestedResponse> {
  const requestBody: RequestDesignRevisionBody = { token, versionId, feedback: feedback.trim() };
  const body = await publicDesignReviewRequestRevision(requestBody, {
    instance: getBrowserApiClient(),
  });
  return body.data;
}
