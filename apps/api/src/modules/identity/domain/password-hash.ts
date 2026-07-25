/**
 * scrypt password hashing primitives (ADR-APP1-001 §2, IMP-D027).
 *
 * Pure and framework-free: encode, parse, derive and compare a self-describing
 * scrypt hash string. No NestJS, no I/O, no randomness of its own — the salt is
 * passed in so the caller owns the CSPRNG seam. Node's built-in `crypto.scrypt`
 * is the only primitive; there is deliberately no third-party password
 * dependency (CLAUDE.md §9, ADR §2).
 *
 * Stored format (in `admin_credentials.credential_reference`):
 *   `scrypt$N=131072,r=8,p=1$<saltBase64>$<hashBase64>`
 *
 * The raw password and derived key never leave this module except as the opaque
 * encoded string; nothing here logs.
 */
import { scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** Promise wrapper over `crypto.scrypt` that keeps the options overload. */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error !== null) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/** Canonical credential kind recorded alongside the hash (ADR §2). */
export const PASSWORD_CREDENTIAL_KIND = 'password_scrypt';

/** Current cost parameters (OWASP-acceptable; ADR §2). */
export const SCRYPT_PARAMS = { N: 131_072, r: 8, p: 1, keylen: 32 } as const;

/** 128 * N * r bytes of working memory, with headroom (ADR §2: 256 MiB). */
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

/** Salt length in bytes (ADR §2). */
export const SALT_BYTES = 16;

/** Reject longer inputs outright — no silent truncation (ADR §2). */
export const MAX_PASSWORD_BYTES = 4096;

const ALGORITHM = 'scrypt';

export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keylen: number;
}

/** Thrown when a password exceeds the accepted byte length. */
export class PasswordTooLongError extends Error {
  constructor() {
    super('The password exceeds the maximum accepted length.');
    this.name = 'PasswordTooLongError';
  }
}

/**
 * NFKC-normalizes a password and asserts its byte length.
 *
 * Normalization makes visually identical Unicode inputs hash the same, and the
 * byte cap bounds the work scrypt will do. The value is never logged or echoed.
 */
export function normalizePassword(plain: string): string {
  const normalized = plain.normalize('NFKC');
  if (Buffer.byteLength(normalized, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new PasswordTooLongError();
  }
  return normalized;
}

async function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return scrypt(password, salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

/** Encodes salt + derived key into the canonical self-describing string. */
export function encodeHash(salt: Buffer, derived: Buffer, params: ScryptParams): string {
  const meta = `N=${params.N},r=${params.r},p=${params.p}`;
  return `${ALGORITHM}$${meta}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Hashes an already length-checked, normalized password with a caller-provided
 * salt and the current parameters.
 */
export async function hashNormalizedPassword(normalized: string, salt: Buffer): Promise<string> {
  const derived = await deriveKey(normalized, salt, SCRYPT_PARAMS);
  return encodeHash(salt, derived, SCRYPT_PARAMS);
}

interface ParsedHash {
  readonly params: ScryptParams;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

/** A base64 field that decodes to exactly the expected non-empty bytes. */
function decodeBase64(value: string): Buffer | undefined {
  if (value === '') {
    return undefined;
  }
  const buffer = Buffer.from(value, 'base64');
  // Round-trip guard: `Buffer.from` silently drops invalid base64, so a value
  // that does not re-encode to itself was malformed.
  return buffer.toString('base64') === value ? buffer : undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || !/^[0-9]+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

/**
 * Parses a stored hash. Returns `undefined` for any malformed input rather than
 * throwing, so a corrupt credential fails verification safely instead of
 * crashing the auth path.
 */
export function parseHash(stored: string): ParsedHash | undefined {
  const parts = stored.split('$');
  const [algo, meta, saltField, hashField] = parts;
  if (
    parts.length !== 4 ||
    algo !== ALGORITHM ||
    meta === undefined ||
    saltField === undefined ||
    hashField === undefined
  ) {
    return undefined;
  }
  const paramMap = new Map<string, string>();
  for (const pair of meta.split(',')) {
    const [key, val] = pair.split('=');
    if (key !== undefined && val !== undefined) {
      paramMap.set(key, val);
    }
  }
  const N = parsePositiveInt(paramMap.get('N'));
  const r = parsePositiveInt(paramMap.get('r'));
  const p = parsePositiveInt(paramMap.get('p'));
  const salt = decodeBase64(saltField);
  const hash = decodeBase64(hashField);
  if (
    N === undefined ||
    r === undefined ||
    p === undefined ||
    salt === undefined ||
    hash === undefined
  ) {
    return undefined;
  }
  return { params: { N, r, p, keylen: hash.length }, salt, hash };
}

export interface VerifyResult {
  readonly ok: boolean;
  /** True when a successful verify used parameters other than the current set. */
  readonly needsRehash: boolean;
}

const FAILED: VerifyResult = { ok: false, needsRehash: false };

/** Whether stored parameters differ from the current policy. */
function paramsAreCurrent(params: ScryptParams): boolean {
  return (
    params.N === SCRYPT_PARAMS.N &&
    params.r === SCRYPT_PARAMS.r &&
    params.p === SCRYPT_PARAMS.p &&
    params.keylen === SCRYPT_PARAMS.keylen
  );
}

/**
 * Verifies a normalized password against a stored hash in constant time.
 *
 * A malformed stored value verifies as a plain failure (never an exception).
 * On success it reports whether the credential should be re-hashed because its
 * parameters are obsolete (ADR §2 rehash-on-verify).
 */
export async function verifyNormalizedPassword(
  normalized: string,
  stored: string,
): Promise<VerifyResult> {
  const parsed = parseHash(stored);
  if (parsed === undefined) {
    return FAILED;
  }
  const derived = await deriveKey(normalized, parsed.salt, parsed.params);
  if (derived.length !== parsed.hash.length || !timingSafeEqual(derived, parsed.hash)) {
    return FAILED;
  }
  return { ok: true, needsRehash: !paramsAreCurrent(parsed.params) };
}
