/**
 * The `quotation.accept` idempotency key (`APP6-G01` §10, GRD-012 / GRD-030).
 *
 * The binding is already accepted authority and is restated here rather than
 * re-decided:
 *
 * ```text
 * namespace   = quotation.accept
 * scope       = the exact quotation version
 * fingerprint = version id + accepted total
 * replay      = the existing acceptance evidence
 * ```
 *
 * ### The scope key is the version id itself, not a hash of it
 *
 * `APP5-B01` hashes nothing into its scope key either — it uses the verified
 * challenge id — and the reason is the same: the scope key is what makes two
 * calls *the same operation*, and a customer's second click on the same offer is
 * the same operation exactly when it names the same version. A version id is
 * already opaque, already unique and already server-chosen, so hashing it would
 * only make the row unreadable to an operator diagnosing a stuck claim.
 *
 * This also means there is **no `Idempotency-Key` header** on either B05 route.
 * A caller-supplied key would let two different customers' clicks share a scope,
 * or one customer's two decisions on two versions collapse into one — and the
 * accepted contract does not ask for one.
 *
 * ### Why the total is in the fingerprint at all
 *
 * Given the scope, it is redundant: a sent version's amounts are frozen by
 * `trg_quotation_versions__reject_mutation`, so one version id implies one
 * total, and `IDEMPOTENCY_CONFLICT` is therefore unreachable through the
 * delivered write paths. It is included because the accepted contract names it,
 * and because the redundancy is the useful kind — if a future migration ever did
 * make a sent total mutable, the conflict this raises is exactly the outcome
 * anyone would want, rather than a silent replay of an acceptance for a
 * different amount.
 *
 * ### The encoding is spelled out
 *
 * Two runs over the same facts must produce the same bytes. Both fields are
 * length-prefixed and joined in a fixed order, so `"ab" + "c"` and `"a" + "bc"`
 * cannot collide — the rule `submission-fingerprint.ts` records for the same
 * reason. The amount is used as the **exact stored string**: no `Number()`, no
 * normalisation and no re-formatting, because `1500000.00` and `1500000.0` are
 * the same money and must not be the same fingerprint by accident of parsing.
 */
import { createHash } from 'node:crypto';

/** `DB3_IDEMPOTENCY_SPECIFICATION.md`'s namespace for this action. */
export const QUOTATION_ACCEPT_NAMESPACE = 'quotation.accept';

/**
 * How long a claim on this scope may sit `IN_PROGRESS` before a sweep may
 * reclaim it.
 *
 * Generous relative to the transaction, which is a handful of statements: the
 * TTL exists so a process killed mid-accept does not block the customer's retry
 * forever, not to bound normal work.
 */
export const QUOTATION_ACCEPT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export interface AcceptFingerprintInput {
  readonly versionId: string;
  /** The frozen version's own `total_amount`, as stored. */
  readonly acceptedTotalAmount: string;
}

/** The canonical pre-image. Exported so a test can assert the encoding itself. */
export function canonicalAcceptPreimage(input: AcceptFingerprintInput): string {
  return [field(input.versionId), field(input.acceptedTotalAmount)].join('|');
}

export function acceptFingerprint(input: AcceptFingerprintInput): string {
  return `sha256:${createHash('sha256')
    .update(canonicalAcceptPreimage(input), 'utf8')
    .digest('hex')}`;
}

/** Length-prefixed, so no two field sequences can share a pre-image. */
function field(value: string): string {
  return `${value.length}:${value}`;
}
