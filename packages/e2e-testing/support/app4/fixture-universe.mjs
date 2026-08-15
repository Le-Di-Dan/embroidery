/**
 * The one canonical APP4 fixture universe for E01 (E01-H02).
 *
 * Deliberately thin. E01's whole claim is that the *production* path creates the
 * Customer, the Contact Point, the challenge, the grant and the notification
 * binding — so a fixture builder that pre-created any of them would be
 * manufacturing the evidence. This provides only:
 *
 *  - a synthetic contact for the Storefront to type;
 *  - the one `custom_requests` row a grant cannot exist without;
 *  - safe readers for whatever the production path then produced.
 *
 * Nothing here issues a challenge, creates a Customer, mints a grant or delivers
 * a notification. Those happen through the real UI and the real API in `R01`.
 *
 * Test-only.
 */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { REPO_ROOT } from '../orchestration/config.mjs';

const requireFromApi = createRequire(join(REPO_ROOT, 'apps', 'api', 'package.json'));

/**
 * A synthetic contact, unique per run.
 *
 * The email domain is `*.example.test` — a reserved test domain that can never
 * be a real inbox — following the same rule the APP1 E01 admin credentials use.
 * The phone is in the Vietnamese national form S01 asks the customer to type,
 * from the 09xx range, and is generated rather than fixed so two runs never
 * collide on the identifier-scoped rate limit.
 *
 * It is not secret, but it is personal-data-shaped, so it is masked in every
 * diagnostic and never printed whole.
 */
export function createSyntheticContact(runId) {
  const unique = `${runId}${randomBytes(2).toString('hex')}`;
  const digits = `09${String(BigInt(`0x${randomBytes(4).toString('hex')}`) % 100000000n).padStart(8, '0')}`;
  return {
    email: `e01-${unique}@e2e.example.test`,
    phone: digits,
    /** Enough to tell fixtures apart in a log; never enough to reconstruct. */
    maskedEmail: `e01-${unique.slice(0, 4)}***@e2e.example.test`,
    maskedPhone: `${digits.slice(0, 3)}***${digits.slice(-2)}`,
  };
}

/**
 * Seeds the single `custom_requests` row a secure grant must bind to.
 *
 * **Test scaffolding only — not an APP5 submission.**
 * `secure_access_grants.custom_request_id` is NOT NULL behind an FK RESTRICT, so
 * a grant cannot exist without one. APP5 is not implemented, and `APP4-B05`
 * deliberately does not create requests: production issuance receives an id from
 * an authorized APP5 caller. This row stands in for that caller's row and is
 * written with the same raw insert `APP4-B05`'s own context uses — the minimum a
 * grant needs to bind to, and nothing else. No APP5 action exists to call, and
 * none is modelled here.
 */
export async function seedCustomRequestScaffolding(databaseUrl, customerId) {
  const { createDatabaseClient, executeRaw, newId, sql } = requireFromApi('@embroidery/database');
  const { evidenceClientConfig } = await import('./db-evidence.mjs');
  // One client configuration for both helpers: every timeout must be supplied,
  // or `createDatabaseClient` builds an invalid connection `options` string.
  const client = createDatabaseClient({ ...evidenceClientConfig(databaseUrl), poolMax: 2 });
  try {
    const customRequestId = newId();
    await executeRaw(
      client.db,
      sql`
        INSERT INTO custom_requests (id, code, customer_id, status)
        VALUES (${customRequestId}, ${`REQ-${customRequestId}`}, ${customerId}, 'NEW')
      `,
    );
    return { customRequestId, isApp5Submission: false };
  } finally {
    await client.pool.end();
  }
}

/**
 * Assembles the universe around an H01 runtime.
 *
 * Returns capabilities and safe identifiers only. No raw secret is exposed
 * through this object: the delivered code and token stay behind the worker
 * control's explicitly named accessors, and the synthetic contact is carried by
 * the browser driver that has to type it.
 */
export async function createApp4FixtureUniverse(runtime, { runId } = {}) {
  const contact = createSyntheticContact(runId ?? runtime.safeMetadata.runId);
  const { createDbEvidence } = await import('./db-evidence.mjs');
  const evidence = await createDbEvidence(runtime.databaseUrl);

  return {
    contact,
    evidence,
    safeMetadata: {
      runId: runtime.safeMetadata.runId,
      databaseName: runtime.safeMetadata.databaseName,
      maskedEmail: contact.maskedEmail,
      maskedPhone: contact.maskedPhone,
    },
    seedCustomRequest: (customerId) =>
      seedCustomRequestScaffolding(runtime.databaseUrl, customerId),
    /** Disposable-database convention: the run's database is dropped wholesale. */
    close: () => evidence.close(),
  };
}
