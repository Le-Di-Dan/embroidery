/**
 * Spike-level document validation. Proves the hard gates from the checkpoint:
 * unknown schema versions fail loudly, transient runtime state can never enter
 * the document, and no engine-native or DOM value survives a round trip.
 */
import { SPIKE_SCHEMA_VERSION, type DesignElement, type SpikeDesignDocument } from './types';

export class DocumentValidationError extends Error {}

/**
 * Keys that belong to a renderer, a browser or a preview policy — never to the
 * customer document. Any of them anywhere in the payload is a hard failure.
 */
const FORBIDDEN_KEYS = new Set([
  'selected',
  'selection',
  'hovered',
  'handles',
  'activeTool',
  'viewport',
  'zoom',
  'panXPx',
  'panYPx',
  'watermark',
  'watermarkMarker',
  '_konva',
  '_fabric',
  'canvas',
  'node',
  'element',
  'objectURL',
  'dataUrl',
  'originalUrl',
  '__proto__',
]);

const ELEMENT_TYPES = new Set(['text', 'image', 'svg', 'shape', 'group']);

function assertNoForbiddenKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoForbiddenKeys(item, `${path}[${index}]`);
    });
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new DocumentValidationError(`Transient or engine-owned key "${key}" at ${path}.`);
    }
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

function assertJsonSafe(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertJsonSafe(item, `${path}[${index}]`);
    });
    return;
  }
  if (value === null) {
    return;
  }
  const kind = typeof value;
  if (kind === 'function' || kind === 'symbol' || kind === 'bigint' || kind === 'undefined') {
    throw new DocumentValidationError(`Value at ${path} is not JSON-interoperable (${kind}).`);
  }
  if (kind === 'number' && !Number.isFinite(value)) {
    throw new DocumentValidationError(`Non-finite number at ${path}.`);
  }
  if (kind === 'string' && (value as string).normalize('NFC') !== value) {
    throw new DocumentValidationError(`String at ${path} is not Unicode NFC.`);
  }
  if (kind !== 'object') {
    return;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new DocumentValidationError(
      `Value at ${path} is a class instance, DOM node or engine node, not plain data.`,
    );
  }
  for (const [key, child] of Object.entries(value as object)) {
    assertJsonSafe(child, `${path}.${key}`);
  }
}

function assertElement(element: DesignElement, index: number, ids: Set<string>): void {
  const path = `$.elements[${index}]`;
  if (typeof element.id !== 'string' || element.id.length === 0) {
    throw new DocumentValidationError(`Missing stable element id at ${path}.`);
  }
  if (ids.has(element.id)) {
    throw new DocumentValidationError(`Duplicate element id "${element.id}" at ${path}.`);
  }
  ids.add(element.id);
  if (!ELEMENT_TYPES.has(element.type)) {
    throw new DocumentValidationError(`Unknown element type "${element.type}" at ${path}.`);
  }
  if (element.opacity < 0 || element.opacity > 1) {
    throw new DocumentValidationError(`Opacity out of range at ${path}.`);
  }
}

/** Parses an untrusted payload into a document, or throws. */
export function parseDocument(payload: unknown): SpikeDesignDocument {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new DocumentValidationError('Document payload must be an object.');
  }
  const candidate = payload as Partial<SpikeDesignDocument>;
  if (candidate.schemaVersion !== SPIKE_SCHEMA_VERSION) {
    throw new DocumentValidationError(
      `Unsupported schemaVersion ${String(candidate.schemaVersion)}; this build reads ${String(SPIKE_SCHEMA_VERSION)}.`,
    );
  }
  assertNoForbiddenKeys(payload, '$');
  assertJsonSafe(payload, '$');
  if (!Array.isArray(candidate.elements)) {
    throw new DocumentValidationError('Document.elements must be an array (z-order).');
  }
  const ids = new Set<string>();
  const elements = candidate.elements as readonly DesignElement[];
  elements.forEach((element, index) => {
    assertElement(element, index, ids);
  });
  return candidate as SpikeDesignDocument;
}

/** Semantic equality used by the round-trip proof (order-significant). */
export function isSemanticallyEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortDeep(left)) === JSON.stringify(sortDeep(right));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (typeof value !== 'object' || value === null) {
    return typeof value === 'number' ? Math.round(value * 10_000) / 10_000 : value;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortDeep((value as Record<string, unknown>)[key]);
  }
  return out;
}
