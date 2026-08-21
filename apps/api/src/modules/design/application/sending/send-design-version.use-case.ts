/**
 * `TR-LC08-02` — sending one exact formal Design Version for review
 * (`APP6-B09`).
 *
 * ### One transaction, or nothing
 *
 * ```text
 * begin
 *   lock the request row, read its design context      (status + case pointer + branch subject)
 *   resolve current_design_case_id, prove the case names the request back
 *   lock the exact version, prove it belongs to that case
 *   replay?  -> return the committed facts, write nothing
 *   require DRAFT
 *   GRD-004 preflight: no other version of the case in review
 *   judge the request state against the send rule
 *   re-establish branch / placement / geometry freeze invariants
 *   canonicalize the persisted document and hash it
 *   DRAFT -> SENT_FOR_REVIEW with the hash and the send instant
 *   TR-LC08-05: mark legitimate REVISION_REQUESTED predecessors SUPERSEDED
 *   project TR-LC11-08 DIGITIZING -> DESIGN_REVIEW      (system actor, only from DIGITIZING)
 *   append the design_version.sent audit row and the SE-004 outbox event
 * commit
 * ```
 *
 * Every one of those writes is in the same transaction and there is no
 * `try`/`catch` inside it that could let a subset commit. A failure anywhere
 * leaves the version a `DRAFT` with no hash and no `sent_at`, every predecessor
 * exactly as it was, the case pointer unmoved, the request in the state it was
 * in with no transition row, no audit row, and no event announcing a design the
 * customer will never be shown.
 *
 * ### The Admin commands a send, never a status
 *
 * `APP6-G01` §4.1 and LC-11 `TR-LC11-08` reach `DESIGN_REVIEW` **only** as a
 * projection of the owning aggregate's committed event. The command type below
 * carries two identifiers and nothing else — no target state, no actor, no
 * timestamp, no hash, no placement — so there is no field through which a caller
 * could ask for `DESIGN_REVIEW`, and the transition is appended by this code
 * with a **system** actor because the send committed, not because anyone asked.
 * `APP5-B05`'s Admin transition allow-list is untouched by this checkpoint.
 *
 * ### Why the request row is locked first
 *
 * The eligibility decision and every write must see one request state, and the
 * order — request, then version — is the whole phase's, matching `APP6-B03`,
 * `APP6-B05` and `APP6-B08`. It also serialises two operators sending different
 * versions of one case, which is what makes the loser's GRD-004 refusal a clean
 * `REVIEW_ALREADY_ACTIVE` instead of a driver error. The partial unique index
 * `uq_design_versions__case__sent_for_review` remains the *arbiter*: it is
 * mapped narrowly below, so correctness does not depend on this process having
 * looked first.
 *
 * ### Nothing is rendered, issued or rewritten
 *
 * No raster, no derivative, no preview: `preview_derivative_id` and
 * `preview_hash` stay NULL and APP6 review rendering remains the safe formal
 * document drawn by the APP3 native-SVG renderer under the APP3-S09 watermark.
 * No grant is issued, reissued or read — B09 makes the version review-ready and
 * `APP6-B10` uses the existing `REQUEST_ACCESS` architecture unchanged. The
 * stored document's bytes and schema version are never written back.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  CUSTOM_REQUEST_DESIGN_CONTEXT_PORT,
  type CustomRequestDesignContext,
  type CustomRequestDesignContextPort,
} from '../../../order/domain/repositories/custom-request-design-context.port';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import {
  isVersionSendableState,
  projectsDesignReview,
} from '../../domain/design-version-send-eligibility';
import { designVersionSendError } from '../../domain/design-version-send.errors';
import {
  DESIGN_CASE_REPOSITORY,
  type DesignCase,
  type DesignCaseId,
  type DesignCaseRepository,
  type DesignVersion,
  type DesignVersionId,
} from '../../domain/repositories/design-case.repository';
import { requireAdminActorId } from '../design-version-actor';
import { DesignVersionBranchResolver } from '../design-version-branch.resolver';
import { DesignVersionFreezeAuthority } from './design-version-freeze.authority';
import { DesignVersionSendRecorder } from './design-version-send.recorder';
import type { DesignVersionSentView } from './design-version-sent.view';

/**
 * Everything the client owns, and nothing else.
 *
 * There is no document, no hash, no design case id, no customer, no admin id, no
 * status, no branch, no placement and no `sentAt` — not because this use case
 * declines to read them, but because the command type has nowhere to put one.
 * `versionId` is an exact locator, never ownership authority by itself: the
 * containment chain below is what authorizes it.
 */
export interface SendDesignVersionCommand {
  readonly customRequestId: CustomRequestId;
  readonly versionId: DesignVersionId;
}

/** The `TR-LC11-08` projection's system actor (`APP6-G01` §4). */
const DESIGN_VERSION_SEND_JOB_KEY = 'design.version.send';

/** The guard code `transition()` reports when the locked row has already moved. */
const STALE_TRANSITION = 'STALE_TRANSITION';
/** The LC-11 guard's code, for the case the send rule could not foresee. */
const INVALID_TRANSITION = 'INVALID_TRANSITION';
/**
 * The code `CONSTRAINT_MEANINGS` already gives
 * `uq_design_versions__case__sent_for_review`.
 *
 * The mapping is narrow because the *catalog* is: the constraint name is looked
 * up by the persistence error mapper, so only that one index produces this code.
 * A generic `DUPLICATE_RESOURCE` from any other unique arbiter is deliberately
 * left alone and travels to the platform filter as itself.
 */
const REVIEW_ALREADY_ACTIVE = 'REVIEW_ALREADY_ACTIVE';

@Injectable()
export class SendDesignVersionUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(DESIGN_CASE_REPOSITORY) private readonly cases: DesignCaseRepository,
    @Inject(CUSTOM_REQUEST_DESIGN_CONTEXT_PORT)
    private readonly design: CustomRequestDesignContextPort,
    @Inject(CUSTOM_REQUEST_REPOSITORY) private readonly requests: CustomRequestRepository,
    private readonly branches: DesignVersionBranchResolver,
    private readonly freeze: DesignVersionFreezeAuthority,
    private readonly recorder: DesignVersionSendRecorder,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  async send(command: SendDesignVersionCommand): Promise<DesignVersionSentView> {
    // Resolved before anything else: an action with no operator behind it must
    // fail before it reads a request, not after it has frozen one.
    const adminId = requireAdminActorId(this.requestContext);
    const correlationId = this.requestContext.requireRequestId();

    try {
      return await this.transactions.runInTransaction(async () => {
        const request = await this.lockRequest(command.customRequestId);
        const designCase = await this.resolveCase(request);
        const version = await this.lockVersion(designCase, command.versionId);

        // LC-08 "resend replays". The same version, already the one awaiting a
        // decision: nothing is re-hashed, re-dated, re-superseded, re-pointed,
        // re-transitioned, re-audited or re-announced. The partial unique index
        // makes `SENT_FOR_REVIEW` the case's *only* active review, so this
        // status alone is the proof that this is that version.
        if (version.status === 'SENT_FOR_REVIEW') {
          return this.replayView(request, designCase, version);
        }
        if (version.status !== 'DRAFT') {
          throw designVersionSendError('DESIGN_VERSION_NOT_SENDABLE');
        }
        // GRD-004, read first for a clean answer. The index below is what makes
        // it true; this only makes the refusal legible.
        const inReview = await this.cases.findVersionInReview(designCase.id);
        if (inReview !== undefined) {
          throw designVersionSendError('REVIEW_ALREADY_ACTIVE');
        }

        if (!isVersionSendableState(request.status)) {
          throw designVersionSendError('REQUEST_NOT_SENDABLE');
        }

        // The freeze boundary. Both halves refuse rather than substitute.
        const branch = await this.branches.resolve(request);
        if (branch === undefined) {
          throw designVersionSendError('PLACEMENT_AUTHORITY_UNRESOLVED');
        }
        const documentHash = this.freeze.hashFrozenDocument(version, branch);

        const sentAt = this.clock.now();
        const sent = await this.cases.sendForReview(version.id, documentHash, sentAt);

        const supersededVersionIds = await this.supersedePredecessors(
          designCase.id,
          version.id,
          sentAt,
        );

        // The case pointer is **preserved**, not moved. `TR-LC08-02` freezes a
        // version; LC-08 states no pointer rule for it, and `APP6-B08` already
        // set the pointer to mean "the newest authored draft". Re-pointing it at
        // whatever was just sent would quietly redefine it as "the version under
        // review" — which `findVersionInReview` and the partial unique index
        // already answer, exactly and without a second source of truth.

        const transitioned = projectsDesignReview(request.status);
        if (transitioned) {
          await this.requests.transition({
            id: request.requestId,
            to: 'DESIGN_REVIEW',
            // Not the operator. `TR-LC11-08`'s actor is the system, because the
            // move is a consequence of this transaction committing rather than a
            // command anyone issued.
            actor: { kind: 'SYSTEM', systemJobKey: DESIGN_VERSION_SEND_JOB_KEY },
            correlationId,
            expectedFrom: request.status,
          });
        }
        // A request already in `DESIGN_REVIEW` stays there and gains **no**
        // transition row: LC-11 has no self-edge, and one would claim a move
        // that did not happen.

        await this.recorder.record({
          designVersionId: sent.id,
          designCaseId: designCase.id,
          customRequestId: request.requestId,
          version: sent.version,
          branch: sent.placement.branch,
          documentSchemaVersion: sent.documentSchemaVersion,
          documentHash,
          sentAt,
          supersededVersionIds,
          requestTransitioned: transitioned,
          adminId,
        });

        return {
          requestId: request.requestId,
          designCaseId: designCase.id,
          versionId: sent.id,
          version: sent.version,
          versionStatus: sent.status,
          requestStatus: transitioned ? 'DESIGN_REVIEW' : request.status,
          requestTransitioned: transitioned,
          branch: sent.placement.branch,
          documentSchemaVersion: sent.documentSchemaVersion,
          // Read back off the frozen row rather than echoed from the variable:
          // reporting what this code believes it wrote is how a response starts
          // disagreeing with the row.
          documentHash: sent.documentHash ?? documentHash,
          sentAt: sent.sentAt ?? sentAt,
          supersededVersionIds,
          replayed: false,
        };
      });
    } catch (error: unknown) {
      throw this.classify(error);
    }
  }

  /**
   * The request row, locked, with the design facts this send reads.
   *
   * `lockDesignContext` rather than `CustomRequestRepository.lockById`: both take
   * the same `FOR UPDATE` lock on the same row, and this one also carries the
   * branch subject the freeze check needs, so the alternative would be two reads
   * of one row to answer one question. The write port is still injected — it
   * owns `transition()` — and `transition()` re-locks the same row inside this
   * transaction, which is a no-op the lock already holds.
   */
  private async lockRequest(id: CustomRequestId): Promise<CustomRequestDesignContext> {
    const request = await this.design.lockDesignContext(id);
    if (request === undefined) {
      throw designVersionSendError('REQUEST_NOT_FOUND');
    }
    return request;
  }

  /**
   * The request's own design case, by its canonical pointer, both directions.
   *
   * `current_design_case_id` is followed rather than "the latest case for this
   * request" because the pointer is the canonical relation (G-DB7-09), and the
   * case is then required to name the request back: without that second test a
   * dangling or re-pointed pointer would let this send freeze somebody else's
   * artwork. Neither failure is repaired — no case is created and none is
   * rebound.
   */
  private async resolveCase(request: CustomRequestDesignContext): Promise<DesignCase> {
    if (request.currentDesignCaseId === undefined) {
      throw designVersionSendError('DESIGN_CASE_UNRESOLVED');
    }
    const designCase = await this.cases.findById(request.currentDesignCaseId as DesignCaseId);
    if (designCase === undefined || designCase.customRequestId !== request.requestId) {
      throw designVersionSendError('DESIGN_CASE_UNRESOLVED');
    }
    return designCase;
  }

  /**
   * The exact version, locked, and proved to belong to this request's case.
   *
   * `lockVersion` addresses the versions table globally, so an id from another
   * request's case resolves perfectly well. The containment check is what stops
   * one request's URL from freezing another's design, and its failure is the
   * same answer a missing row gets — a foreign id must not be able to confirm
   * that a version exists somewhere else.
   */
  private async lockVersion(
    designCase: DesignCase,
    versionId: DesignVersionId,
  ): Promise<DesignVersion> {
    const version = await this.cases.lockVersion(versionId);
    if (version === undefined || version.designCaseId !== designCase.id) {
      throw designVersionSendError('DESIGN_VERSION_NOT_FOUND');
    }
    return version;
  }

  /**
   * `TR-LC08-05`, exactly as LC-08 states it and no wider.
   *
   * Source state `REVISION_REQUESTED` only; the repository's own query is what
   * bounds that. `SENT_FOR_REVIEW` is the other source LC-08 names, and it is
   * unreachable from here: GRD-004 refused the send several statements above, so
   * supersession can never be the thing that clears an active review. Nothing is
   * fabricated when there is no predecessor, and the historical rows keep their
   * document, placement, geometry and hash — only the two lifecycle columns the
   * CST-090 trigger permits on a frozen row change.
   */
  private async supersedePredecessors(
    caseId: DesignCaseId,
    sentVersionId: DesignVersionId,
    at: Date,
  ): Promise<DesignVersionId[]> {
    const candidates = await this.cases.listRevisionRequestedVersionIds(caseId);
    const predecessors = candidates.filter((id) => id !== sentVersionId);
    for (const id of predecessors) {
      await this.cases.supersede(id, at);
    }
    return predecessors;
  }

  /** The committed facts of a version that is already the active review. */
  private replayView(
    request: CustomRequestDesignContext,
    designCase: DesignCase,
    version: DesignVersion,
  ): DesignVersionSentView {
    if (version.documentHash === undefined || version.sentAt === undefined) {
      // Unreachable: `sendForReview` writes both in the same statement as the
      // status, and CST-074 requires a hash the moment the row leaves DRAFT.
      // Stated rather than coerced — a fabricated hash here would be the value
      // `GRD-007` later binds an approval to.
      throw designVersionSendError('DESIGN_VERSION_NOT_SENDABLE');
    }
    return {
      requestId: request.requestId,
      designCaseId: designCase.id,
      versionId: version.id,
      version: version.version,
      versionStatus: version.status,
      requestStatus: request.status,
      requestTransitioned: false,
      branch: version.placement.branch,
      documentSchemaVersion: version.documentSchemaVersion,
      documentHash: version.documentHash,
      sentAt: version.sentAt,
      // Whatever this send superseded is already history; a replay supersedes
      // nothing and says so rather than re-reporting an earlier call's work.
      supersededVersionIds: [],
      replayed: true,
    };
  }

  /**
   * Translates the persistence verdicts this use case owns, and only those.
   *
   * The GRD-004 mapping is the one CC-03 depends on: two senders on independent
   * connections can both pass the preflight read if the request lock is ever
   * released between them, and the index is what stops the second from
   * committing. Its rejection carries the constraint name, which the delivered
   * `CONSTRAINT_MEANINGS` catalog already resolves to exactly this code — so
   * this branch narrows nothing by hand and cannot swallow an unrelated
   * duplicate.
   *
   * Everything else travels as itself to the platform filter, which sanitises
   * it. Shaping an unknown error into a bounded refusal here is how a defect
   * would be reported to a client as an ordinary "please fix your request".
   */
  private classify(error: unknown): unknown {
    if (!isPersistenceError(error)) return error;
    if (error.code === REVIEW_ALREADY_ACTIVE) {
      return designVersionSendError('REVIEW_ALREADY_ACTIVE');
    }
    if (error.code === STALE_TRANSITION) {
      return designVersionSendError('REQUEST_TRANSITION_STALE');
    }
    if (error.code === INVALID_TRANSITION) {
      return designVersionSendError('INVALID_TRANSITION');
    }
    return error;
  }
}
