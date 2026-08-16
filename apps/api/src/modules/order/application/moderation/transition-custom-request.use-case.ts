/**
 * The guarded Admin moderation transition (`APP5-B05` §1, §2, §5, §6, §8, §9).
 *
 * One operator decision, one transaction, and every consequence of it inside
 * that transaction:
 *
 * ```text
 * read current state  ->  judge the whole command against it
 *   -> lock the row, refuse if it moved, move it, append TBL-042
 *   -> append the required TBL-041 note
 *   -> append the SE-004 / SE-012 outbox fact
 * commit
 * ```
 *
 * The impossible partial states `APP5-B05` §5 enumerates are impossible because
 * of that boundary and nothing else: a status that changed without its note, a
 * transition row without a root update, a customer-visible reason surviving a
 * rolled-back move, an outbox fact announcing a decision that did not commit.
 * There is no `try`/`catch` inside the transaction that could swallow one of
 * these and let the rest commit.
 *
 * ### Nothing external is called inside it (INV-23)
 *
 * `RequestModerationRecorder` writes one outbox row and returns. No provider is
 * contacted, no notification is rendered and no delivery is attempted here;
 * delivery is after-commit and is a later consumer's work (`G01-D05b`). A
 * delivery failure therefore cannot roll back a moderation decision, because
 * delivery cannot happen until this transaction has already committed.
 *
 * ### Two reads, and why the first one is not redundant
 *
 * The requirement matrix — which reason texts are mandatory, which note kind
 * explains the move — is decided by the state the request is **in**, so it has
 * to be read before the command can be judged. The second read takes the row
 * lock and is the arbiter. Between them another operator may commit their own
 * decision, and `expectedFrom` is what turns that into a refusal: the validation
 * this use case just performed was against a state the request has left, so
 * re-applying the move from wherever it ended up would silently reinterpret an
 * operator's decision. Two admins racing from `UNDER_REVIEW` therefore produce
 * exactly one transition out of `UNDER_REVIEW`, and the loser is told it lost.
 *
 * That check is entirely server-side. The client sends no `fromStatus`, no
 * version and no token; it cannot weaken the guard by omitting a field, and it
 * cannot strengthen it into permission for a move the policy forbids.
 *
 * ### The two reason texts never merge
 *
 * `internalReason` and `customerVisibleReason` are separate parameters, separate
 * columns and separate response fields for their whole journey. Nothing here
 * copies one into the other, in either direction, on any target — the internal
 * text is not an input to `RequestModerationRecorder.record`, which is where a
 * copy would have to happen for a customer to ever read it.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@embroidery/database';
import { TransactionManager } from '@embroidery/persistence';

import { RequestContextService } from '../../../../platform/request-context/request-context.service';
import { RequestModerationError } from '../../domain/moderation/request-moderation.errors';
import {
  evaluateModerationCommand,
  type App5NoteKind,
  type App5TransitionTarget,
} from '../../domain/moderation/request-moderation.policy';
import {
  CUSTOM_REQUEST_REPOSITORY,
  type CustomRequestId,
  type CustomRequestRepository,
} from '../../domain/repositories/custom-request.repository';
import { requireAdminActorId } from './moderation-actor';
import { RequestModerationRecorder } from './request-moderation.recorder';

/** The guard code `transition()` reports when the locked row has already moved. */
const STALE_TRANSITION = 'STALE_TRANSITION';
/** The lifecycle guard's code, for the case the APP5 policy could not foresee. */
const INVALID_TRANSITION = 'INVALID_TRANSITION';

/**
 * Everything the client owns, and nothing else.
 *
 * There is no `fromStatus`, no `adminId`, no `customerId`, no actor kind, no
 * correlation id, no sequence and no timestamp — not because this use case
 * declines to read them, but because the command type has nowhere to put one.
 */
export interface TransitionCustomRequestCommand {
  readonly requestId: CustomRequestId;
  readonly to: App5TransitionTarget;
  readonly internalReason?: string | undefined;
  readonly customerVisibleReason?: string | undefined;
  readonly moderationNote?: string | undefined;
  readonly moderationNoteKind?: App5NoteKind | undefined;
}

export interface TransitionedRequestView {
  readonly requestId: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  /** The note this decision filed, when it filed one. */
  readonly moderationNoteSequence: number | undefined;
  readonly occurredAt: Date;
}

@Injectable()
export class TransitionCustomRequestUseCase {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(CUSTOM_REQUEST_REPOSITORY) private readonly requests: CustomRequestRepository,
    private readonly recorder: RequestModerationRecorder,
    private readonly requestContext: RequestContextService,
  ) {}

  async transition(command: TransitionCustomRequestCommand): Promise<TransitionedRequestView> {
    const adminId = requireAdminActorId(this.requestContext);
    // `NOT NULL` on TBL-042 and never a fabricated constant: this is the id the
    // gateway or the middleware put on this very request.
    const correlationId = this.requestContext.requireRequestId();

    try {
      return await this.transactions.runInTransaction(async () => {
        const current = await this.requests.findById(command.requestId);
        if (current === undefined) {
          throw new RequestModerationError('REQUEST_NOT_FOUND');
        }

        const failure = evaluateModerationCommand(current.status, {
          to: command.to,
          internalReason: command.internalReason,
          customerVisibleReason: command.customerVisibleReason,
          note: command.moderationNote,
          noteKind: command.moderationNoteKind,
        });
        if (failure !== undefined) {
          throw new RequestModerationError(failure);
        }

        // Locks the row, refuses if it left `expectedFrom`, moves the root and
        // appends the transition evidence — one write, as TBL-042 requires.
        await this.requests.transition({
          id: command.requestId,
          to: command.to,
          actor: { kind: 'ADMIN', adminId },
          reason: command.internalReason,
          customerVisibleReason: command.customerVisibleReason,
          correlationId,
          expectedFrom: current.status,
        });

        const moderationNoteSequence =
          command.moderationNote === undefined || command.moderationNoteKind === undefined
            ? undefined
            : (
                await this.requests.appendModerationNote(
                  command.requestId,
                  command.moderationNoteKind,
                  command.moderationNote,
                  adminId,
                )
              ).sequence;

        await this.recorder.record({
          customRequestId: command.requestId,
          to: command.to,
          customerVisibleReason: command.customerVisibleReason,
        });

        return {
          requestId: command.requestId,
          fromStatus: current.status,
          toStatus: command.to,
          moderationNoteSequence,
          // The moment the decision took effect, as this process observed it.
          // Not read back from the row: `created_at` is the database's clock and
          // a second query for it would be a read the transition does not need.
          occurredAt: new Date(),
        };
      });
    } catch (error: unknown) {
      throw this.classify(error);
    }
  }

  /**
   * Translates the persistence verdicts this use case owns, and only those.
   *
   * `INVALID_TRANSITION` should be unreachable — the APP5 policy is a strict
   * subset of the LC-11 graph, so anything it permitted the lifecycle permits
   * too. It is mapped anyway rather than left to become a 500: the two tables
   * are separate authorities on purpose, and if they ever disagree the operator
   * should read a refusal, not a fault.
   *
   * Everything else travels as itself to the platform filter, which sanitises
   * it. Shaping an unknown error into a bounded refusal here is how a defect
   * would be reported to a client as an ordinary "please fix your request".
   */
  private classify(error: unknown): unknown {
    if (isPersistenceError(error) && error.code === STALE_TRANSITION) {
      return new RequestModerationError('REQUEST_TRANSITION_STALE');
    }
    if (isPersistenceError(error) && error.code === INVALID_TRANSITION) {
      return new RequestModerationError('INVALID_TRANSITION');
    }
    return error;
  }
}
