/**
 * Creating a request's quotation with its first DRAFT version
 * (`TR-LC12-01`, `APP6-B01`).
 *
 * ### One transaction, or nothing
 *
 * The header and its first version commit together. A quotation with no version
 * is a priced document with no price, and a version with no quotation cannot
 * exist at all — so both writes and the eligibility read share one transaction,
 * and a failure anywhere leaves the request exactly as it was.
 *
 * ### The eligibility rule is DB3's, unchanged
 *
 * `TR-LC12-01`'s guard is "request ≥ UNDER_REVIEW"; `quotation-eligibility.ts`
 * states which states that is and why. The request is **read**, never written:
 * this use case has no path to `transition()` and injects no recorder, so
 * drafting cannot move a request to `QUOTED` — that projection belongs to the
 * send transaction in `APP6-B03` and is reachable only from there.
 *
 * ### Why the duplicate check is not the arbiter
 *
 * `findByRequest` is read first so a second create answers
 * `QUOTATION_ALREADY_EXISTS` instead of a sanitised constraint violation, but
 * `uq_quotations__request` (CST-035) remains the arbiter: two operators creating
 * at once both pass the read, and the loser is classified from the catalogued
 * code into the same refusal.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../../order/domain/repositories/custom-request.repository';
import { generateQuotationCode } from '../../domain/drafting/quotation-code';
import { QuotationDraftingError } from '../../domain/drafting/quotation-drafting.errors';
import { isQuotableRequestState } from '../../domain/drafting/quotation-eligibility';
import {
  QUOTATION_REPOSITORY,
  type QuotationId,
  type QuotationRepository,
} from '../../domain/repositories/quotation.repository';
import { QuotationDepositPolicyReader } from '../../infrastructure/policy/quotation-deposit-policy.reader';
import type { DraftVersionCommand, DraftedVersionView } from './draft-version.command';
import { requireAdminActorId } from './quotation-actor';
import { QuotationVersionDrafter } from './quotation-version.drafter';

export interface CreateQuotationDraftCommand extends DraftVersionCommand {
  readonly customRequestId: CustomRequestId;
}

/** The `code`s the constraint catalogue reports for the two `quotations` uniques. */
const QUOTATION_ALREADY_EXISTS_FOR_REQUEST = 'QUOTATION_ALREADY_EXISTS_FOR_REQUEST';
const DUPLICATE_QUOTATION_CODE = 'DUPLICATE_QUOTATION_CODE';

/**
 * Ten characters of CSPRNG over a 30-symbol alphabet make a collision a
 * ~1-in-2^49 event, but `uq_quotations__code` is the arbiter and a `23505`
 * aborts the whole transaction — so a retry is a fresh attempt, bounded, exactly
 * as `SubmitCustomRequestUseCase` retries a request code.
 */
const MAX_QUOTATION_CODE_ATTEMPTS = 3;

@Injectable()
export class CreateQuotationDraftUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(CUSTOM_REQUEST_REPOSITORY) private readonly requests: CustomRequestRepository,
    private readonly depositPolicy: QuotationDepositPolicyReader,
    private readonly drafter: QuotationVersionDrafter,
    private readonly requestContext: RequestContextService,
  ) {}

  async create(command: CreateQuotationDraftCommand): Promise<DraftedVersionView> {
    // Resolved before anything else: an action with no operator behind it must
    // fail before it reads a request, not after it has written one.
    requireAdminActorId(this.requestContext);

    // Read outside the transaction, like every other policy consumer in this
    // repository. An unpublished policy is a refusal, never a guessed split.
    const policy = await this.depositPolicy.require();

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.runCreate(command, policy);
      } catch (error: unknown) {
        if (isCode(error, DUPLICATE_QUOTATION_CODE) && attempt < MAX_QUOTATION_CODE_ATTEMPTS) {
          continue;
        }
        throw this.classify(error);
      }
    }
  }

  private async runCreate(
    command: CreateQuotationDraftCommand,
    policy: Awaited<ReturnType<QuotationDepositPolicyReader['require']>>,
  ): Promise<DraftedVersionView> {
    return this.transactions.runInTransaction(async () => {
      const request = await this.requests.findById(command.customRequestId);
      if (request === undefined) {
        throw new QuotationDraftingError('REQUEST_NOT_FOUND');
      }
      if (!isQuotableRequestState(request.status)) {
        throw new QuotationDraftingError('REQUEST_NOT_QUOTABLE');
      }

      const existing = await this.quotations.findByRequest(command.customRequestId);
      if (existing !== undefined) {
        throw new QuotationDraftingError('QUOTATION_ALREADY_EXISTS');
      }

      const quotation = await this.quotations.createForRequest(
        newId() as QuotationId,
        generateQuotationCode(),
        command.customRequestId,
      );
      return this.drafter.draft(quotation, command, policy);
    });
  }

  /** Turns the one insert failure that means something into its refusal. */
  private classify(error: unknown): unknown {
    if (isPersistenceError(error) && error.code === QUOTATION_ALREADY_EXISTS_FOR_REQUEST) {
      return new QuotationDraftingError('QUOTATION_ALREADY_EXISTS');
    }
    return error;
  }
}

function isCode(error: unknown, code: string): boolean {
  return isPersistenceError(error) && error.code === code;
}
