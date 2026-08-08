/**
 * `@embroidery/design-document` — the engine-neutral Design Document.
 *
 * This root export is **browser-safe**: no framework, no renderer, no DOM, no
 * database, no filesystem and no Node built-in is reachable from here. Hashing
 * lives behind `@embroidery/design-document/server` and is deliberately not
 * re-exported, so importing this module into a Storefront bundle cannot pull
 * `node:crypto` in with it.
 *
 * What is intentionally absent is as much a decision as what is present:
 * geometry, bounds, px↔mm conversion and transform composition belong to
 * `@embroidery/design-engine` (`APP3-P02`), and nothing here computes them
 * under another name.
 */

// Types
export type { DesignDocument, DesignPlacementSnapshot } from './schema/document';
export type {
  DesignElement,
  DesignElementBase,
  DesignElementTransform,
  DesignElementType,
  FontStyle,
  FreehandElement,
  FreehandPoint,
  GroupElement,
  ImageElement,
  ShapeElement,
  ShapeKind,
  TextAlign,
  TextElement,
} from './schema/elements';

// Schema and complexity constants
export {
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  DESIGN_DOCUMENT_FREEHAND_LIMITS,
  DESIGN_DOCUMENT_LIMITS,
  DESIGN_DOCUMENT_VALUE_RANGES,
  ELIGIBLE_DERIVATIVE_KIND,
  ELIGIBLE_DERIVATIVE_STATUS,
  SUPPORTED_DESIGN_DOCUMENT_SCHEMA_VERSIONS,
} from './schema/constants';

// The generated structural schema (`APP3-B08-C1`). Data only — no validator,
// no dependency, and no second definition of the shape: it is derived from the
// TypeScript types above by `scripts/generate-schema.mjs`.
export { DESIGN_DOCUMENT_JSON_SCHEMA, DESIGN_DOCUMENT_SCHEMA_ROOT_TYPE } from './schema/generated';
export type { DesignDocumentJsonSchema, DesignDocumentSchemaNode } from './schema/generated';

// Typed findings
export type {
  DesignDocumentFinding,
  DesignDocumentFindingCode,
  DesignDocumentResult,
  FindingMetadata,
} from './findings/finding';

// Validation
export { readSchemaVersion, validateDesignDocumentStructure } from './validation/structure';
export { validateCanonicalSize, validateDesignDocumentComplexity } from './validation/complexity';
export { validateDesignDocumentContext } from './validation/context';
export type { DerivativeAuthorityRecord, DesignDocumentContext } from './validation/context';

// Quantization
export {
  DESIGN_DOCUMENT_QUANTIZATION_AUTHORITY,
  DESIGN_DOCUMENT_QUANTIZATION_DECIMALS,
  DESIGN_DOCUMENT_QUANTIZATION_SCALE,
  DESIGN_DOCUMENT_QUANTIZATION_STEP,
  DesignDocumentQuantizationError,
  QUANTIZED_FIELDS,
  quantizeDesignDocument,
  quantizeNumber,
} from './quantization/quantize';

// Canonicalization
export {
  canonicalizeDesignDocument,
  canonicalizeDesignDocumentToBytes,
  prepareDesignDocument,
} from './canonical/canonicalize';
export type { PreparedDesignDocument } from './canonical/canonicalize';
export { DesignDocumentCanonicalizationError } from './canonical/jcs';

// Document migration
export {
  DESIGN_DOCUMENT_MIGRATIONS,
  DesignDocumentMigrationRegistryError,
  migrateDesignDocument,
} from './migration/registry';
export type { DesignDocumentMigrationStep } from './migration/registry';

// Controlled font registry
export {
  DESIGN_FONT_REGISTRY,
  DESIGN_FONT_REGISTRY_VERSION,
  INTER_CONTROLLED_FONT,
  findControlledFont,
  supportsVariant,
} from './fonts/registry';
export type { ControlledFont, ControlledFontFile, FontFallbackPolicy } from './fonts/registry';
