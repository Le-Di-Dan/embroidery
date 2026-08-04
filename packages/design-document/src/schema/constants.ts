/**
 * Locked numeric authority for the Design Document (IMP-D044 PO-09, §6.7).
 *
 * Every value here is a Product Owner ruling, not a tuning knob. `APP3-G04`
 * says in as many words that no checkpoint may raise one quietly, so they live
 * as named constants that a gate can read rather than as literals scattered
 * through validation code.
 */

/** The only document schema version this build writes (ADR-DB1-012 §4). */
export const CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION = 1;

/** Versions this build can read. Backward-read grows this list, never shrinks it. */
export const SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS: readonly number[] = Object.freeze([1]);

/**
 * Document complexity limits (IMP-D044 PO-09).
 *
 * Hidden, locked and off-canvas elements count: visibility is a display fact,
 * not an exemption, and a document that is only legal while something is hidden
 * would become illegal the moment a customer unhid it.
 */
export const DESIGN_DOCUMENT_LIMITS = Object.freeze({
  /** Canonical serialized bytes, measured after quantization and canonicalization. */
  maxCanonicalBytes: 524_288,
  maxElements: 100,
  maxImageElements: 20,
  maxTextElements: 80,
  /** Distinct referenced Assets; a repeated reference counts once. */
  maxUniqueAssets: 20,
  maxGroupDepth: 8,
  maxCharactersPerTextElement: 500,
  maxTotalTextCharacters: 5_000,
  /** Summed across unique referenced image derivatives, not per element. */
  maxDecodedPixels: 33_554_432,
});

/** Bounded freehand geometry. A point sequence is document data, not a stroke model. */
export const DESIGN_DOCUMENT_FREEHAND_LIMITS = Object.freeze({
  minPoints: 2,
  maxPoints: 5_000,
});

/** Ranges every element shares. */
export const DESIGN_DOCUMENT_VALUE_RANGES = Object.freeze({
  minOpacity: 0,
  maxOpacity: 1,
  minFontSizePx: 1,
  maxFontSizePx: 1_000,
  minFontWeight: 100,
  maxFontWeight: 900,
});

/** The single editor-safe derivative kind and status a document may reference. */
export const ELIGIBLE_DERIVATIVE_KIND = 'NORMALIZED';
export const ELIGIBLE_DERIVATIVE_STATUS = 'READY';
