/**
 * The chain a customer design decision is authorized along, re-walked **inside**
 * the deciding transaction (`APP6-B11` §6, §7, §9).
 *
 * ```text
 * secure token
 *   → ReauthorizeSecureGrant   (grant row locked; ACTIVE, unexpired, REQUEST_ACCESS)
 *   → grant.customerId, grant.customRequestId
 *   → custom_requests row LOCKED, with current_design_case_id
 *   → that Design Case, proving it names the request back
 *   → the exact version the caller named, LOCKED, proving it belongs to that case
 * ```
 *
 * `APP6-B10` walks almost the same chain to *render* the review. This is not
 * that walk repeated for tidiness: the read's version of it produced a snapshot
 * before any transaction existed, and ADR-DB3-004 r9 requires a sensitive action
 * to establish its authority under its own transaction. What the read proved is
 * that the caller was admitted; what this proves is that the write is allowed to
 * happen *now*. It is also why CC-16 works — a revoke that commits between the
 * read and the decision is seen here, under the grant's own row lock, and
 * nowhere else.
 *
 * ### The lock order is the phase's, and it is not negotiable
 *
 * ```text
 * secure_access_grants  →  custom_requests  →  design_versions
 * ```
 *
 * `APP6-B05` takes grant then request; `APP6-B03`, `APP6-B08` and `APP6-B09` all
 * take request before the row they are writing. Both decisions here take all
 * three in that order, so an approval and a revision request racing on one
 * version queue behind the request row rather than deadlocking on it, and
 * neither can invert against a concurrent send. There is no process-local mutex
 * anywhere on this path and there must not be: one would be silent about the
 * second API replica.
 *
 * ### The active review is not the current-version pointer, and is not re-queried
 *
 * `APP6-B10` established that `design_cases.current_version_id` means *newest
 * authored draft* and is never review-selection authority. This class does not
 * read it, and {@link CustomRequestDesignContextPort} does not expose it.
 *
 * Nor does it call `findVersionInReview` a second time. It does not need to:
 * `uq_design_versions__case__sent_for_review` permits at most one
 * `SENT_FOR_REVIEW` version per case (G-DB7-15 / GRD-004), so *"belongs to this
 * case"* plus *"is `SENT_FOR_REVIEW`"* — both proved on the locked row — is
 * exactly the statement *"is this case's one active review"*. A second query
 * would be a second authority for a fact the index already decides, and it would
 * read outside the lock this class just took.
 *
 * That status test is deliberately **not** made here. The two decisions publish
 * different codes for the same row state and the difference is authority, not
 * taste: GRD-007 guards approval, so a version that is not approval-eligible is
 * `APPROVAL_VERSION_MISMATCH` there, while `TR-LC08-03` carries no GRD-007 and
 * `APP6-G01` §11 names `INVALID_TRANSITION` for the CC-04 loser. Choosing one
 * code here for both would publish an invented refusal on one of the two
 * surfaces — the mistake `QuotationDecisionTargetResolver` records avoiding.
 *
 * ### One answer for every definitive absence
 *
 * A dead grant, a missing request row, an unset case pointer, a case that
 * resolves but belongs to another request, a version id that names no row, and a
 * version that belongs to another case — all leave as the same
 * `SECURE_LINK_UNAVAILABLE` a stranger's token produces. There is no
 * `DESIGN_CASE_UNRESOLVED` and no `DESIGN_VERSION_NOT_FOUND` on this surface:
 * a foreign version id must not be able to confirm that a version exists
 * somewhere else, and the finer answer would be an enumeration oracle for
 * another customer's artwork.
 */
import { Inject, Injectable } from '@nestjs/common';

import { ReauthorizeSecureGrant } from '../../../customer/application/reauthorize-secure-grant.service';
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import type { SecureAccessGrant } from '../../../customer/domain/repositories/secure-access-grant.repository';
import {
  CUSTOM_REQUEST_DESIGN_CONTEXT_PORT,
  type CustomRequestDesignContext,
  type CustomRequestDesignContextPort,
} from '../../../order/domain/repositories/custom-request-design-context.port';
import type { CustomRequestId } from '../../../order/domain/repositories/custom-request.repository';
import {
  DESIGN_CASE_REPOSITORY,
  type DesignCase,
  type DesignCaseId,
  type DesignCaseRepository,
  type DesignVersion,
  type DesignVersionId,
} from '../../domain/repositories/design-case.repository';

/** What a decision is about, once the whole chain has been proved under lock. */
export interface DesignDecisionTarget {
  readonly grant: SecureAccessGrant;
  readonly request: CustomRequestDesignContext;
  readonly designCase: DesignCase;
  readonly version: DesignVersion;
}

/** The credential and the exact version the customer is deciding on. */
export interface DesignDecisionCommand {
  readonly token: string;
  readonly versionId: DesignVersionId;
}

@Injectable()
export class DesignDecisionTargetResolver {
  constructor(
    private readonly grants: ReauthorizeSecureGrant,
    @Inject(CUSTOM_REQUEST_DESIGN_CONTEXT_PORT)
    private readonly requests: CustomRequestDesignContextPort,
    @Inject(DESIGN_CASE_REPOSITORY) private readonly cases: DesignCaseRepository,
  ) {}

  /**
   * Walks and locks the whole chain, or refuses identically.
   *
   * @requiresTransaction — all three locks only mean something inside one.
   */
  async resolve(command: DesignDecisionCommand, now: Date): Promise<DesignDecisionTarget> {
    // CC-16. The grant is re-established under its own row lock, so a revoke
    // that committed first wins and a revoke racing this one waits: either way
    // the decision below acts on a grant that is live at the instant it
    // commits, not one that was live when the page was rendered.
    const grant = await this.grants.reauthorize(command.token, now);

    const requestId = grant.customRequestId as CustomRequestId;
    // Locked, not merely read. The approval judges `DESIGN_REVIEW → APPROVED`
    // against this status and then projects `TR-LC11-09` onto the same row; an
    // unlocked read would be a decision made about a value that may already have
    // changed. The revision request takes the same lock without judging the
    // status, so the two decisions serialise against each other on the row CC-04
    // contends for rather than discovering each other at the version.
    const request = await this.requests.lockDesignContext(requestId);
    if (request === undefined || request.currentDesignCaseId === undefined) {
      // A grant whose request row is gone is a repository invariant failure, not
      // a state; a request with no design case has simply never been designed
      // for. Both are answered as an unusable link rather than as a diagnostic,
      // because "the workshop has not started your design" is a fact about a
      // stranger's order.
      throw secureLinkUnavailable();
    }

    const designCase = await this.cases.findById(request.currentDesignCaseId as DesignCaseId);
    // The pointer resolved, and the row it named names this request back.
    // G-DB7-09 checked rather than assumed: `findById` addresses the table
    // globally, so a dangling or re-pointed pointer would otherwise let one
    // request's decision land on another customer's design.
    if (designCase === undefined || designCase.customRequestId !== requestId) {
      throw secureLinkUnavailable();
    }

    // The exact version the caller named — never "the latest", never
    // `max(version)`, never the case pointer. `lockVersion` addresses the
    // versions table globally, so the containment test below is what stops one
    // customer's link from deciding another's artwork, and its failure is the
    // same answer a missing row gets.
    const version = await this.cases.lockVersion(command.versionId);
    if (version === undefined || version.designCaseId !== designCase.id) {
      throw secureLinkUnavailable();
    }

    return { grant, request, designCase, version };
  }
}
