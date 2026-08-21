/**
 * `TR-LC08-04` — the customer approving the exact design they were shown
 * (`APP6-B11`).
 *
 * ### One transaction, or nothing
 *
 * ```text
 * authorize the secure link      (before the transaction: policy, abuse budget, digest)
 * begin
 *   re-establish the grant under its row lock                      (CC-16, ADR-DB3-004 r9)
 *   lock the request row, resolve its own design case, lock the exact version
 *     -> every containment proved; any failure is one 404
 *   GRD-007 half one: submitted document hash == stored hash
 *   claim design.approve on this exact version
 *     replay? -> return the committed Approval Snapshot, write nothing
 *   GRD-007 half two: the version is still SENT_FOR_REVIEW               (CC-02, CC-04)
 *   require the request still DESIGN_REVIEW and the LC-11 move legal
 *   require a fresh STEP_UP for this customer                            (GRD-003)
 *   GRD-008: re-resolve the effective agreement set and require it exactly
 *   record the APPROVE review decision; the version moves to APPROVED
 *   freeze the Approval Snapshot from the exact version, with its children
 *   project TR-LC11-09 DESIGN_REVIEW -> APPROVED with a system actor
 *   append the critical approval audit row and the SE-005 design.approved event
 *   complete the idempotency claim with the replayable result
 * commit
 * ```
 *
 * There is no `try`/`catch` inside the transaction that could let a subset
 * commit, and no compensation path: a failure anywhere leaves the version
 * `SENT_FOR_REVIEW`, no review row, no snapshot, no agreement acceptance, the
 * request still `DESIGN_REVIEW`, no transition row, no audit row, no event and
 * no completed idempotency record. `APP6-B11` §25 forbids compensation precisely
 * because a compensating write would be a second chance for half of this to
 * survive.
 *
 * ### The customer approves a design, never a request state
 *
 * {@link ApproveDesignVersionCommand} carries a credential, a version id, a
 * document hash and the terms evidence. There is no target status, no actor, no
 * timestamp, no customer id, no case id, no request id and no challenge id — so
 * there is no field through which a caller could ask for `APPROVED`. The LC-11
 * transition below is appended with a **system** actor because the approval
 * committed, not because anyone asked for it (`APP6-G01` §4.1, `TR-LC11-09`
 * "system (approval)").
 *
 * ### Where APP6 stops
 *
 * No order, no order item, no payment obligation, no payment attempt, no
 * inventory reservation, no soft hold, no production job and no machine file.
 * ADR-DB3-001 r7 places all of it in APP7 behind GRD-009, none of those modules
 * is imported, and none is reachable from this module's injector. The hand-off
 * is one outbox row and this transaction ends.
 */
import { Inject, Injectable } from '@nestjs/common';
import { newId } from '@embroidery/database';
import { IdempotencyStore, TransactionManager, type IdempotencyKey } from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { StepUpEvidenceResolver } from '../../../customer/application/step-up-evidence.resolver';
import type { CustomerId } from '../../../customer/domain/repositories/customer.repository';
import { isLegalRequestTransition } from '../../../order/domain/lifecycle/request-transitions';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import {
  APPROVAL_SNAPSHOT_REPOSITORY,
  type ApprovalSnapshotId,
  type ApprovalSnapshotRepository,
} from '../../domain/repositories/approval-snapshot.repository';
import {
  DESIGN_CASE_REPOSITORY,
  type DesignCaseRepository,
  type DesignVersionId,
} from '../../domain/repositories/design-case.repository';
import {
  DESIGN_APPROVE_IDEMPOTENCY_TTL_MS,
  DESIGN_APPROVE_NAMESPACE,
  approveFingerprint,
  type AcceptedTermsEvidence,
} from '../../domain/review/design-approve-idempotency';
import {
  approvalRefusalFor,
  isDecidableVersionState,
} from '../../domain/review/design-decision-eligibility';
import { designDecisionError } from '../../domain/review/design-decision.errors';
import { AcceptedTermsAuthority } from './accepted-terms.authority';
import { classifyApprovalFailure } from './approval-failure.classifier';
import { ApprovalEvidenceResolver } from './approval-evidence.resolver';
import { replayApprovedView, toApprovedView, type ApprovalResult } from './approval-result';
import { DesignDecisionRecorder } from './design-decision.recorder';
import { DesignDecisionTargetResolver, type DesignDecisionTarget } from './design-decision.target';
import type { DesignApprovedView } from './design-decision.view';

/** The whole input: a credential, the exact design, and what was agreed to. */
export interface ApproveDesignVersionCommand {
  readonly token: string;
  readonly versionId: DesignVersionId;
  /** The hash `APP6-B10` showed — a fingerprint of what the customer saw. */
  readonly documentHash: string;
  readonly acceptedAgreements: readonly AcceptedTermsEvidence[];
}

/** `TR-LC11-09`'s system actor (`APP6-G01` §4.1). */
const APPROVE_JOB_KEY = DESIGN_APPROVE_NAMESPACE;
/** The state `APPROVED` may be reached from, and the state it is. */
const DESIGN_REVIEW = 'DESIGN_REVIEW';
const APPROVED = 'APPROVED';

@Injectable()
export class ApproveDesignVersionUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly idempotency: IdempotencyStore,
    private readonly targets: DesignDecisionTargetResolver,
    private readonly stepUp: StepUpEvidenceResolver,
    private readonly terms: AcceptedTermsAuthority,
    private readonly evidence: ApprovalEvidenceResolver,
    @Inject(DESIGN_CASE_REPOSITORY) private readonly cases: DesignCaseRepository,
    @Inject(APPROVAL_SNAPSHOT_REPOSITORY) private readonly approvals: ApprovalSnapshotRepository,
    @Inject(CUSTOM_REQUEST_REPOSITORY) private readonly requests: CustomRequestRepository,
    private readonly recorder: DesignDecisionRecorder,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  async approve(command: ApproveDesignVersionCommand): Promise<DesignApprovedView> {
    const correlationId = this.requestContext.requireRequestId();
    try {
      return await this.transactions.runInTransaction(async () => {
        const now = this.clock.now();
        const target = await this.targets.resolve(command, now);
        const { version } = target;

        // GRD-007, first half, and deliberately **before** the claim. The stored
        // hash is frozen for the life of the row (CST-090 excepts only the
        // lifecycle columns), so this test gives the same answer whether the
        // version is still in review or already approved — which is what lets a
        // genuine duplicate reach the replay below while a submission quoting
        // the wrong artwork is refused without ever claiming the scope.
        if (version.documentHash === undefined || version.documentHash !== command.documentHash) {
          throw designDecisionError('APPROVAL_VERSION_MISMATCH');
        }

        const key = this.keyFor(command, version.documentHash);
        const claim = await this.idempotency.claim(
          key,
          new Date(now.getTime() + DESIGN_APPROVE_IDEMPOTENCY_TTL_MS),
        );
        if (claim.outcome === 'replay') {
          // Written in the same transaction as the snapshot, so it cannot exist
          // unless that snapshot does. Nothing below runs: no second review, no
          // second snapshot, no second acceptance row, no second transition, no
          // second audit row and no second event.
          //
          // Checked **before** GRD-003, on the `APP6-B05` precedent: a replay
          // performs no write, and gating it on a still-open step-up window
          // would tell a customer retrying an hour after a dropped response to
          // re-verify in order to be shown a decision they already made. It
          // discloses nothing new either — `APP6-B10` already answers the same
          // holder of the same live grant.
          return replayApprovedView(claim.result);
        }
        if (claim.outcome === 'in_progress') {
          throw designDecisionError('DUPLICATE_OPERATION');
        }

        // GRD-007, second half, on the **locked** row. This is CC-02 and CC-04
        // in one statement: a version superseded by something newer, and a
        // version another decision already committed, both fail here — with
        // different codes, because they are different facts (see
        // `design-decision-eligibility.ts`).
        if (!isDecidableVersionState(version.status)) {
          throw designDecisionError(approvalRefusalFor(version.status));
        }

        // The request row is already locked by the target resolver, so this
        // judges the state this transaction will still see when it projects
        // `TR-LC11-09` a few statements later.
        if (
          target.request.status !== DESIGN_REVIEW ||
          !isLegalRequestTransition(target.request.status, APPROVED)
        ) {
          throw designDecisionError('INVALID_TRANSITION');
        }

        // GRD-003, and the first thing between this caller and a write. The
        // evidence is derived from the grant's customer — no challenge id is
        // accepted from the body — so a caller cannot present someone else's
        // proof of presence, a challenge for another purpose, or a stale one.
        const stepUpEvidence = await this.stepUp.resolve(
          target.grant.customerId as CustomerId,
          now,
        );
        if (stepUpEvidence === undefined) {
          throw designDecisionError('REVERIFICATION_REQUIRED');
        }

        // GRD-008, re-resolved from persistence at this instant rather than
        // trusted from B10's earlier read. If the terms changed since the
        // customer read them, this refuses; it never substitutes.
        const acceptances = await this.terms.requireExactAcceptance(command.acceptedAgreements);

        return await this.commitApproval({
          target,
          key,
          now,
          correlationId,
          stepUpChallengeId: stepUpEvidence.challengeId,
          acceptances,
        });
      });
    } catch (error: unknown) {
      throw classifyApprovalFailure(error);
    }
  }

  /** Everything after the last guard: six writes, in one order, no branches. */
  private async commitApproval(input: {
    readonly target: DesignDecisionTarget;
    readonly key: IdempotencyKey;
    readonly now: Date;
    readonly correlationId: string;
    readonly stepUpChallengeId: string;
    readonly acceptances: readonly {
      readonly agreementVersionId: string;
      readonly agreementType: string;
      readonly contentHash: string;
    }[];
  }): Promise<DesignApprovedView> {
    const { target, now, acceptances } = input;
    const version = target.version;
    const customerId = target.grant.customerId;

    // Assembled before any write, so an unresolvable label refuses on a clean
    // transaction rather than after the version has already moved.
    const evidence = await this.evidence.resolve(
      version,
      target.request.requestId as CustomRequestId,
      customerId,
    );

    // `TR-LC08-04`'s decision record. The repository guards the move on
    // `SENT_FOR_REVIEW`, which is what makes first-decision-wins true under the
    // row lock rather than only in this process.
    const decided = await this.cases.recordReview({
      designVersionId: version.id,
      outcome: 'APPROVE',
      customerId,
      grantId: target.grant.id,
      // GRD-003's evidence FK, carried onto the review row because
      // `design_reviews.step_up_challenge_id` exists for exactly this outcome.
      stepUpChallengeId: input.stepUpChallengeId,
      decidedAt: now,
    });

    const snapshotId = newId() as ApprovalSnapshotId;
    const snapshot = await this.approvals.createFromVersion({
      id: snapshotId,
      designVersionId: version.id,
      // Re-proved a third time, inside the repository, against the row it locks
      // itself. Redundant with the check above by construction and kept because
      // this row is what authorises production: G-DB7-14 is enforced where the
      // insert happens, not only where the caller remembered to look.
      submittedDocumentHash: version.documentHash as string,
      customerId,
      grantId: target.grant.id,
      stepUpChallengeId: input.stepUpChallengeId,
      productName: evidence.productName,
      variantLabel: evidence.variantLabel,
      sideName: evidence.sideName,
      areaName: evidence.areaName,
      quantityTotal: evidence.quantityTotal,
      contactName: evidence.contactName,
      contactEmail: evidence.contactEmail,
      contactPhone: evidence.contactPhone,
      threadColors: evidence.threadColors,
      agreementAcceptances: acceptances,
      approvedAt: now,
    });

    const transitioned = await this.requests.transition({
      id: target.request.requestId as CustomRequestId,
      to: APPROVED,
      // Not the customer. `TR-LC11-09`'s actor is the system, because the move
      // is a consequence of this transaction committing rather than a command
      // anyone issued.
      actor: { kind: 'SYSTEM', systemJobKey: APPROVE_JOB_KEY },
      correlationId: input.correlationId,
      expectedFrom: target.request.status,
    });

    await this.recorder.recordApproval({
      approvalSnapshotId: snapshot.id,
      designVersionId: version.id,
      designCaseId: target.designCase.id,
      customRequestId: target.request.requestId,
      version: decided.version,
      branch: version.placement.branch,
      documentHash: snapshot.documentHash,
      customerId,
      grantId: target.grant.id,
      stepUpChallengeId: input.stepUpChallengeId,
      acceptedAgreements: acceptances,
      quantityTotal: evidence.quantityTotal,
      requestTransitioned: true,
      approvedAt: now,
    });

    const result: ApprovalResult = {
      versionId: decided.id,
      version: decided.version,
      // Read back off the rows this transaction wrote rather than echoed from
      // the constants above: reporting what this code believes it wrote is how a
      // response starts disagreeing with the row.
      versionStatus: decided.status,
      approvalSnapshotId: snapshot.id,
      documentHash: snapshot.documentHash,
      requestStatus: transitioned.status,
      approvedAt: now.toISOString(),
    };
    await this.idempotency.complete(input.key, result);
    return { ...toApprovedView(result), replayed: false };
  }

  /** `APP6-G01` §10's binding, built from the frozen row this transaction locked. */
  private keyFor(command: ApproveDesignVersionCommand, storedHash: string): IdempotencyKey {
    return {
      namespace: DESIGN_APPROVE_NAMESPACE,
      scopeKey: command.versionId,
      fingerprint: approveFingerprint({
        versionId: command.versionId,
        documentHash: storedHash,
        acceptedAgreements: command.acceptedAgreements,
      }),
    };
  }

}
