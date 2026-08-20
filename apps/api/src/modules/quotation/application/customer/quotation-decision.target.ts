/**
 * The chain a customer decision is authorized along, re-walked **inside** the
 * deciding transaction (`APP6-B05` §6).
 *
 * ```text
 * secure token
 *   → ReauthorizeSecureGrant   (grant row locked; ACTIVE, unexpired, REQUEST_ACCESS)
 *   → grant.customerId, grant.customRequestId
 *   → custom_requests.current_quotation_id
 *   → quotations.current_version_id
 *   → the version the caller named — which must be that one
 * ```
 *
 * `APP6-B04` walks the same chain to *render* a quotation. This is not that walk
 * repeated for tidiness: the read's version of it produced a snapshot before any
 * transaction existed, and ADR-DB3-004 r9 requires a sensitive action to
 * establish its authority under its own transaction. What the read proved is
 * evidence that the caller was admitted; what this proves is that the write is
 * allowed to happen *now*.
 *
 * ### Every containment step is proved, none is assumed
 *
 * `findById` and `loadVersion` address their tables globally, so a pointer
 * naming a foreign row resolves perfectly well. Three separate facts are
 * therefore checked rather than inferred:
 *
 * ```text
 * quotation.customRequestId === grant.customRequestId    (G-DB7-04)
 * version.quotationId       === quotation.id             (G-DB7-03)
 * quotation.currentVersionId === the version named        (GRD-006, in the repository too)
 * ```
 *
 * ### The caller names a version, and that is the only thing it names
 *
 * The version id in the body is **not** a locator: the version it names is
 * required to be the one the two server-side pointers already reached. It is a
 * *fingerprint of what the customer was looking at*, and its whole job is to
 * fail when the customer was looking at something else. A caller cannot use it
 * to reach another quotation's version, because a foreign version fails the
 * comparison before anything is written.
 *
 * ### One answer for every definitive absence
 *
 * Missing request row, unset quotation pointer, unset version pointer, foreign
 * quotation, foreign version, dead grant — all leave as the same
 * `SECURE_LINK_UNAVAILABLE` a stranger's token produces. `QUOTE_VERSION_STALE`
 * is reserved for the one case where the chain resolved and the customer's
 * version simply is not the current one any more, because that is a fact the
 * caller has already earned the right to know.
 */
import { Inject, Injectable } from '@nestjs/common';

import { ReauthorizeSecureGrant } from '../../../customer/application/reauthorize-secure-grant.service';
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import type { SecureAccessGrant } from '../../../customer/domain/repositories/secure-access-grant.repository';
import {
  CUSTOM_REQUEST_QUOTATION_POINTER_PORT,
  type CustomRequestQuotationPointerPort,
} from '../../../order/domain/repositories/custom-request-quotation-pointer.port';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import {
  QUOTATION_REPOSITORY,
  type Quotation,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersion,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import {
  quotationDecisionError,
  type QuotationDecisionFailure,
} from '../../domain/decision/quotation-decision.errors';

/** What a decision is about, once the whole chain has been proved. */
export interface QuotationDecisionTarget {
  readonly grant: SecureAccessGrant;
  readonly quotation: Quotation;
  readonly version: QuotationVersion;
}

/** The credential and the version the customer is deciding on. Nothing else. */
export interface QuotationDecisionCommand {
  readonly token: string;
  readonly versionId: QuotationVersionId;
}

@Injectable()
export class QuotationDecisionTargetResolver {
  constructor(
    private readonly grants: ReauthorizeSecureGrant,
    @Inject(CUSTOM_REQUEST_QUOTATION_POINTER_PORT)
    private readonly requests: CustomRequestQuotationPointerPort,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
  ) {}

  /**
   * Walks the whole chain, or refuses.
   *
   * `notCurrentFailure` is the caller's, because the two decisions publish
   * different codes for the same fact and the difference is authority, not
   * taste. GRD-006 guards *acceptance*, so a version that is no longer current
   * is `QUOTE_VERSION_STALE` there — the customer must re-read and decide again
   * on a price that may have changed. `TR-LC12-06` has no GRD-006 and
   * `APP6-G01` §10 names `INVALID_TRANSITION` for a rejection the version's
   * state cannot start from, which is the same answer a repeat rejection gets.
   * Choosing one code here for both would publish an invented refusal on one of
   * the two surfaces.
   *
   * @requiresTransaction — the grant lock only means something inside one.
   */
  async resolve(
    command: QuotationDecisionCommand,
    now: Date,
    notCurrentFailure: QuotationDecisionFailure,
  ): Promise<QuotationDecisionTarget> {
    const grant = await this.grants.reauthorize(command.token, now);

    const requestId = grant.customRequestId as CustomRequestId;
    const pointer = await this.requests.findQuotationPointer(requestId);
    if (pointer?.currentQuotationId === undefined) {
      throw secureLinkUnavailable();
    }

    const quotation = await this.quotations.findById(pointer.currentQuotationId as QuotationId);
    if (
      quotation === undefined ||
      quotation.customRequestId !== requestId ||
      quotation.currentVersionId === undefined
    ) {
      throw secureLinkUnavailable();
    }

    const version = await this.quotations.loadVersion(quotation.currentVersionId);
    if (version === undefined || version.quotationId !== quotation.id) {
      throw secureLinkUnavailable();
    }

    if (version.id !== command.versionId) {
      // The chain resolved and this grant does open this quotation — the
      // customer is simply deciding on a version that is no longer the offer.
      // For acceptance this is the CC-05 refusal seen from outside the
      // repository, which re-proves it under the row lock where it is
      // authoritative; for rejection it is the same statement LC-12 makes about
      // a version a rejection cannot start from.
      throw quotationDecisionError(notCurrentFailure);
    }

    return { grant, quotation, version };
  }
}
