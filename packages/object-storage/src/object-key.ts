/**
 * Deterministic, PII-free object keys (ADR-APP2-001 §4.4).
 *
 *   {environment}/originals/{assetId}/original.{ext}
 *   {environment}/derivatives/{assetId}/{derivativeKind}.{ext}
 *
 * A key is an address, never an authorization token and never a content hash.
 * Nothing derived from user input reaches a key: the extension comes from the
 * validated content type, and the identity is the row's own UUIDv7 — so a raw
 * filename, an email, a customer id or a Windows path can never appear in one.
 *
 * `environment` is the canonical runtime environment verbatim (`development` /
 * `test` / `production`); this package deliberately introduces no abbreviated
 * environment alias, which would be a second source of truth.
 */
import type { ObjectStorageEnvironment } from './object-storage.config';
import { ObjectKeyError } from './object-storage.errors';

export const OBJECT_SCOPES = ['originals', 'derivatives'] as const;

export type ObjectScope = (typeof OBJECT_SCOPES)[number];

/** The closed raster allowlist. SVG and everything else are rejected (ADR §4.6). */
const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  // The sanitized Template SVG derivative (`APP3-W01B`, IMP-D047). Only the
  // key builder learns this type: it is not an intake format, and nothing here
  // makes an SVG deliverable — PO-15 keeps the output private and Template-owned.
  'image/svg+xml': 'svg',
};

export const SUPPORTED_CONTENT_TYPES = Object.freeze(Object.keys(EXTENSION_BY_MIME_TYPE));

const ORIGINAL_OBJECT_NAME = 'original';

/**
 * RFC 9562 UUIDv7: version nibble 7 and variant bits `10xx`. Checking the
 * version matters — a UUIDv4 would still be unique but would lose the
 * time-ordered prefix locality the key layout and prefix sweeps rely on.
 */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Conservative segment charset; length bounded so a key cannot be padded out. */
const DERIVATIVE_KIND_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$/;

const MAX_KEY_LENGTH = 512;
const ASCII_SPACE = 0x20;
const ASCII_DELETE = 0x7f;

export interface OriginalObjectKeyInput {
  readonly environment: ObjectStorageEnvironment;
  readonly assetId: string;
  readonly contentType: string;
}

export interface DerivativeObjectKeyInput extends OriginalObjectKeyInput {
  readonly derivativeKind: string;
}

export interface AssetPrefixInput {
  readonly environment: ObjectStorageEnvironment;
  readonly scope: ObjectScope;
  readonly assetId: string;
}

function assertUuidV7(assetId: string): void {
  if (!UUID_V7_PATTERN.test(assetId)) {
    // The value is echoed only because an asset id is a non-secret surrogate
    // key; it carries no personal data by construction.
    throw new ObjectKeyError(`Invalid assetId "${assetId}": expected a lowercase UUIDv7.`);
  }
}

function extensionFor(contentType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[contentType];
  if (extension === undefined) {
    throw new ObjectKeyError(
      `Unsupported content type "${contentType}": expected one of ` +
        `${SUPPORTED_CONTENT_TYPES.join(', ')}.`,
    );
  }
  return extension;
}

function assertDerivativeKind(derivativeKind: string): void {
  if (!DERIVATIVE_KIND_PATTERN.test(derivativeKind)) {
    throw new ObjectKeyError(
      `Invalid derivative kind "${derivativeKind}": expected 1-64 characters of [A-Za-z0-9_-] ` +
        'starting and ending alphanumeric.',
    );
  }
}

export function buildAssetPrefix(input: AssetPrefixInput): string {
  assertUuidV7(input.assetId);
  return `${input.environment}/${input.scope}/${input.assetId}/`;
}

export function buildOriginalObjectKey(input: OriginalObjectKeyInput): string {
  const extension = extensionFor(input.contentType);
  const prefix = buildAssetPrefix({
    environment: input.environment,
    scope: 'originals',
    assetId: input.assetId,
  });
  return assertValidObjectKey(`${prefix}${ORIGINAL_OBJECT_NAME}.${extension}`);
}

export function buildDerivativeObjectKey(input: DerivativeObjectKeyInput): string {
  assertDerivativeKind(input.derivativeKind);
  const extension = extensionFor(input.contentType);
  const prefix = buildAssetPrefix({
    environment: input.environment,
    scope: 'derivatives',
    assetId: input.assetId,
  });
  return assertValidObjectKey(`${prefix}${input.derivativeKind}.${extension}`);
}

/**
 * Structural gate applied to every key that reaches the provider, including
 * keys the builders produced — so a future builder change cannot introduce a
 * traversal segment without failing here first.
 */
export function assertValidObjectKey(key: string): string {
  if (key === '' || key.length > MAX_KEY_LENGTH) {
    throw new ObjectKeyError(`Invalid object key: expected 1-${MAX_KEY_LENGTH} characters.`);
  }
  if (key.includes('\\')) {
    throw new ObjectKeyError('Invalid object key: backslashes are not permitted.');
  }
  if (key.startsWith('/') || key.endsWith('/')) {
    throw new ObjectKeyError('Invalid object key: a key must not start or end with "/".');
  }
  assertSafeSegments(key);
  return key;
}

/**
 * Prefixes for `listObjectsByPrefix`. A prefix must end with `/` so it cannot
 * straddle a segment boundary: `.../asset-1` would otherwise also match
 * `.../asset-10`, listing a neighbouring asset's objects.
 */
export function assertValidObjectPrefix(prefix: string): string {
  if (prefix === '' || prefix.length > MAX_KEY_LENGTH) {
    throw new ObjectKeyError(`Invalid object prefix: expected 1-${MAX_KEY_LENGTH} characters.`);
  }
  if (prefix.includes('\\')) {
    throw new ObjectKeyError('Invalid object prefix: backslashes are not permitted.');
  }
  if (prefix.startsWith('/') || !prefix.endsWith('/')) {
    throw new ObjectKeyError(
      'Invalid object prefix: it must not start with "/" and must end with "/".',
    );
  }
  assertSafeSegments(prefix.slice(0, -1));
  return prefix;
}

/**
 * Checked by code point rather than a regex character class: a control-character
 * class in a literal is unreadable and needs a lint exception to survive review.
 */
function hasControlCharacter(segment: string): boolean {
  for (let index = 0; index < segment.length; index += 1) {
    const codePoint = segment.charCodeAt(index);
    if (codePoint < ASCII_SPACE || codePoint === ASCII_DELETE) {
      return true;
    }
  }
  return false;
}

function assertSafeSegments(value: string): void {
  for (const segment of value.split('/')) {
    if (segment === '') {
      throw new ObjectKeyError('Invalid object key: empty path segment.');
    }
    if (segment === '.' || segment === '..') {
      throw new ObjectKeyError('Invalid object key: path traversal segment.');
    }
    if (hasControlCharacter(segment)) {
      throw new ObjectKeyError('Invalid object key: control characters are not permitted.');
    }
  }
}
