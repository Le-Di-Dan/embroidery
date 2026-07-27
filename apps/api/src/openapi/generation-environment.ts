/**
 * Offline document-generation environment (APP0-B01, extended by APP2-B01).
 *
 * Building the OpenAPI document instantiates the real `AppModule`, whose
 * infrastructure providers validate their configuration at construction time —
 * but the document is generated without ever opening a connection (no
 * `init`/`listen`, so no lifecycle hook runs, and constructing an S3 client
 * opens no socket). Non-connecting placeholders let `openapi:generate` and
 * `openapi:check` run on any machine and in CI without PostgreSQL or MinIO.
 *
 * Real values present in the environment are respected and left untouched.
 */
export const GENERATION_DATABASE_URL =
  'postgres://openapi:openapi@openapi.invalid:5432/openapi_contract';

/**
 * Object-storage placeholders (APP2-B01).
 *
 * `.invalid` is reserved by RFC 6761 and can never resolve, so a generation run
 * that accidentally tried to reach storage would fail loudly rather than
 * silently contact something real. The credentials are obvious non-secrets.
 */
const GENERATION_OBJECT_STORAGE: Readonly<Record<string, string>> = {
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://openapi.invalid:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'openapi-contract',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'openapi-contract',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'openapi-contract-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'openapi-contract-derivatives',
};

/**
 * Fills in non-connecting object-storage values for any application graph that
 * builds `AppModule` without a real object store.
 *
 * Exported because three call sites need exactly this and must not drift: the
 * OpenAPI generator, the API integration harness, and the module persistence
 * harness. A second copy of these names is how one of them ends up validating a
 * different configuration than the others.
 *
 * Returns a restore function so a caller can leave the environment as it found
 * it — parallel Jest workers are separate processes, but a single worker runs
 * many suites.
 */
export function applyOfflineObjectStorageEnv(env: NodeJS.ProcessEnv = process.env): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(GENERATION_OBJECT_STORAGE)) {
    if (env[name] === undefined || env[name] === '') {
      previous.set(name, env[name]);
      env[name] = value;
    }
  }
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete env[name];
      } else {
        env[name] = value;
      }
    }
  };
}

export function ensureGenerationEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env['DATABASE_URL'] === undefined || env['DATABASE_URL'] === '') {
    env['DATABASE_URL'] = GENERATION_DATABASE_URL;
  }
  applyOfflineObjectStorageEnv(env);
}
