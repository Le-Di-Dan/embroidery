/**
 * Locked numeric authority for the Design Document (IMP-D044 PO-09, §6.7).
 *
 * Every value here is a Product Owner ruling, not a tuning knob. `APP3-G04`
 * says in as many words that no checkpoint may raise one quietly, so they live
 * as named constants that a gate can read rather than as literals scattered
 * through validation code.
 */

/**
 * The schema version the **Studio and Template** path writes (ADR-DB1-012 §4).
 *
 * Deliberately still `1` after `APP6-B08`. `ADR-APP6-001` §3.4 rule 3 says in as
 * many words that *"the Catalog/Studio path keeps emitting the version it emits
 * today"* and that APP3 is not modified, and this constant is how that promise
 * is kept: `DesignDocumentAuthority`, `TemplateDocumentAuthority` and
 * `TemplatePublicationAuthority` each pin an incoming document to `=== CURRENT`,
 * so raising it here would both start emitting v2 into Catalog Sessions and
 * refuse every already-persisted v1 Session and Template document on its next
 * save. The widening rides {@link SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS}
 * instead — which is the mechanism §3.4 rule 2 names.
 *
 * A useful side effect of leaving it alone: those same three `=== CURRENT` pins
 * now *reject* a v2 branch-capable document from ever entering a Catalog Session
 * or Template, with no APP3 edit at all.
 */
export const CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION = 1;

/**
 * The schema version a **formal Design Version** may use to express placement
 * absence (`ADR-APP6-001` §3.4, `APP6-B08`).
 *
 * v2 differs from v1 in exactly one respect: `placement.productSideId` and
 * `placement.embroideryAreaId` may be explicit `null`, and they are null
 * **together or not at all**. That complete pair is the branch —
 *
 * ```text
 * both non-null = Catalog
 * both null     = customer-owned product
 * mixed         = invalid
 * ```
 *
 * — so no `branch` discriminator field is added: a second way to say the same
 * thing is a second thing that can disagree.
 *
 * It is not a "newer v1". A v1 document is not stale and is never rewritten into
 * one of these: a Catalog formal version authored from a v1 submitted Session
 * document stays v1, byte for byte, and only the customer-owned-product branch —
 * which could not be written at v1 at all — is authored here.
 */
export const BRANCHED_PLACEMENT_DESIGN_DOCUMENT_SCHEMA_VERSION = 2;

/**
 * Versions this build can read. Backward-read grows this list, never shrinks it.
 *
 * Note it is a superset of, not a synonym for, "the version this build writes":
 * a reader admits both, while each writer picks the one its own branch requires.
 */
export const SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS: readonly number[] = Object.freeze([
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  BRANCHED_PLACEMENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
]);

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
