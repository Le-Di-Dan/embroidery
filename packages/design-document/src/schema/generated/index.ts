/**
 * The generated Design Document JSON Schema, as a typed export (`APP3-B08-C1`).
 *
 * The JSON beside this file is produced by `scripts/generate-schema.mjs` from
 * the P01 TypeScript types and must never be hand-edited. This module only
 * gives it a name and a narrow type so consumers — currently the API's OpenAPI
 * augmentation — can reference it without reaching into the package layout or
 * re-reading it from disk.
 *
 * Nothing here validates. `APP3-P01`'s imperative validators remain the semantic
 * authority: the schema states the structure TypeScript expresses, and the rules
 * TypeScript cannot express (NFC, non-empty strings, non-zero scale factors,
 * value ranges, point-count bounds) live only in those validators. A consumer
 * that treated this as a complete acceptance test would accept documents P01
 * rejects.
 */
import schema from './design-document.schema.json';

/** A JSON Schema node, only as deeply as consumers need to walk it. */
export interface DesignDocumentSchemaNode {
  /**
   * A single JSON Schema type, or the array form the generator emits for a
   * nullable field (`["string", "null"]`, `APP6-B08`).
   *
   * Both spellings are the generator's, not a choice made here: widening this
   * to match is how the typed export keeps describing whatever the types
   * produce. The API's OpenAPI augmentation is what translates the array form
   * into 3.0's `nullable` keyword.
   */
  readonly type?: string | readonly string[];
  readonly $ref?: string;
  readonly anyOf?: readonly DesignDocumentSchemaNode[];
  readonly items?: DesignDocumentSchemaNode;
  readonly properties?: Readonly<Record<string, DesignDocumentSchemaNode>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly description?: string;
}

export interface DesignDocumentJsonSchema {
  /** Points at the root definition, e.g. `#/definitions/DesignDocument`. */
  readonly $ref: string;
  readonly definitions: Readonly<Record<string, DesignDocumentSchemaNode>>;
}

/** The exported P01 type the schema is rooted at. */
export const DESIGN_DOCUMENT_SCHEMA_ROOT_TYPE = 'DesignDocument';

// TypeScript already infers the imported JSON as a structurally compatible
// shape, so the annotation alone pins the contract and a cast would be noise.
export const DESIGN_DOCUMENT_JSON_SCHEMA: DesignDocumentJsonSchema = schema;
