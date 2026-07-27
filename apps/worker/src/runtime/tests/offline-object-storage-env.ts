/**
 * Non-connecting object-storage values for worker graphs built without a store
 * (APP2-I03).
 *
 * `WorkerObjectStorageModule` validates its configuration at construction, the
 * same fail-fast rule the API applies, so a graph that never reaches storage
 * still needs a *valid* configuration to be constructed at all. Constructing
 * the S3 client opens no socket, so with the startup gate opened these suites
 * make no network call.
 *
 * `.invalid` is reserved by RFC 6761 and can never resolve: a suite that
 * accidentally tried to reach storage would fail loudly rather than quietly
 * contact something real. The API carries the same placeholders for the same
 * three offline graphs (`apps/api/src/openapi/generation-environment.ts`);
 * neither app may import the other's, so the values — not the mechanism — are
 * restated here.
 *
 * Test-only.
 */
const OFFLINE_OBJECT_STORAGE: Readonly<Record<string, string>> = {
  OBJECT_STORAGE_PROVIDER: 's3',
  OBJECT_STORAGE_ENDPOINT: 'http://worker-offline.invalid:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'worker-offline',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'worker-offline',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  OBJECT_STORAGE_ORIGINALS_BUCKET: 'worker-offline-originals',
  OBJECT_STORAGE_DERIVATIVES_BUCKET: 'worker-offline-derivatives',
};

/**
 * Fills in any missing value and returns a restore function.
 *
 * A real value already present is respected and left alone, so a suite that
 * deliberately points at a live disposable MinIO is never overridden.
 */
export function applyOfflineObjectStorageEnv(env: NodeJS.ProcessEnv = process.env): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(OFFLINE_OBJECT_STORAGE)) {
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
