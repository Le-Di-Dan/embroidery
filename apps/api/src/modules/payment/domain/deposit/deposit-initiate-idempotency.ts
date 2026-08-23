/**
 * The `payment.initiate` idempotency binding (`APP7-G01` §10, GRD-012/GRD-030).
 *
 * `DB3_IDEMPOTENCY_SPECIFICATION.md` already fixes it, and it is restated here
 * rather than re-decided:
 *
 * ```text
 * namespace   = payment.initiate
 * scope       = (the exact DEPOSIT obligation, the caller's attempt key)
 * fingerprint = amount + method
 * replay      = the attempt reference
 * ```
 *
 * ### Why the scope has a caller half at all
 *
 * `quotation.accept` scopes on the version id alone, because a customer clicking
 * accept twice on one offer is the same operation by definition. Initiation is
 * not like that: LC-16 says a **retry is a new attempt**, so two initiations
 * against one obligation are sometimes the same operation and sometimes
 * deliberately are not, and only the caller knows which. The client attempt key
 * is what distinguishes them — server-validated by `parseIdempotencyKey`,
 * exactly as the three shipped upload lanes validate theirs, so a malformed or
 * absent key is a refusal rather than a silent collapse of two distinct retries
 * into one.
 *
 * The obligation half is what stops one client key from reaching across orders:
 * two customers reusing `attempt-1` land in different scopes because the
 * obligation id is part of the hash.
 *
 * ### The raw key never reaches the database
 *
 * `scope_key` stores a SHA-256 of `payment-initiate:{obligationId}:{key}`, the
 * construction `APP5-B02` uses. The stored arbiter stays exactly as selective
 * while a table dump becomes useless for replaying someone else's initiation.
 * The obligation id is a UUID and contains no colon, so the two separators
 * always delimit the same three parts and no two distinct (obligation, key)
 * pairs can collide.
 *
 * ### The fingerprint
 *
 * `amount` and `method`, which is what DB3 names. Given the scope it is nearly
 * redundant — the amount comes from the frozen obligation and the method is the
 * constant `BANK_TRANSFER` — and that is the useful kind of redundancy: if a
 * future change ever did let an obligation amount move, the
 * `IDEMPOTENCY_CONFLICT` this raises is exactly the outcome anyone would want,
 * rather than a silent replay of an attempt for a different sum. The amount is
 * used as the **exact stored string**, never parsed and never reformatted,
 * because `1500000.00` and `1500000.0` are the same money and must not be the
 * same fingerprint by accident of parsing.
 */
import { createHash } from 'node:crypto';

/** `DB3_IDEMPOTENCY_SPECIFICATION.md`'s namespace for TR-LC16-01. */
export const PAYMENT_INITIATE_NAMESPACE = 'payment.initiate';

/**
 * How long a claim may sit `IN_PROGRESS` before a sweep may reclaim it.
 *
 * Generous relative to the transaction, which is a handful of statements: the
 * TTL exists so a process killed mid-initiation does not block the customer's
 * retry forever, not to bound normal work. Matches `quotation.accept`.
 */
export const PAYMENT_INITIATE_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

/** Builds the stored scope key. The raw client key is never stored or logged. */
export function initiateScopeKey(obligationId: string, attemptKey: string): string {
  return sha256Hex(`payment-initiate:${obligationId}:${attemptKey}`);
}

export interface InitiateFingerprintInput {
  /** The DEPOSIT obligation's own amount, as stored. */
  readonly amount: string;
  /** The attempt method — `BANK_TRANSFER` for every APP7 initiation. */
  readonly method: string;
}

/** The canonical pre-image. Exported so a test can assert the encoding itself. */
export function canonicalInitiatePreimage(input: InitiateFingerprintInput): string {
  return [field(input.amount), field(input.method)].join('|');
}

export function initiateFingerprint(input: InitiateFingerprintInput): string {
  return `sha256:${sha256Hex(canonicalInitiatePreimage(input))}`;
}

/** Length-prefixed, so no two field sequences can share a pre-image. */
function field(value: string): string {
  return `${value.length}:${value}`;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
