/**
 * The atomic issue path (`APP4-B03` §12, audit `APP4-B03` **[C1]**).
 *
 * Four steps, one transaction, no dual write:
 *
 * ```text
 * 1. mint the raw code                    (APP4-P01)
 * 2. persist the challenge — code_hash only
 * 3. create the secret-free notification intent   (APP4-B01)
 * 4. append the outbox event whose payload is the sealed envelope
 * ```
 *
 * Steps 3 and 4 are one call: `RequestNotificationUseCase` does both inside the
 * transaction it joins. So either all four commit or none does, and the two
 * halves of the invariant hold in both directions — a challenge can never exist
 * with no way to deliver its code, and an envelope can never exist for a
 * challenge that rolled back.
 *
 * **The raw code lives in one local scope.** It is minted here, hashed here, and
 * handed to B01 exactly once; it is never returned, never logged, never put in
 * an error and never written to a column. `code_hash` is the only durable trace,
 * and the plaintext leaves the request only inside the sealed envelope.
 *
 * This class is shared by both endpoints on purpose. A resend is *the same
 * issuance* with a different eligibility rule in front of it, and two copies of
 * a four-step atomic path is how one of them later gains a step the other does
 * not.
 */
import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError, newId } from '@embroidery/database';
import type { ContactKind, VerificationPurpose } from '@embroidery/database';

import { RequestNotificationUseCase } from '../../notification/application/request-notification.use-case';
import { App4SecretPepperProvider } from '../config/app4-secret-pepper.provider';
import { maskContact } from '../domain/contact/mask-contact';
import { digestSecret } from '../domain/secret/app4-secret-digest';
import {
  ISSUED,
  VerificationIssueError,
  type VerificationChallengeIssued,
} from '../domain/verification/verification-issue-outcome';
import {
  expiryOf,
  resendAvailableAtOf,
  type VerificationChallengePolicy,
} from '../domain/verification/verification-challenge-policy';
import {
  VERIFICATION_CHALLENGE_REPOSITORY,
  type ChallengeId,
  type VerificationChallengeRepository,
} from '../domain/repositories/verification-challenge.repository';
import {
  VERIFICATION_CHANNEL_UNSUPPORTED as CHANNEL_UNSUPPORTED,
  isVerificationContactKind,
} from '../domain/verification/verification-channel';
import { VerificationCodeMinter } from '../infrastructure/crypto/verification-code.minter';

/**
 * The notification template this capability asks B01 to deliver.
 *
 * A key, not a body: `notification_intents` stores a template reference and
 * redacted parameters, and rendering belongs to whatever eventually owns message
 * content (`ADR-DB2-003`). Versioned so a later template revision is a different
 * idempotency tuple rather than a silent change of meaning.
 */
export const VERIFICATION_TEMPLATE_KEY = 'verification.code';
export const VERIFICATION_TEMPLATE_VERSION = 1;

/**
 * The contact-kind → channel mapping (`ADR-APP4-001` §12).
 *
 * Declared once and read, never inferred at a call site: `PHONE → SMS` is the
 * pair a reader expects to be identity and is not.
 */
const CHANNEL_OF: Readonly<Record<ContactKind, string>> = { EMAIL: 'EMAIL', PHONE: 'SMS' };

/** The catalogued meaning of CST-007 / `uq_verification_challenges__kind_value_purpose__issued`. */
const CHALLENGE_ALREADY_OPEN = 'CHALLENGE_ALREADY_OPEN';

export interface IssueTarget {
  readonly contactKind: ContactKind;
  readonly normalizedValue: string;
  readonly purpose: VerificationPurpose;
  /** Carried forward by a resend; B03 never accepts one from a caller. */
  readonly sessionId?: string | undefined;
  readonly contactPointId?: string | undefined;
}

@Injectable()
export class VerificationChallengeIssuer {
  constructor(
    @Inject(VERIFICATION_CHALLENGE_REPOSITORY)
    private readonly challenges: VerificationChallengeRepository,
    private readonly notifications: RequestNotificationUseCase,
    private readonly minter: VerificationCodeMinter,
    private readonly peppers: App4SecretPepperProvider,
  ) {}

  /**
   * Mints, persists and hands off one challenge.
   *
   * **Must already run inside a transaction.** It opens none of its own: the
   * caller has taken the advisory lock, expired stale rows and checked the rate
   * budget in that same transaction, and a nested boundary here would let the
   * challenge commit while those decisions rolled back.
   */
  async issue(
    target: IssueTarget,
    policy: VerificationChallengePolicy,
    issuedAt: Date,
  ): Promise<VerificationChallengeIssued> {
    // The channel decision, before a code exists (`APP12-N01` §1). Both public
    // endpoints issue through this method — the initial challenge and the
    // resend, which carries its kind forward from the source row — so refusing
    // here refuses everywhere, including for a legacy `PHONE` challenge whose
    // resend would otherwise mint a fresh code for a transport that does not
    // exist. Placed above the minter deliberately: nothing secret is created for
    // a destination that can never be reached.
    if (!isVerificationContactKind(target.contactKind)) {
      throw new VerificationIssueError(CHANNEL_UNSUPPORTED);
    }

    const challengeId = newId() as ChallengeId;
    const expiresAt = expiryOf(policy, issuedAt);

    // Step 1 and 2. The plaintext exists from here to the `request` call below
    // and nowhere else in this process.
    const code = this.minter.mint();
    const codeHash = digestSecret(this.peppers.require().verificationCodePepper, code);

    try {
      await this.challenges.openChallenge({
        id: challengeId,
        contactKind: target.contactKind,
        normalizedValue: target.normalizedValue,
        purpose: target.purpose,
        codeHash,
        issuedAt,
        expiresAt,
        ...(target.contactPointId === undefined ? {} : { contactPointId: target.contactPointId }),
        ...(target.sessionId === undefined ? {} : { sessionId: target.sessionId }),
      });
    } catch (error: unknown) {
      throw this.classifyInsert(error);
    }

    // Steps 3 and 4, inside the same transaction. B01 owns intent idempotency,
    // masking, sealing and the outbox append; B03 owns the secret and hands it
    // over exactly once. `sealDeliveryEnvelope` is deliberately not imported
    // here — one application seam seals, and this is not it.
    await this.notifications.request({
      // Deterministic and tied to the new challenge, so a replayed handling of
      // one issuance collapses onto one intent while a resend — a different
      // challenge — is genuinely a different notification.
      sourceEventId: `verification.challenge.issued:${challengeId}`,
      channel: CHANNEL_OF[target.contactKind],
      contactKind: target.contactKind,
      normalizedRecipient: target.normalizedValue,
      templateKey: VERIFICATION_TEMPLATE_KEY,
      templateVersion: VERIFICATION_TEMPLATE_VERSION,
      reference: { kind: 'VERIFICATION_CHALLENGE', challengeId },
      secretKind: 'VERIFICATION_CODE',
      secret: code,
      issuedAt,
      expiresAt,
    });

    return {
      outcome: ISSUED,
      challengeId,
      expiresAt,
      resendAvailableAt: resendAvailableAtOf(policy, issuedAt),
      // The target this issuance just wrote, masked by the one P01 authority.
      // Because both endpoints issue through this method, a resend's mask
      // describes the replacement challenge's recipient — which a resend
      // inherits from its source, never from a request body it does not have.
      recipientMasked: maskContact(target.contactKind, target.normalizedValue),
    };
  }

  /**
   * Maps the two insert failures that mean something, and lets everything else
   * travel as itself.
   *
   * Matched on the catalogued **code**, never on a SQLSTATE: `23505` is also the
   * primary key, and `23503` is any of three foreign keys. The driver's `DETAIL`
   * — which quotes the duplicated normalized contact — stays behind this
   * boundary, and the returned error carries no cause to unwrap.
   */
  private classifyInsert(error: unknown): unknown {
    if (!isPersistenceError(error)) {
      return error;
    }
    if (error.kind === 'CONFLICT' && error.code === CHALLENGE_ALREADY_OPEN) {
      return new VerificationIssueError('CONCURRENT_ISSUE_LOSS');
    }
    if (error.kind === 'INVALID_REFERENCE') {
      // The only nullable reference a caller can influence is the Design Session
      // (REL-007); the contact point is set by this module alone.
      return new VerificationIssueError('SESSION_REFERENCE_INVALID');
    }
    return error;
  }
}
