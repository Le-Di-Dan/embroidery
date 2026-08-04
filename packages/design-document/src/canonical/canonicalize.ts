/**
 * The canonicalization pipeline and its one ordering rule.
 *
 * ```text
 * schema version → structure → quantization → revalidation → canonical bytes
 * ```
 *
 * Revalidation after quantization is not belt-and-braces. Quantization can move
 * a value across a boundary — a width of `0.00004` rounds to `0`, which the
 * schema forbids — so a document validated only before rounding could be
 * canonicalized in a state it never passed. And the 512 KiB ceiling is defined
 * on canonical bytes, which do not exist until the end.
 */
import { validateCanonicalSize, validateDesignDocumentComplexity } from '../validation/complexity';
import { validateDesignDocumentStructure } from '../validation/structure';
import { quantizeDesignDocument } from '../quantization/quantize';
import type { DesignDocument } from '../schema/document';
import {
  failed,
  finding,
  ok,
  type DesignDocumentFinding,
  type DesignDocumentResult,
} from '../findings/finding';
import { DesignDocumentCanonicalizationError, canonicalJsonToBytes, canonicalizeJson } from './jcs';

/** Canonical text for a document that is already valid and quantized. */
export function canonicalizeDesignDocument(document: DesignDocument): string {
  return canonicalizeJson(document);
}

/** Canonical UTF-8 bytes — the exact input a hash is taken over. */
export function canonicalizeDesignDocumentToBytes(document: DesignDocument): Uint8Array {
  return canonicalJsonToBytes(canonicalizeDesignDocument(document));
}

export interface PreparedDesignDocument {
  /** The validated, quantized document. Never the caller's object. */
  readonly document: DesignDocument;
  readonly canonical: string;
  readonly canonicalBytes: Uint8Array;
}

/**
 * Runs an untrusted payload through the whole pipeline.
 *
 * Contextual validation (derivative eligibility, decoded pixels, fonts) is
 * deliberately *not* folded in here: it needs caller-supplied authority that
 * this package must never fetch for itself, so a caller runs
 * `validateDesignDocumentContext` alongside this and merges the findings.
 */
export function prepareDesignDocument(
  payload: unknown,
): DesignDocumentResult<PreparedDesignDocument> {
  const structural = validateDesignDocumentStructure(payload);
  if (!structural.ok) return structural;

  const complexity = validateDesignDocumentComplexity(structural.value);
  if (complexity.length > 0) return failed(complexity);

  const document = quantizeDesignDocument(structural.value);

  // Quantization can round a value onto a boundary the schema rejects, so the
  // rounded document is validated as if it had arrived that way.
  const revalidated = validateDesignDocumentStructure(document);
  if (!revalidated.ok) return revalidated;

  const recheck = validateDesignDocumentComplexity(revalidated.value);
  if (recheck.length > 0) return failed(recheck);

  let canonical: string;
  let canonicalBytes: Uint8Array;
  try {
    canonical = canonicalizeDesignDocument(revalidated.value);
    canonicalBytes = canonicalJsonToBytes(canonical);
  } catch (error: unknown) {
    const message =
      error instanceof DesignDocumentCanonicalizationError
        ? error.message
        : 'The document could not be canonicalized.';
    // The message names a path and a kind; it never carries the document.
    const failure: DesignDocumentFinding = finding('CANONICALIZATION_FAILED', '$', message);
    return failed([failure]);
  }

  const size = validateCanonicalSize(canonicalBytes.byteLength);
  if (size.length > 0) return failed(size);

  return ok({ document: revalidated.value, canonical, canonicalBytes });
}
