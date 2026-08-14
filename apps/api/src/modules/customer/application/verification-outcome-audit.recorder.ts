/**
 * The durable evidence an answered challenge leaves (`APP4-B04` §16, `INV-14`,
 * `DB3_AUDIT_SPECIFICATION` — "Customer verification: TR-LC02-02/03; contact
 * masked; code never logged").
 *
 * One row per **terminal outcome**, and only those: a successful verification,
 * an attempt that hit the limit, and an answer arriving after expiry. A wrong
 * code below the cap writes no audit row — `contact_verification_attempts` is
 * already the append-only ledger of every guess, and duplicating each one into
 * `audit_events` would put the noisiest path in the system into the trail an
 * operator reads for business actions.
 *
 * ### The actor
 *
 * `CUSTOMER` when the verification produced one, because at that instant the
 * caller's identity is exactly what was just established (`ADR-DB2-001` r3),
 * and `customer_id` then resolves through `fk_audit_events__customer_id` since
 * the row is written inside the transaction that created it.
 *
 * `SYSTEM` otherwise — a lockout, an expiry, a completed `STEP_UP` whose
 * challenge is evidence rather than identity. `ANONYMOUS` is not persistable
 * (CST-072 wants a reference per actor kind) and inventing a customer id to
 * fill the column would file evidence against a customer that does not exist.
 * This is the same choice `StaffAuditWriter.loginFailed` makes for a failed
 * login, and for the same reason.
 *
 * ### The summary carries no contact and no code
 *
 * Only server-owned bounded tokens: the contact **kind**, the **purpose**, and
 * the attempt outcome. Not the normalized value, not a masked form, not the
 * digest, and obviously not the submitted code — which exists nowhere outside
 * transient request memory in the first place.
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  AUDIT_EVENT_REPOSITORY,
  type AuditEventRepository,
} from '../../audit/domain/repositories/audit-event.repository';
import { AuditClock } from '../../../platform/audit-context/audit-clock';
import { RequestContextService } from '../../../platform/request-context/request-context.service';
import type { CustomerId } from '../domain/repositories/customer.repository';
import type { VerificationChallenge } from '../domain/repositories/verification-challenge.repository';

/** The polymorphic target kind for a challenge (G-DB7-46). */
const CHALLENGE_KIND = 'CONTACT_VERIFICATION_CHALLENGE' as const;

/** The automated actor when no customer identity exists to attribute this to. */
const VERIFICATION_JOB_KEY = 'customer.verification';

/** A challenge was answered correctly and consumed (`TR-LC02-02`). */
export const VERIFICATION_VERIFIED_ACTION = 'verification.challenge.verified';

/** The attempt budget was spent; the challenge is terminal (`TR-LC02-03`). */
export const VERIFICATION_LOCKED_ACTION = 'verification.challenge.locked';

/** An answer arrived at or after `expires_at` (`TR-LC02-04`). */
export const VERIFICATION_EXPIRED_ACTION = 'verification.challenge.expired';

export interface RecordVerifiedInput {
  readonly challenge: VerificationChallenge;
  /** Present only for `SUBMISSION`, where verification establishes identity. */
  readonly customerId?: CustomerId | undefined;
}

@Injectable()
export class VerificationOutcomeAuditRecorder {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly events: AuditEventRepository,
    private readonly requestContext: RequestContextService,
    private readonly clock: AuditClock,
  ) {}

  /** @requiresTransaction — must commit with the completion, or not at all. */
  async recordVerified(input: RecordVerifiedInput): Promise<void> {
    const { challenge, customerId } = input;
    await this.events.append({
      occurredAt: this.clock.now(),
      actor:
        customerId === undefined
          ? { kind: 'SYSTEM', systemJobKey: VERIFICATION_JOB_KEY }
          : { kind: 'CUSTOMER', customerId },
      action: VERIFICATION_VERIFIED_ACTION,
      targetKind: CHALLENGE_KIND,
      targetId: challenge.id,
      summary: {
        purpose: challenge.purpose,
        contactKind: challenge.contactKind,
        outcome: 'MATCH',
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }

  /** @requiresTransaction — must commit with the `ISSUED → FAILED` transition. */
  async recordLockedOut(challenge: VerificationChallenge): Promise<void> {
    await this.append(challenge, VERIFICATION_LOCKED_ACTION, 'ATTEMPT_LIMIT_REACHED', 'MISMATCH');
  }

  /** @requiresTransaction — must commit with the `ISSUED → EXPIRED` transition. */
  async recordExpiredAtEntry(challenge: VerificationChallenge): Promise<void> {
    await this.append(
      challenge,
      VERIFICATION_EXPIRED_ACTION,
      'EXPIRED_AT_ENTRY',
      'EXPIRED_AT_ENTRY',
    );
  }

  private async append(
    challenge: VerificationChallenge,
    action: string,
    failureCode: string,
    outcome: string,
  ): Promise<void> {
    await this.events.append({
      occurredAt: this.clock.now(),
      // No identity was established and none may be guessed at.
      actor: { kind: 'SYSTEM', systemJobKey: VERIFICATION_JOB_KEY },
      action,
      targetKind: CHALLENGE_KIND,
      targetId: challenge.id,
      failureCode,
      summary: {
        purpose: challenge.purpose,
        contactKind: challenge.contactKind,
        outcome,
      },
      correlationId: this.requestContext.requireRequestId(),
    });
  }
}
