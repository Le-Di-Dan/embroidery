/**
 * The `design.approve` idempotency key (`APP6-G01` §10, GRD-012 / GRD-030).
 *
 * The binding is already accepted authority and is restated here rather than
 * re-decided:
 *
 * ```text
 * namespace   = design.approve
 * scope       = the exact design version
 * fingerprint = version id + document hash + terms version
 * replay      = the existing Approval Snapshot
 * ```
 *
 * ### The scope key is the version id itself, not a hash of it
 *
 * The same rule `quotation-accept-idempotency.ts` records: the scope key is what
 * makes two calls *the same operation*, and a customer's second click on the
 * same design is the same operation exactly when it names the same version. A
 * version id is already opaque, already unique and already server-chosen, so
 * hashing it would only make the row unreadable to an operator diagnosing a
 * stuck claim.
 *
 * This also means there is **no `Idempotency-Key` header** on either B11 route.
 * A caller-supplied key would let two customers' clicks share a scope, or one
 * customer's approval and revision request collapse into one.
 *
 * ### "Terms version", for a set of agreements
 *
 * `DB3_IDEMPOTENCY_SPECIFICATION.md` names a singular *terms version*, and
 * `APP6-G01-C1` §5.1 makes the required set **data** — today two types, tomorrow
 * however many an operator publishes. The faithful reading of one authority
 * under the other is therefore *the exact set of agreement versions this
 * approval binds*, and {@link canonicalApproveTerms} is how that set becomes a
 * single value.
 *
 * It is a **set**, so the encoding sorts. The customer's client sends an array,
 * and array order is a rendering decision — `APP6-B10` returns the agreements in
 * the policy's published type order, but a retry assembled from a re-rendered
 * screen, or from a client that mapped over its own state, can legitimately
 * order them differently. Two submissions that bind the identical evidence must
 * replay, not raise `IDEMPOTENCY_CONFLICT`, so ordering is normalised away here
 * rather than being allowed to manufacture a conflict.
 *
 * The pairing of id and hash is what is sorted, not the ids alone: an id whose
 * content hash differs is different evidence, and must not share a fingerprint
 * with the version it was superseded by.
 *
 * ### The document hash is the stored one
 *
 * The caller submits a hash and GRD-007 requires it to equal
 * `design_versions.document_hash`; the value that reaches this function is the
 * **stored** one, read off the locked row. A fingerprint built from the client's
 * copy would let a mismatched submission claim the scope with a fingerprint no
 * legitimate retry could reproduce — and `APP6-B11` §16 requires a refused first
 * attempt to leave no poisoned record.
 *
 * ### The encoding is spelled out
 *
 * Two runs over the same facts must produce the same bytes. Every field is
 * length-prefixed and joined in a fixed order, so `"ab" + "c"` and `"a" + "bc"`
 * cannot collide — the rule `submission-fingerprint.ts` and
 * `quotation-accept-idempotency.ts` both record.
 */
import { createHash } from 'node:crypto';

/** `DB3_IDEMPOTENCY_SPECIFICATION.md`'s namespace for this action. */
export const DESIGN_APPROVE_NAMESPACE = 'design.approve';

/**
 * How long a claim on this scope may sit `IN_PROGRESS` before a sweep may
 * reclaim it.
 *
 * Generous relative to the transaction, which is a handful of statements: the
 * TTL exists so a process killed mid-approval does not block the customer's
 * retry forever, not to bound normal work.
 */
export const DESIGN_APPROVE_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

/** One accepted term, as the fingerprint sees it. */
export interface AcceptedTermsEvidence {
  readonly agreementVersionId: string;
  readonly contentHash: string;
}

export interface ApproveFingerprintInput {
  readonly versionId: string;
  /** The version's own stored `document_hash`, never the caller's copy. */
  readonly documentHash: string;
  readonly acceptedAgreements: readonly AcceptedTermsEvidence[];
}

/**
 * The agreement set as one canonical value.
 *
 * Exported so a test can assert the set semantics directly rather than
 * inferring them from two fingerprints happening to match.
 */
export function canonicalApproveTerms(
  acceptedAgreements: readonly AcceptedTermsEvidence[],
): string {
  return acceptedAgreements
    .map((agreement) => `${field(agreement.agreementVersionId)}=${field(agreement.contentHash)}`)
    .slice()
    .sort()
    .join(',');
}

/** The canonical pre-image. Exported so a test can assert the encoding itself. */
export function canonicalApprovePreimage(input: ApproveFingerprintInput): string {
  return [
    field(input.versionId),
    field(input.documentHash),
    field(canonicalApproveTerms(input.acceptedAgreements)),
  ].join('|');
}

export function approveFingerprint(input: ApproveFingerprintInput): string {
  return `sha256:${createHash('sha256')
    .update(canonicalApprovePreimage(input), 'utf8')
    .digest('hex')}`;
}

/** Length-prefixed, so no two field sequences can share a pre-image. */
function field(value: string): string {
  return `${value.length}:${value}`;
}
