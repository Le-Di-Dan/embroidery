/**
 * AGG-03 Verification Challenge persistence contract (TBL-006, TBL-007).
 *
 * Carries G-DB7-41 (a challenge belongs to the contact and purpose being
 * verified), G-DB7-43 (the step-up window) and G-DB7-45 (attempt counting;
 * the rate *policy* is layered on top, and the concurrent behaviour is DB8's).
 */
import type {
  ContactKind,
  VerificationAttemptOutcome,
  VerificationChallengeState,
  VerificationPurpose,
} from '@embroidery/database';

export type ChallengeId = string & { readonly __brand: 'ChallengeId' };

export interface VerificationChallenge {
  readonly id: ChallengeId;
  readonly contactKind: ContactKind;
  readonly normalizedValue: string;
  readonly purpose: VerificationPurpose;
  /**
   * The LC-02 state.
   *
   * Added by `APP4-B03`: a resend has to know whether its source is still open,
   * and `findById` returning a challenge with no status made "is this
   * resendable" unanswerable without a second query.
   */
  readonly status: VerificationChallengeState;
  readonly expiresAt: Date;
  /**
   * Issuance instant. The resend cooldown is measured from it (`APP4-G01`
   * `resendCooldownSeconds`), and it is what a response's `resendAvailableAt`
   * is derived from.
   */
  readonly createdAt: Date;
  readonly verifiedAt: Date | undefined;
  /** The optional APP3 Design Session binding (REL-007). */
  readonly sessionId: string | undefined;
  /** The optional contact-point binding (REL-006). */
  readonly contactPointId: string | undefined;
}

export interface OpenChallengeInput {
  readonly id: ChallengeId;
  readonly contactKind: ContactKind;
  readonly normalizedValue: string;
  readonly purpose: VerificationPurpose;
  /** A hash of the one-time code — never the code (`09-SECURITY` §OTP). */
  readonly codeHash: string;
  /**
   * The issuance instant, written explicitly to `created_at`.
   *
   * Added by `APP4-B03`, and not a convenience. `expires_at` is computed by the
   * application from its own clock, while `created_at` would otherwise come from
   * PostgreSQL's `defaultNow()` — so the resend cooldown and the issuance rate
   * window would be measured against a *different* clock from the expiry they sit
   * beside. In production the two agree to within milliseconds, which is exactly
   * what makes the discrepancy invisible until something has to reason about all
   * three at once.
   */
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly contactPointId?: string | undefined;
  /** Carried forward by a resend so a replacement keeps its source's lineage. */
  readonly sessionId?: string | undefined;
}

export const VERIFICATION_CHALLENGE_REPOSITORY = Symbol('VERIFICATION_CHALLENGE_REPOSITORY');

export interface VerificationChallengeRepository {
  /** @requiresTransaction */
  openChallenge(input: OpenChallengeInput): Promise<VerificationChallenge>;

  /**
   * Appends an attempt. Evidence, so it is never updated in place.
   *
   * @requiresTransaction — an attempt and the state change it causes belong
   * to one transaction.
   */
  recordAttempt(
    challengeId: ChallengeId,
    outcome: VerificationAttemptOutcome,
    at: Date,
  ): Promise<void>;

  /** @requiresTransaction */
  completeChallenge(id: ChallengeId, verifiedAt: Date): Promise<VerificationChallenge>;

  /** @requiresTransaction */
  failChallenge(id: ChallengeId): Promise<void>;

  /**
   * The open challenge for a contact and purpose, if one is live.
   *
   * Returns nothing once expired, so an expired challenge cannot be answered
   * merely because no sweep has run. G-DB7-41.
   */
  resolveOpen(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<VerificationChallenge | undefined>;

  /** Attempts against one challenge — the input to the rate policy (G-DB7-45). */
  countAttempts(challengeId: ChallengeId): Promise<number>;

  /**
   * Whether a step-up verification completed inside the window (G-DB7-43).
   *
   * The window itself is a policy value read from configuration, not a
   * constant here.
   */
  hasRecentCompleted(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    notBefore: Date,
  ): Promise<boolean>;

  findById(id: ChallengeId): Promise<VerificationChallenge | undefined>;

  /**
   * Reads one challenge and holds its row for the rest of the transaction
   * (`SELECT … FOR UPDATE`). Added by `APP5-B02`.
   *
   * `lockTarget` above cannot serve this: it is an advisory lock over a
   * *(kind, value, purpose)* target and exists because a new challenge has no
   * row to lock yet. `APP5-B02` has the opposite problem — the challenge
   * already exists and is the natural arbiter of its own upload quota, so the
   * row itself is the thing two concurrent uploads must queue behind. Using the
   * advisory lock here would serialize issuance and intake against each other
   * for no reason, and would still not be the row an intake decision is about.
   *
   * `FOR UPDATE` rather than `FOR SHARE`: two uploads both counting reserved
   * slots must not proceed concurrently, and a share lock permits exactly that.
   *
   * @requiresTransaction
   */
  lockById(id: ChallengeId): Promise<VerificationChallenge | undefined>;

  /**
   * The stored `code_hash` of one challenge — nothing else.
   *
   * Added by `APP4-B04`, and deliberately **not** a field on
   * {@link VerificationChallenge}. Constant-time comparison is
   * application-security-owned (TBL-006 header: "Hashing/KDF and constant-time
   * comparison are application-security-owned, outside DB6"), so the digest has
   * to reach the application layer — but only the one path that verifies needs
   * it. Putting it on the domain type would hand the digest to the issue path,
   * the resend path, the status projection and every future reader, and a
   * secret that travels everywhere is a secret one of them eventually
   * serializes.
   *
   * There is no lookup *by* hash and there will not be one: a six-digit code
   * has too little entropy for a hash-keyed read to be anything but an oracle
   * (TBL-006 — "found by id or by target+purpose, never by hash").
   */
  findCodeDigest(id: ChallengeId): Promise<string | undefined>;

  // ---------------------------------------------------------------------------
  // `APP4-B03` additions. Four methods, each one something the issue/resend path
  // cannot express with the DB7 surface — not conveniences.
  // ---------------------------------------------------------------------------

  /**
   * Serializes every issuance for one target and purpose, for this transaction.
   *
   * A transaction-scoped PostgreSQL advisory lock, released on commit or
   * rollback. It exists because the issuance rate limit is a *count* over
   * durable history, and a count is read-then-write: two concurrent issuances
   * both see four in the window and both insert a fifth. There is no row to lock
   * instead — the row that would breach the limit is the one being created — and
   * the alternative is a counter table, which `APP4-B03` §9 forbids.
   *
   * It also makes the CST-007 race a serialization rather than a collision: the
   * second transaction waits, then finds the challenge the first created. The
   * 23505 handling stays as the arbiter of last resort, because a lock a future
   * caller forgets to take must not silently become a second open challenge.
   *
   * @requiresTransaction
   */
  lockTarget(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
  ): Promise<void>;

  /**
   * Marks every timed-out `ISSUED` challenge for this target and purpose
   * `EXPIRED`, and reports how many moved.
   *
   * Required before any insert: expiry does **not** remove a row from
   * `uq_verification_challenges__kind_value_purpose__issued` (TBL-006 header),
   * so a stale row keeps the slot until something transitions it. Time alone
   * never frees the arbiter.
   *
   * @requiresTransaction
   */
  expireStale(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    now: Date,
  ): Promise<number>;

  /**
   * `ISSUED → CANCELLED` for a challenge a business resend is replacing.
   *
   * DB3 §1 locks this transition by name: "một open challenge per (contact,
   * purpose); challenge mới CANCELLED challenge cũ". Not `EXPIRED` — the source
   * has not reached its `expires_at`, and recording that it had would falsify
   * the column. Not `FAILED` — no attempt limit was reached.
   *
   * Returns whether this call performed the transition, so a caller that lost a
   * race does not proceed as though it had.
   *
   * @requiresTransaction
   */
  cancelChallenge(id: ChallengeId): Promise<boolean>;

  /**
   * How many challenges were issued for this target and purpose since an
   * instant — the input to `maxIssuesPerTargetPerWindow`.
   *
   * Counts every challenge regardless of its current state: each row is one
   * issuance that happened, and a code that was answered, expired or replaced
   * was still sent to that destination. Counting only open ones would make the
   * limit trivially resettable by answering wrongly.
   */
  countIssuedSince(
    contactKind: ContactKind,
    normalizedValue: string,
    purpose: VerificationPurpose,
    since: Date,
  ): Promise<number>;
}
