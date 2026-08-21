/**
 * `TR-LC08-03` — the customer asking for a revision of the exact design they
 * were shown (`APP6-B11` §8, §14, §15).
 *
 * ### One transaction, or nothing
 *
 * ```text
 * authorize the secure link      (before the transaction: policy, abuse budget, digest)
 * begin
 *   re-establish the grant under its row lock                      (GRD-002)
 *   lock the request row, resolve its own design case, lock the exact version
 *   require the version still SENT_FOR_REVIEW                      (CC-04, first decision wins)
 *   record the REQUEST_REVISION decision with the customer's feedback
 *   append the audit row and the SE-004 design.revision-requested event
 * commit
 * ```
 *
 * ### No step-up, and the absence is structural
 *
 * `TR-LC08-03` lists **GRD-002 only** (`DB3_LIFECYCLE_SPECIFICATIONS.md`, and
 * `APP6-G01` §7's table says so directly: *"Request revision — required grant,
 * no step-up"*). So this class does not inject `StepUpEvidenceResolver`, does not
 * read a challenge, creates none, consumes none, and can never answer
 * `REVERIFICATION_REQUIRED` — the code is not reachable from any statement
 * below. Importing the capability "for symmetry" with the approval is exactly
 * what `APP6-B11` §8 forbids: a customer asking for a change to their own
 * unfinished design commits nothing, and making them re-verify to say "please
 * move the logo left" is friction the authority declined to impose.
 *
 * `design_reviews.step_up_challenge_id` is nullable for this row and stays NULL.
 *
 * ### The request does not move
 *
 * There is no `CUSTOM_REQUEST_REPOSITORY` in this class and no `transition()`
 * call anywhere below. `APP6-B11` §15 is explicit: the request stays in
 * `DESIGN_REVIEW`. There is no `DESIGN_REVIEW → DESIGN_REVIEW` self-transition —
 * LC-11 has no self-edge and one would claim a move that did not happen — and no
 * backward move to `DIGITIZING`, which would rewrite the lifecycle to describe
 * work the workshop has not started. The request row *is* locked, through the
 * shared target resolver, so this decision and a concurrent approval serialise
 * on the same row in the same order; it is locked to order the race, never to be
 * written.
 *
 * ### No next draft is created here
 *
 * `APP6-B08` owns revision authoring. What this commits is the customer's
 * decision and the alert that carries it; the workshop then authors a new
 * version, and `TR-LC08-05` supersedes this one at *its* send, not at this
 * one's. Creating a DRAFT here would author a design nobody has looked at, in a
 * transaction with no operator behind it.
 *
 * ### Naturally idempotent, with no namespace
 *
 * `APP6-G01` §10 dispositions this action as *"natural, not a namespace"*: one
 * decision per version, and a second decision on a decided version loses to
 * CC-04 and returns `INVALID_TRANSITION`. So there is no `IdempotencyStore`
 * here, no claim and no replay — the version's own state is the record, and a
 * repeat is refused rather than duplicated.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import {
  DESIGN_CASE_REPOSITORY,
  type DesignCaseRepository,
  type DesignVersionId,
} from '../../domain/repositories/design-case.repository';
import { isDecidableVersionState } from '../../domain/review/design-decision-eligibility';
import { designDecisionError } from '../../domain/review/design-decision.errors';
import { DesignDecisionRecorder } from './design-decision.recorder';
import { DesignDecisionTargetResolver } from './design-decision.target';
import type { DesignRevisionRequestedView } from './design-decision.view';

/** The whole input: a credential, the exact design, and what the customer wants. */
export interface RequestDesignRevisionCommand {
  readonly token: string;
  readonly versionId: DesignVersionId;
  /**
   * The customer's own words, required.
   *
   * LC-09 records the outcome as `REQUEST_REVISION` **(+feedback)**, and the
   * reason it is required here rather than merely permitted is operational: a
   * revision request with no text tells the workshop that something is wrong and
   * nothing about what, so the next version is a guess and the customer is asked
   * to review it again. `design_reviews.feedback` is nullable in the schema
   * because an APPROVE row legitimately has none; this path is the one that
   * fills it.
   */
  readonly feedback: string;
}

/** The persistence guard codes this use case translates. */
const DESIGN_VERSION_NOT_IN_REVIEW = 'DESIGN_VERSION_NOT_IN_REVIEW';

@Injectable()
export class RequestDesignRevisionUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly targets: DesignDecisionTargetResolver,
    @Inject(DESIGN_CASE_REPOSITORY) private readonly cases: DesignCaseRepository,
    private readonly recorder: DesignDecisionRecorder,
    private readonly clock: AuditClock,
  ) {}

  async requestRevision(
    command: RequestDesignRevisionCommand,
  ): Promise<DesignRevisionRequestedView> {
    try {
      return await this.transactions.runInTransaction(async () => {
        const now = this.clock.now();
        const target = await this.targets.resolve(command, now);
        const { version } = target;

        // CC-04, in this process. The repository's conditional `UPDATE` re-proves
        // it under the row lock this transaction already holds, so a decision
        // that raced past this line still loses there — this only makes the
        // refusal legible. Every ineligible state is one answer on this surface:
        // `TR-LC08-03` carries no GRD-007, so there is no
        // `APPROVAL_VERSION_MISMATCH` for it to publish.
        if (!isDecidableVersionState(version.status)) {
          throw designDecisionError('INVALID_TRANSITION');
        }

        const decided = await this.cases.recordReview({
          designVersionId: version.id,
          outcome: 'REQUEST_REVISION',
          feedback: command.feedback,
          customerId: target.grant.customerId,
          grantId: target.grant.id,
          // Deliberately absent. GRD-003 does not guard this transition, and a
          // challenge id here would be evidence of a verification that was never
          // required and never performed.
          decidedAt: now,
        });

        await this.recorder.recordRevisionRequest({
          designVersionId: decided.id,
          designCaseId: target.designCase.id,
          customRequestId: target.request.requestId,
          version: decided.version,
          customerId: target.grant.customerId,
          grantId: target.grant.id,
          decidedAt: now,
        });

        return {
          versionId: decided.id,
          version: decided.version,
          // Read back off the row this transaction wrote, not echoed from a
          // constant this code chose.
          versionStatus: decided.status,
          // The status as it was read under the lock, and as it still is: this
          // transaction wrote no transition and moved nothing.
          requestStatus: target.request.status,
          decidedAt: now,
        };
      });
    } catch (error: unknown) {
      throw this.classify(error);
    }
  }

  /**
   * Translates the one persistence verdict this use case owns.
   *
   * Everything else travels as itself to the platform filter, which sanitises
   * it. `DESIGN_VERSION_NOT_IN_REVIEW` is CC-04 arriving at the row rather than
   * at the pre-check: a competing approval that committed between the two loses
   * this statement's conditional `UPDATE`, and the customer is told the decision
   * has already been made.
   */
  private classify(error: unknown): unknown {
    if (isPersistenceError(error) && error.code === DESIGN_VERSION_NOT_IN_REVIEW) {
      return designDecisionError('INVALID_TRANSITION');
    }
    return error;
  }
}
