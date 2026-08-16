/**
 * The `request.submit` fingerprint (`APP5-G01` §4.2, `G01-D02`, GRD-030).
 *
 * The fingerprint decides whether a second call on the same scope key is a
 * **replay** of the same submission or an `IDEMPOTENCY_CONFLICT`, so its inputs
 * are exactly G01's, in G01's order:
 *
 *   1. the branch — `CATALOG` | `COP`;
 *   2. catalog: `productId`, `productVariantId`, `designSessionId`;
 *      COP: `name`, `description`, `physicalWidthMm`, `physicalHeightMm`;
 *   3. the quantity lines, ordered canonically by `(productVariantId, sizeLabel)`.
 *
 * ### Deliberately excluded
 *
 * `customerNote` and attachment asset ids, so an incidental difference cannot
 * turn a retry into a conflict — and, as a **recorded deviation from
 * `DB3_IDEMPOTENCY_SPECIFICATION.md`**, the design document hash. The document
 * is server-derived from a session that autosaves concurrently (TR-LC07-02,
 * `CC-01`) and that this very transaction moves `ACTIVE → SUBMITTED`; including
 * its hash would make the same submission, retried moments later against a newer
 * autosave revision, a conflict rather than a replay — inverting the guarantee
 * the contract exists to provide. `designSessionId` is a stronger and stable
 * binding to the same design content.
 *
 * ### Why the encoding is spelled out rather than borrowed
 *
 * Two runs over the same facts must produce the same bytes, and `JSON.stringify`
 * does not promise that across shapes. The asset module's `canonical-json.ts`
 * solves the same problem for `CTX-AST`; reaching across a bounded context for a
 * runtime helper — or lifting it into a shared package — is a wider change than
 * this checkpoint owns, and the G01 fingerprint is a fixed, small tuple rather
 * than arbitrary JSON. So every field is length-prefixed and joined in a fixed
 * order below: `"ab" + "c"` and `"a" + "bc"` cannot collide, and an absent
 * optional field is distinguishable from an empty one.
 */
import { createHash } from 'node:crypto';

import type { SubmissionSubject } from './submission-subject';

/** One quantity line, as it will be persisted. */
export interface FingerprintQuantityLine {
  readonly productVariantId: string | undefined;
  readonly sizeLabel: string | undefined;
  readonly quantity: number;
}

export interface SubmissionFingerprintInput {
  readonly subject: SubmissionSubject;
  readonly breakdown: readonly FingerprintQuantityLine[];
}

/** `sha256:` + 64 lowercase hex, matching every other digest in the repository. */
export const SUBMISSION_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Length-prefixes one field.
 *
 * `undefined` encodes as `-` rather than as a zero-length string, so an omitted
 * COP description and an empty one are different submissions.
 */
function field(value: string | undefined): string {
  return value === undefined ? '-:' : `${String(value.length)}:${value}`;
}

/** `G01-D02` step 3 — the canonical line order, independent of client order. */
function canonicalLines(
  breakdown: readonly FingerprintQuantityLine[],
): readonly FingerprintQuantityLine[] {
  return [...breakdown].sort((left, right) => {
    const variant = (left.productVariantId ?? '').localeCompare(right.productVariantId ?? '');
    if (variant !== 0) {
      return variant;
    }
    return (left.sizeLabel ?? '').localeCompare(right.sizeLabel ?? '');
  });
}

function subjectFields(subject: SubmissionSubject): readonly (string | undefined)[] {
  if (subject.branch === 'CATALOG') {
    return [subject.productId, subject.productVariantId, subject.designSessionId];
  }
  const { product } = subject;
  return [product.name, product.description, product.physicalWidthMm, product.physicalHeightMm];
}

/** The canonical pre-image. Exported so a test can assert the encoding itself. */
export function canonicalSubmissionPreimage(input: SubmissionFingerprintInput): string {
  const parts: string[] = [field(input.subject.branch), ...subjectFields(input.subject).map(field)];
  for (const line of canonicalLines(input.breakdown)) {
    parts.push(field(line.productVariantId), field(line.sizeLabel), field(String(line.quantity)));
  }
  return parts.join('|');
}

export function submissionFingerprint(input: SubmissionFingerprintInput): string {
  return `sha256:${createHash('sha256')
    .update(canonicalSubmissionPreimage(input), 'utf8')
    .digest('hex')}`;
}
