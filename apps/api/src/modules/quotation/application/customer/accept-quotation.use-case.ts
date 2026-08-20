/**
 * `TR-LC12-03` — the customer accepting the exact version they were shown
 * (`APP6-B05`).
 *
 * ### One transaction, or nothing
 *
 * ```text
 * authorize the secure link      (before the transaction: policy, abuse budget, digest)
 * begin
 *   re-establish the grant under its row lock, and re-walk grant -> request ->
 *     quotation -> version, proving every containment              (ADR-DB3-004 r9)
 *   claim quotation.accept on this exact version
 *     replay? -> return the committed acceptance, write nothing
 *   require a fresh STEP_UP for this customer                      (GRD-003)
 *   lock the request row and judge QUOTED -> QUOTE_ACCEPTED against it
 *   accept the version: SENT + still current + now < valid_until, under FOR UPDATE,
 *     then ACCEPTED + the TBL-053 evidence row + the ACCEPTED header (GRD-006)
 *   project TR-LC11-06 QUOTED -> QUOTE_ACCEPTED with a system actor
 *   append the quotation.accepted audit row
 *   complete the idempotency claim with the replayable result
 * commit
 * ```
 *
 * There is no `try`/`catch` inside the transaction that could let a subset
 * commit, and no compensation path: a failure anywhere leaves the version
 * `SENT`, no acceptance row, the request still `QUOTED`, no transition row, no
 * audit row and no idempotency record. `APP6-B05` §19 forbids compensation
 * precisely because a compensating write would be a second chance for half of
 * this to survive.
 *
 * ### Nothing that follows an acceptance happens here
 *
 * No order, no order item, no payment obligation, no payment attempt, no
 * inventory reservation and no soft hold. LC-12 lists a soft hold as *optional*
 * and APP6 stops before APP7 (`APP6-B05` §16); none of those modules is imported
 * and none is reachable from this module's injector. No outbox event either —
 * `APP6-G01` §9 records `quotation.accepted` as **not** an emitted event.
 *
 * ### The customer commands an acceptance, never a request state
 *
 * {@link AcceptQuotationCommand} carries a credential and a version id. There is
 * no target state, no actor, no timestamp, no customer id and no total, so there
 * is no field through which a caller could ask for `QUOTE_ACCEPTED` — and the
 * transition below is appended with a **system** actor because the acceptance
 * committed, not because anyone asked for it (`APP6-B05` §12).
 *
 * ### Nothing is re-priced
 *
 * There is no pricing import here, no deposit policy reader, no `Number()`, no
 * `parseFloat` and no arithmetic on an amount. The accepted total is the frozen
 * version's own `total_amount` string; `QuotationRepository.accept` copies it
 * into TBL-053 off the row it just locked, so the evidence cannot record a
 * figure this code invented.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import { IdempotencyStore, TransactionManager, type IdempotencyKey } from '@embroidery/persistence';

import { AuditClock } from '../../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { StepUpEvidenceResolver } from '../../../customer/application/step-up-evidence.resolver';
import { SecureGrantError } from '../../../customer/domain/grant/secure-grant-outcome';
import { secureLinkUnavailable } from '../../../customer/domain/grant/secure-link.errors';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import { isLegalRequestTransition } from '../../../order/domain/lifecycle/request-transitions';
import {
  QUOTATION_REPOSITORY,
  type QuotationRepository,
  type QuotationVersionId,
} from '../../domain/repositories/quotation.repository';
import {
  QUOTATION_ACCEPT_IDEMPOTENCY_TTL_MS,
  QUOTATION_ACCEPT_NAMESPACE,
  acceptFingerprint,
} from '../../domain/decision/quotation-accept-idempotency';
import { quotationDecisionError } from '../../domain/decision/quotation-decision.errors';
import { QuotationDecisionRecorder } from './quotation-decision.recorder';
import {
  QuotationDecisionTargetResolver,
  type QuotationDecisionTarget,
} from './quotation-decision.target';
import type { QuotationAcceptedView } from './quotation-decision.view';

/** The whole input: one credential and the version the customer was looking at. */
export interface AcceptQuotationCommand {
  readonly token: string;
  readonly versionId: QuotationVersionId;
}

/** `TR-LC11-06`'s system actor (`APP6-G01` §4.1). */
const ACCEPT_JOB_KEY = QUOTATION_ACCEPT_NAMESPACE;
/** The state `QUOTE_ACCEPTED` may be reached from, and the state it is. */
const QUOTED = 'QUOTED';
const QUOTE_ACCEPTED = 'QUOTE_ACCEPTED';

/** The persistence guard codes this use case translates. */
const QUOTE_VERSION_STALE = 'QUOTE_VERSION_STALE';
const STALE_TRANSITION = 'STALE_TRANSITION';
const INVALID_TRANSITION = 'INVALID_TRANSITION';
const IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT';
const IDEMPOTENCY_RECORD_VANISHED = 'IDEMPOTENCY_RECORD_VANISHED';

/** The replayable result. Refs and committed facts only; nothing secret-bearing. */
interface AcceptanceResult {
  readonly versionId: string;
  readonly version: number;
  readonly versionStatus: string;
  readonly quotationStatus: string;
  readonly requestStatus: string;
  readonly acceptedTotalAmount: string;
  readonly currencyCode: string;
  readonly acceptedAt: string;
}

@Injectable()
export class AcceptQuotationUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    private readonly idempotency: IdempotencyStore,
    private readonly targets: QuotationDecisionTargetResolver,
    private readonly stepUp: StepUpEvidenceResolver,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(CUSTOM_REQUEST_REPOSITORY) private readonly requests: CustomRequestRepository,
    private readonly recorder: QuotationDecisionRecorder,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  async accept(command: AcceptQuotationCommand): Promise<QuotationAcceptedView> {
    const correlationId = this.requestContext.requireRequestId();
    try {
      return await this.transactions.runInTransaction(async () => {
        const now = this.clock.now();
        // GRD-006 seen from outside the repository: a version that is no
        // longer the offer is stale, and the customer must decide again.
        const target = await this.targets.resolve(command, now, 'QUOTE_VERSION_STALE');

        const key = this.keyFor(target);
        const claim = await this.idempotency.claim(
          key,
          new Date(now.getTime() + QUOTATION_ACCEPT_IDEMPOTENCY_TTL_MS),
        );
        if (claim.outcome === 'replay') {
          // Written in the same transaction as the TBL-053 row, so it cannot
          // exist unless that row does. Nothing below runs: no second evidence
          // row, no second transition, no second audit row.
          //
          // Checked **before** GRD-003 on purpose. A replay performs no write,
          // and gating it on a still-open step-up window would mean a customer
          // retrying an hour after a dropped response is told to re-verify in
          // order to be shown a decision they already made. It discloses
          // nothing new either: `APP6-B04`'s read already returns the accepted
          // status to the same holder of the same live grant.
          return this.replayView(claim.result);
        }
        if (claim.outcome === 'in_progress') {
          throw quotationDecisionError('DUPLICATE_OPERATION');
        }

        // GRD-003, and the first thing between this caller and a write. The
        // evidence is derived from the grant's customer — no challenge id is
        // accepted from the body — so a caller cannot present someone else's
        // proof of presence.
        const stepUp = await this.stepUp.resolve(target.grant.customerId, now);
        if (stepUp === undefined) {
          throw quotationDecisionError('REVERIFICATION_REQUIRED');
        }

        // The request row, before any write, and before the version row — the
        // same order `APP6-B03`'s send takes, so the two write paths that touch
        // both tables cannot deadlock against each other.
        const requestId = target.quotation.customRequestId as CustomRequestId;
        const request = await this.requests.lockById(requestId);
        if (request === undefined) {
          // A quotation whose request row is gone is a repository invariant
          // failure, not a state; it is answered as an unusable link rather
          // than as a diagnostic.
          throw secureLinkUnavailable();
        }
        if (
          request.status !== QUOTED ||
          !isLegalRequestTransition(request.status, QUOTE_ACCEPTED)
        ) {
          throw quotationDecisionError('INVALID_TRANSITION');
        }

        const accepted = await this.quotations.accept({
          versionId: target.version.id,
          customerId: target.grant.customerId,
          grantId: target.grant.id,
          stepUpChallengeId: stepUp.challengeId,
          acceptedAt: now,
        });

        const transitioned = await this.requests.transition({
          id: requestId,
          to: QUOTE_ACCEPTED,
          // Not the customer. `TR-LC11-06`'s actor is the system, because the
          // move is a consequence of this transaction committing rather than a
          // command anyone issued.
          actor: { kind: 'SYSTEM', systemJobKey: ACCEPT_JOB_KEY },
          correlationId,
          expectedFrom: request.status,
        });

        await this.recorder.recordAcceptance({
          quotationId: target.quotation.id,
          versionId: accepted.id,
          version: accepted.version,
          customerId: target.grant.customerId,
          grantId: target.grant.id,
          currencyCode: accepted.currencyCode,
          acceptedTotalAmount: accepted.totalAmount,
          decidedAt: now,
        });

        // Re-read rather than assumed: the header's status was written by
        // `accept`, and reporting what this code believes it wrote is how a
        // response starts disagreeing with the row.
        const committed = await this.quotations.findById(target.quotation.id);
        const result: AcceptanceResult = {
          versionId: accepted.id,
          version: accepted.version,
          versionStatus: accepted.status,
          quotationStatus: committed?.status ?? target.quotation.status,
          requestStatus: transitioned.status,
          acceptedTotalAmount: accepted.totalAmount,
          currencyCode: accepted.currencyCode,
          acceptedAt: now.toISOString(),
        };
        await this.idempotency.complete(key, result);
        return { ...toView(result), replayed: false };
      });
    } catch (error: unknown) {
      throw this.classify(error);
    }
  }

  /** `APP6-G01` §10's binding, built from the frozen row this transaction read. */
  private keyFor(target: QuotationDecisionTarget): IdempotencyKey {
    return {
      namespace: QUOTATION_ACCEPT_NAMESPACE,
      scopeKey: target.version.id,
      fingerprint: acceptFingerprint({
        versionId: target.version.id,
        acceptedTotalAmount: target.version.totalAmount,
      }),
    };
  }

  private replayView(stored: unknown): QuotationAcceptedView {
    if (stored === null || typeof stored !== 'object') {
      // Only reachable if a COMPLETED record carries no result, which this use
      // case never writes. Reported rather than coerced: fabricating a
      // confirmation for an acceptance whose evidence cannot be described would
      // be worse than a 500.
      throw new Error('A completed quotation.accept record carried no replayable result.');
    }
    return { ...toView(stored as AcceptanceResult), replayed: true };
  }

  /**
   * Translates the verdicts this use case owns, and only those.
   *
   * Everything else travels as itself to the platform filter, which sanitises
   * it. Shaping an unknown error into a bounded refusal here is how a defect
   * would reach a client as an ordinary "please fix your request", and how a
   * `PersistenceError` naming a constraint would reach a public surface.
   */
  private classify(error: unknown): unknown {
    if (isPersistenceError(error)) {
      if (error.code === QUOTE_VERSION_STALE) {
        return quotationDecisionError('QUOTE_VERSION_STALE');
      }
      if (error.code === STALE_TRANSITION || error.code === INVALID_TRANSITION) {
        return quotationDecisionError('INVALID_TRANSITION');
      }
      if (error.code === IDEMPOTENCY_CONFLICT) {
        return quotationDecisionError('IDEMPOTENCY_CONFLICT');
      }
      if (error.code === IDEMPOTENCY_RECORD_VANISHED) {
        return quotationDecisionError('DUPLICATE_OPERATION');
      }
    }
    if (error instanceof SecureGrantError) {
      // The `secure_grant` policy is unpublished or unusable, so GRD-003's
      // window has no length. A 503, not a refusal of the customer's decision.
      return quotationDecisionError('DECISION_POLICY_UNAVAILABLE');
    }
    return error;
  }
}

/** Amounts are copied, never parsed. There is no arithmetic in this function. */
function toView(result: AcceptanceResult): Omit<QuotationAcceptedView, 'replayed'> {
  return {
    versionId: result.versionId,
    version: result.version,
    versionStatus: result.versionStatus,
    quotationStatus: result.quotationStatus,
    requestStatus: result.requestStatus,
    acceptedTotalAmount: result.acceptedTotalAmount,
    currencyCode: result.currencyCode,
    acceptedAt: new Date(result.acceptedAt),
  };
}
