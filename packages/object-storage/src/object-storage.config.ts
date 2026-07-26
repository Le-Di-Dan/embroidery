/**
 * Startup configuration for the object-storage adapter (ADR-APP2-001 §4.9).
 *
 * Mirrors the hand-rolled fail-fast style of `packages/database/src/config` and
 * `apps/api/src/config` — a validation library is still an open decision. The
 * environment is read once, here; the adapter receives typed config and never
 * touches `process.env`.
 *
 * Secrets rule: no thrown message, no returned field and no `toString` in this
 * file ever contains the secret access key. Errors name the variable only.
 */
import { ObjectStorageConfigError } from './object-storage.errors';

/** The canonical runtime environment (`NODE_ENV`) — not a competing setting. */
const VALID_ENVIRONMENTS = ['development', 'test', 'production'] as const;

export type ObjectStorageEnvironment = (typeof VALID_ENVIRONMENTS)[number];

/**
 * Only `s3` is supported. MinIO is reached through the same S3 API with a
 * custom endpoint and path-style addressing, so it is not a separate provider
 * branch — adding one would create vendor-specific business behaviour that
 * ADR-APP2-001 §4.1 forbids.
 */
const VALID_PROVIDERS = ['s3'] as const;

export type ObjectStorageProvider = (typeof VALID_PROVIDERS)[number];

export interface ObjectStorageCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface ObjectStorageConfig {
  readonly provider: ObjectStorageProvider;
  readonly environment: ObjectStorageEnvironment;
  /** Absent means "use the provider default endpoint" (real AWS S3). */
  readonly endpoint?: string;
  readonly region: string;
  readonly forcePathStyle: boolean;
  readonly originalsBucket: string;
  readonly derivativesBucket: string;
  /** Absent means "use the AWS default credential provider chain". */
  readonly credentials?: ObjectStorageCredentials;
}

/** S3 bucket naming: DNS-compatible, lowercase, no adjacent or edge dots/dashes. */
const BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const IP_ADDRESS_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function required(name: string, raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') {
    throw new ObjectStorageConfigError(`Missing ${name}: object storage cannot start without it.`);
  }
  return raw.trim();
}

/**
 * Strict boolean: only the two literals are accepted. A permissive parse that
 * treated `"0"`, `""` or `"no"` as false would silently disable path-style
 * addressing against MinIO and produce confusing DNS failures instead of a
 * configuration error.
 */
function parseStrictBoolean(name: string, raw: string | undefined): boolean {
  const value = required(name, raw);
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new ObjectStorageConfigError(`Invalid ${name} "${value}": expected exactly true or false.`);
}

function parseBucket(name: string, raw: string | undefined): string {
  const value = required(name, raw);
  if (!BUCKET_PATTERN.test(value) || value.includes('..') || IP_ADDRESS_PATTERN.test(value)) {
    throw new ObjectStorageConfigError(
      `Invalid ${name} "${value}": expected a 3-63 character lowercase S3 bucket name.`,
    );
  }
  return value;
}

function parseEndpoint(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ObjectStorageConfigError('Invalid OBJECT_STORAGE_ENDPOINT: not a parseable URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ObjectStorageConfigError(
      `Invalid OBJECT_STORAGE_ENDPOINT protocol "${parsed.protocol}": expected http: or https:.`,
    );
  }
  if (parsed.username !== '' || parsed.password !== '') {
    // Credentials belong in the dedicated variables; a URL-embedded secret
    // would leak through every error message that echoes the endpoint.
    throw new ObjectStorageConfigError(
      'Invalid OBJECT_STORAGE_ENDPOINT: credentials must not be embedded in the URL.',
    );
  }
  return value;
}

/**
 * Credentials are all-or-nothing. A half-configured pair otherwise falls back
 * to the ambient AWS credential chain and fails much later with an opaque
 * signature error, or — worse — succeeds against an unintended account.
 */
function parseCredentials(env: NodeJS.ProcessEnv): ObjectStorageCredentials | undefined {
  const accessKeyId = env['OBJECT_STORAGE_ACCESS_KEY_ID']?.trim() ?? '';
  const secretAccessKey = env['OBJECT_STORAGE_SECRET_ACCESS_KEY']?.trim() ?? '';
  if (accessKeyId === '' && secretAccessKey === '') {
    return undefined;
  }
  if (accessKeyId === '' || secretAccessKey === '') {
    throw new ObjectStorageConfigError(
      'OBJECT_STORAGE_ACCESS_KEY_ID and OBJECT_STORAGE_SECRET_ACCESS_KEY must be set together ' +
        'or both left unset (to use the default credential provider chain).',
    );
  }
  return { accessKeyId, secretAccessKey };
}

function parseEnvironment(raw: string | undefined): ObjectStorageEnvironment {
  const value = raw ?? 'development';
  if (!(VALID_ENVIRONMENTS as readonly string[]).includes(value)) {
    throw new ObjectStorageConfigError(
      `Invalid NODE_ENV "${value}": expected one of ${VALID_ENVIRONMENTS.join(', ')}.`,
    );
  }
  return value as ObjectStorageEnvironment;
}

function parseProvider(raw: string | undefined): ObjectStorageProvider {
  const value = required('OBJECT_STORAGE_PROVIDER', raw);
  if (!(VALID_PROVIDERS as readonly string[]).includes(value)) {
    throw new ObjectStorageConfigError(
      `Invalid OBJECT_STORAGE_PROVIDER "${value}": expected ${VALID_PROVIDERS.join(', ')}.`,
    );
  }
  return value as ObjectStorageProvider;
}

export function loadObjectStorageConfig(env: NodeJS.ProcessEnv): ObjectStorageConfig {
  const environment = parseEnvironment(env['NODE_ENV']);
  const provider = parseProvider(env['OBJECT_STORAGE_PROVIDER']);
  const endpoint = parseEndpoint(env['OBJECT_STORAGE_ENDPOINT']);

  // Development runs against a local MinIO, which has no discoverable regional
  // endpoint; without an explicit endpoint the SDK would silently address real
  // AWS S3 instead of the container.
  if (environment === 'development' && endpoint === undefined) {
    throw new ObjectStorageConfigError(
      'Missing OBJECT_STORAGE_ENDPOINT: development runs against the local MinIO service.',
    );
  }

  const originalsBucket = parseBucket(
    'OBJECT_STORAGE_ORIGINALS_BUCKET',
    env['OBJECT_STORAGE_ORIGINALS_BUCKET'],
  );
  const derivativesBucket = parseBucket(
    'OBJECT_STORAGE_DERIVATIVES_BUCKET',
    env['OBJECT_STORAGE_DERIVATIVES_BUCKET'],
  );
  if (originalsBucket === derivativesBucket) {
    throw new ObjectStorageConfigError(
      'OBJECT_STORAGE_ORIGINALS_BUCKET and OBJECT_STORAGE_DERIVATIVES_BUCKET must be distinct: ' +
        'private originals and derivatives are separately governed (ADR-APP2-001 §4.3).',
    );
  }

  const credentials = parseCredentials(env);
  return {
    provider,
    environment,
    ...(endpoint === undefined ? {} : { endpoint }),
    region: required('OBJECT_STORAGE_REGION', env['OBJECT_STORAGE_REGION']),
    forcePathStyle: parseStrictBoolean(
      'OBJECT_STORAGE_FORCE_PATH_STYLE',
      env['OBJECT_STORAGE_FORCE_PATH_STYLE'],
    ),
    originalsBucket,
    derivativesBucket,
    ...(credentials === undefined ? {} : { credentials }),
  };
}

/**
 * Loggable projection of the config. The secret access key is omitted entirely
 * rather than masked, and the access key id is reported only as present/absent
 * — a partially masked identifier is still an identifier.
 */
export function describeObjectStorageConfig(config: ObjectStorageConfig): Record<string, unknown> {
  return {
    provider: config.provider,
    environment: config.environment,
    endpoint: config.endpoint ?? '<provider default>',
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    originalsBucket: config.originalsBucket,
    derivativesBucket: config.derivativesBucket,
    credentials: config.credentials === undefined ? '<default provider chain>' : '<configured>',
  };
}
