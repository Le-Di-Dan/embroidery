/**
 * The terminal outcomes of a normalization attempt (`APP3-W01A`).
 *
 * Three families, and the distinction between them is the whole operational
 * story:
 *
 * - **context** — the association that authorized the request no longer says
 *   what it said. Non-retryable: retrying cannot make a retired Product Side
 *   current again, and treating it as infrastructure would keep a dead event
 *   alive until the attempt cap (`IMP-D046` PO-09).
 * - **media** — the bytes are not something an editor may open. Also
 *   non-retryable, and also not a fault of the store.
 * - **staged capability** — Template SVG. Authorized by IMP-D044 and merely
 *   unavailable until `APP3-G07` selects a sanitizer and `APP3-W01B` implements
 *   it. Reported as its own outcome precisely so it is never mistaken for
 *   "unsupported type", which is what would make a later capability look like a
 *   product change.
 *
 * Infrastructure failures are **not** here: they stay with the accepted
 * `storage-failure.ts` classification and the runtime's backoff.
 *
 * Every message is fixed text. None names an object key, a bucket, an owner, a
 * session, a customer or a byte of content.
 */

export const NORMALIZATION_OUTCOME_CODES = [
  'NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE',
  'TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE',
  'NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED',
  'NORMALIZATION_SOURCE_TOO_LARGE',
  'NORMALIZATION_DIMENSIONS_EXCEEDED',
  'NORMALIZATION_PIXEL_BUDGET_EXCEEDED',
  'NORMALIZATION_SOURCE_UNDECODABLE',
  'NORMALIZATION_SOURCE_ANIMATED',
  'NORMALIZATION_SOURCE_INTEGRITY_MISMATCH',
] as const;

export type NormalizationOutcomeCode = (typeof NORMALIZATION_OUTCOME_CODES)[number];

const MESSAGES: Record<NormalizationOutcomeCode, string> = {
  NORMALIZATION_CONTEXT_NO_LONGER_ELIGIBLE:
    'The placement, template or session context that requested this normalization is no longer eligible.',
  TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE:
    'Template SVG normalization is not available in this deployment.',
  NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED: 'That media type cannot be normalized for the editor.',
  NORMALIZATION_SOURCE_TOO_LARGE: 'The source file is larger than the editor upload limit.',
  NORMALIZATION_DIMENSIONS_EXCEEDED: 'The image is larger than the editor dimension limit.',
  NORMALIZATION_PIXEL_BUDGET_EXCEEDED: 'The image exceeds the editor decoded-pixel budget.',
  NORMALIZATION_SOURCE_UNDECODABLE: 'The source image could not be decoded.',
  NORMALIZATION_SOURCE_ANIMATED: 'Animated or multi-page images cannot be normalized.',
  NORMALIZATION_SOURCE_INTEGRITY_MISMATCH:
    'The stored source no longer matches the recorded asset facts.',
};

/**
 * A terminal, non-retryable outcome carried as data.
 *
 * Deliberately not a `WorkerJobError`: this is a *verdict about the request*,
 * and the use case records it and completes. An exception here would put a
 * business decision on the runtime's failure path, where the retry policy —
 * which knows nothing about associations — would get to decide whether to try
 * again.
 */
export class NormalizationRejection extends Error {
  readonly code: NormalizationOutcomeCode;

  constructor(code: NormalizationOutcomeCode) {
    super(MESSAGES[code]);
    this.name = 'NormalizationRejection';
    this.code = code;
  }
}

export function normalizationRejection(code: NormalizationOutcomeCode): NormalizationRejection {
  return new NormalizationRejection(code);
}

export function isNormalizationRejection(error: unknown): error is NormalizationRejection {
  return error instanceof NormalizationRejection;
}

/** The bounded evidence a rejected attempt records. Codes only, never content. */
export function rejectionDetail(code: NormalizationOutcomeCode): string {
  return JSON.stringify({ outcome: code });
}
