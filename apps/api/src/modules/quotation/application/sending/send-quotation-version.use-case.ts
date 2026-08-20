/**
 * `TR-LC12-02` — sending one exact quotation version (`APP6-B03`).
 *
 * ### One transaction, or nothing
 *
 * ```text
 * read the published validity policy   (before the transaction; a refusal writes nothing)
 * begin
 *   resolve quotation + version, prove containment
 *   replay?  -> return the committed result, write nothing
 *   lock the request row, judge it against the send rule
 *   freeze the version: sent_at / valid_from / valid_until, supersede the prior sent version
 *   point the quotation at this version        (quotations.current_version_id)
 *   point the request at this quotation        (custom_requests.current_quotation_id)
 *   project TR-LC11-05 UNDER_REVIEW -> QUOTED  (system actor, only from UNDER_REVIEW)
 *   append the quotation.sent audit row and the SE-004 outbox event
 * commit
 * ```
 *
 * Every one of those writes is in the same transaction and there is no
 * `try`/`catch` inside it that could let a subset commit. A failure anywhere
 * leaves the version a `DRAFT`, both pointers exactly as they were, no
 * transition row, and no event announcing a price the customer never received.
 *
 * ### The Admin commands a send, never a status
 *
 * `APP6-G01` §4.1 reaches `QUOTED` **only** as a projection of the owning
 * aggregate's committed event. The command type below carries two identifiers
 * and nothing else — no target state, no actor, no timestamp, no validity, no
 * totals — so there is no field through which a caller could ask for `QUOTED`,
 * and the transition is appended by this code with a **system** actor because
 * the send committed, not because anyone asked for it.
 *
 * ### Why the request row is locked before anything is frozen
 *
 * The eligibility decision and the freeze must see one state. `lockById` takes
 * the row's `FOR UPDATE` lock before the version is touched, so a moderator
 * moving the request to `CANCELLED` either commits first — and this send refuses
 * having written nothing — or waits, and finds the request `QUOTED`. Without the
 * lock the `QUOTED`-source branch, which appends no transition and therefore has
 * no `expectedFrom` to defend it, could freeze a version onto a request that had
 * already left the lifecycle.
 *
 * ### Nothing is re-priced
 *
 * The version is sent exactly as it was drafted. There is no pricing import
 * here, no deposit policy reader, no `Number()`, no `parseFloat` and no
 * arithmetic on an amount: `QuotationRepository.send` writes `status`,
 * `sent_at`, `valid_from` and `valid_until` and touches no money column, and the
 * amounts this use case reports are read back off the frozen row as the strings
 * they are.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequest,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import {
  QUOTATION_REPOSITORY,
  type Quotation,
  type QuotationId,
  type QuotationRepository,
  type QuotationVersion,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import {
  isSendableRequestState,
  projectsQuoted,
} from '../../domain/sending/quotation-send-eligibility';
import { quotationSendError } from '../../domain/sending/quotation-send.errors';
import { addCalendarDays } from '../../domain/sending/quotation-validity-policy';
import { QuotationValidityPolicyReader } from '../../infrastructure/policy/quotation-validity-policy.reader';
import { requireAdminActorId } from '../drafting/quotation-actor';
import { projectLineItem, projectVersion } from '../reads/quotation-version.projection';
import { QuotationSendRecorder } from './quotation-send.recorder';
import type { QuotationSentView } from './quotation-sent.view';

/**
 * Everything the client owns, and nothing else.
 *
 * There is no target status, no `sentAt`, no `validUntil`, no total, no actor
 * and no correlation id — not because this use case declines to read them, but
 * because the command type has nowhere to put one.
 */
export interface SendQuotationVersionCommand {
  readonly quotationId: QuotationId;
  readonly versionId: QuotationVersionId;
}

/** The `TR-LC11-05` projection's system actor (`APP6-G01` §4). */
const QUOTATION_SEND_JOB_KEY = 'quotation.send';

/** The guard code `transition()` reports when the locked row has already moved. */
const STALE_TRANSITION = 'STALE_TRANSITION';
/** The LC-11 guard's code, for the case the send rule could not foresee. */
const INVALID_TRANSITION = 'INVALID_TRANSITION';

@Injectable()
export class SendQuotationVersionUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(CUSTOM_REQUEST_REPOSITORY) private readonly requests: CustomRequestRepository,
    private readonly validityPolicy: QuotationValidityPolicyReader,
    private readonly recorder: QuotationSendRecorder,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  async send(command: SendQuotationVersionCommand): Promise<QuotationSentView> {
    // Resolved before anything else: an action with no operator behind it must
    // fail before it reads a quotation, not after it has frozen one.
    const adminId = requireAdminActorId(this.requestContext);
    const correlationId = this.requestContext.requireRequestId();

    // Read outside the transaction, like every other policy consumer in this
    // repository. An unpublished window is a refusal, never a guessed date, and
    // refusing here means nothing was written at all.
    const policy = await this.validityPolicy.require();

    try {
      return await this.transactions.runInTransaction(async () => {
        const { quotation, version } = await this.resolve(command);

        // LC-12 "resend replays". The same version, already sent and still the
        // one the customer is looking at: the committed result is returned and
        // nothing is re-frozen, re-priced, re-pointed, re-transitioned or
        // re-announced.
        if (version.status === 'SENT' && quotation.currentVersionId === version.id) {
          const current = await this.requireRequest(quotation.customRequestId);
          return this.view(quotation, version, current.status, false, true);
        }
        if (version.status !== 'DRAFT') {
          throw quotationSendError('QUOTATION_VERSION_NOT_SENDABLE');
        }

        // The lock, before any write. See the header note.
        const request = await this.lockRequest(quotation.customRequestId);
        if (!isSendableRequestState(request.status)) {
          throw quotationSendError('REQUEST_NOT_SENDABLE');
        }

        const sentAt = this.clock.now();
        const sent = await this.quotations.send(
          version.id,
          addCalendarDays(sentAt, policy.validityDays),
          sentAt,
        );

        // `send` already advances the header pointer; this is the G-DB7-03
        // containment guard applied to the same fact, and the step
        // `FU-APP6-B01-CURRENT-QUOTATION-POINTER-01` names on the quotation side.
        await this.quotations.setCurrentVersion(quotation.id, sent.id);
        // …and on the request side. Both pointers commit with the freeze.
        await this.requests.setCurrentQuotation(request.id, quotation.id);

        const transitioned = projectsQuoted(request.status);
        if (transitioned) {
          await this.requests.transition({
            id: request.id,
            to: 'QUOTED',
            // Not the operator. `TR-LC11-05`'s actor is the system, because the
            // move is a consequence of this transaction committing rather than a
            // command anyone issued.
            actor: { kind: 'SYSTEM', systemJobKey: QUOTATION_SEND_JOB_KEY },
            correlationId,
            expectedFrom: request.status,
          });
        }

        await this.record(quotation, sent, sentAt, adminId);

        // Re-read rather than assumed: the header's status and pointer were
        // written by `send`, and reporting what this code believes it wrote is
        // how a response starts disagreeing with the row.
        const committed = await this.requireQuotation(quotation.id);
        return this.view(
          committed,
          sent,
          transitioned ? 'QUOTED' : request.status,
          transitioned,
          false,
        );
      });
    } catch (error: unknown) {
      throw this.classify(error);
    }
  }

  /**
   * The addressed quotation and the version that must belong to it.
   *
   * `loadVersion` addresses the versions table globally, so a version id from
   * another quotation resolves perfectly well. The containment check is what
   * stops one quotation's URL from freezing another's price, and its failure is
   * the same answer a missing row gets.
   */
  private async resolve(
    command: SendQuotationVersionCommand,
  ): Promise<{ quotation: Quotation; version: QuotationVersion }> {
    const quotation = await this.quotations.findById(command.quotationId);
    if (quotation === undefined) {
      throw quotationSendError('QUOTATION_NOT_FOUND');
    }
    const version = await this.quotations.loadVersion(command.versionId);
    if (version === undefined || version.quotationId !== quotation.id) {
      throw quotationSendError('QUOTATION_VERSION_NOT_FOUND');
    }
    return { quotation, version };
  }

  private async lockRequest(customRequestId: string): Promise<CustomRequest> {
    const request = await this.requests.lockById(customRequestId as CustomRequestId);
    if (request === undefined) {
      throw quotationSendError('REQUEST_NOT_FOUND');
    }
    return request;
  }

  private async requireRequest(customRequestId: string): Promise<CustomRequest> {
    const request = await this.requests.findById(customRequestId as CustomRequestId);
    if (request === undefined) {
      throw quotationSendError('REQUEST_NOT_FOUND');
    }
    return request;
  }

  private async requireQuotation(quotationId: QuotationId): Promise<Quotation> {
    const quotation = await this.quotations.findById(quotationId);
    if (quotation === undefined) {
      throw quotationSendError('QUOTATION_NOT_FOUND');
    }
    return quotation;
  }

  /** Amounts pass straight from the frozen row into the evidence, as strings. */
  private async record(
    quotation: Quotation,
    sent: QuotationVersion,
    sentAt: Date,
    adminId: string,
  ): Promise<void> {
    if (sent.validUntil === undefined) {
      // Unreachable: `send` writes it in the same statement as `status`. Stated
      // rather than coerced, because a fabricated date here would be a validity
      // window the customer is told about that nothing published.
      throw quotationSendError('QUOTATION_POLICY_UNAVAILABLE');
    }
    await this.recorder.record({
      quotationId: quotation.id,
      quotationCode: quotation.code,
      customRequestId: quotation.customRequestId,
      versionId: sent.id,
      version: sent.version,
      currencyCode: sent.currencyCode,
      totalAmount: sent.totalAmount,
      depositAmount: sent.depositAmount,
      remainingAmount: sent.remainingAmount,
      validUntil: sent.validUntil,
      sentAt,
      adminId,
    });
  }

  private async view(
    quotation: Quotation,
    version: QuotationVersion,
    requestStatus: string,
    requestTransitioned: boolean,
    replayed: boolean,
  ): Promise<QuotationSentView> {
    const lineItems = await this.quotations.loadLineItems(version.id);
    return {
      quotation: {
        quotationId: quotation.id,
        quotationCode: quotation.code,
        customRequestId: quotation.customRequestId,
        quotationStatus: quotation.status,
        currentVersionId: quotation.currentVersionId,
      },
      version: projectVersion(version, quotation.currentVersionId),
      lineItems: lineItems.map(projectLineItem),
      requestStatus,
      requestTransitioned,
      replayed,
    };
  }

  /**
   * Translates the persistence verdicts this use case owns, and only those.
   *
   * `INVALID_TRANSITION` should be unreachable — the send rule permits the
   * projection only from `UNDER_REVIEW`, which LC-11 allows. It is mapped anyway
   * rather than left to become a 500: the two tables are separate authorities on
   * purpose, and if they ever disagree the operator should read a refusal.
   *
   * Everything else travels as itself to the platform filter, which sanitises
   * it. Shaping an unknown error into a bounded refusal here is how a defect
   * would be reported to a client as an ordinary "please fix your request".
   */
  private classify(error: unknown): unknown {
    if (isPersistenceError(error) && error.code === STALE_TRANSITION) {
      return quotationSendError('REQUEST_TRANSITION_STALE');
    }
    if (isPersistenceError(error) && error.code === INVALID_TRANSITION) {
      return quotationSendError('INVALID_TRANSITION');
    }
    return error;
  }
}
