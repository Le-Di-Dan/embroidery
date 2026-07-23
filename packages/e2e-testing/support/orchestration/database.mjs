/**
 * Disposable-database provisioning for E2E — a thin adapter over the canonical
 * DB7/T01 harness (`@embroidery/database/testing`). No migration or lifecycle
 * logic is reimplemented here; this only adds the E2E label, the persistent-DB
 * refusal guard, and the one-time schema-baseline proof.
 */
import {
  createDisposableDatabase,
  resolveDatabaseUrl,
  verifySchemaBaseline,
} from '@embroidery/database/testing';

/** The persistent database name from the base URL, used by the refusal guard. */
export function persistentDatabaseName(baseUrl = resolveDatabaseUrl()) {
  return new URL(baseUrl).pathname.replace(/^\//, '');
}

/**
 * Refuses to ever let an E2E run target the persistent database. The canonical
 * harness always names disposable databases `embroidery_db7_*`, so this only
 * fires if that contract is broken — exactly when it must.
 */
export function assertDisposableName(name, persistent) {
  if (name === persistent) {
    throw new Error(`Refusing to run E2E against the persistent database "${persistent}".`);
  }
}

/**
 * Creates a fresh, fully migrated disposable database via the canonical harness
 * and asserts it is not the persistent one. Returns the harness handle
 * (`{ name, url, config, client, drop() }`).
 */
export async function provisionDisposableDatabase(label) {
  const base = resolveDatabaseUrl();
  const persistent = persistentDatabaseName(base);
  const database = await createDisposableDatabase(label);
  try {
    assertDisposableName(database.name, persistent);
  } catch (error) {
    await database.drop();
    throw error;
  }
  return database;
}

/**
 * Runs the frozen DB6 schema-baseline checkers (table catalog + fingerprint)
 * against the provisioned disposable database. Returns the checker summaries so
 * the completion report can cite real table/fingerprint evidence.
 */
export async function proveSchemaBaseline(databaseUrl) {
  const result = await verifySchemaBaseline(databaseUrl);
  return {
    passed: result.passed,
    stages: result.stages.map((stage) => ({
      checker: stage.checker,
      passed: stage.passed,
      summary: stage.summary,
    })),
  };
}
