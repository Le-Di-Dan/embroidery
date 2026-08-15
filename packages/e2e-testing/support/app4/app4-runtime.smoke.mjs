#!/usr/bin/env node
/**
 * The `APP4-E01-H01` smoke proof.
 *
 * Proves the runtime foundation exists and is coherent — and nothing beyond it.
 * It seeds no APP4 fixture, issues no challenge or grant, executes no job and
 * opens no browser: those are `APP4-E01-H02` and `APP4-E01-R01`.
 *
 * Run by the orchestrator's `app4` mode with the full topology up (so the real
 * API HTTP process is included in the proof), or standalone against an already
 * available PostgreSQL, in which case the API HTTP assertion is reported as
 * skipped rather than silently passed.
 *
 * Every line this script prints is captured and scanned for the run's generated
 * secret material before exit. The scan compares in memory and reports booleans;
 * it never prints a secret to show one is absent.
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { createApp4SecretConfig, app4SecretValues, createRunId } from '../orchestration/config.mjs';
import { createApp4E01Runtime } from './app4-runtime.mjs';

/** Everything written by this run, kept for the leak guard. */
const transcript = [];

function say(message) {
  transcript.push(message);
  process.stdout.write(`[h01] ${message}\n`);
}

const checks = [];
function prove(label, condition) {
  assert.ok(condition, `H01 proof failed: ${label}`);
  checks.push(label);
  say(`ok — ${label}`);
}

async function main() {
  const runId = process.env['E2E_RUN_ID'] ?? createRunId();
  const apiBaseUrl = process.env['E2E_APP4_API_BASE_URL'];
  const databaseUrl = process.env['E2E_DATABASE_URL'];

  // The orchestrator generates the universe when it starts the API HTTP process
  // with it; standalone, the smoke generates its own.
  const app4 =
    process.env['E2E_APP4_ENVELOPE_KEY'] === undefined
      ? createApp4SecretConfig(runId)
      : {
          verificationCodePepper: process.env['E2E_APP4_CODE_PEPPER'],
          secureLinkTokenPepper: process.env['E2E_APP4_LINK_PEPPER'],
          notificationDeliveryEnvelopeKey: process.env['E2E_APP4_ENVELOPE_KEY'],
          storefrontOrigin: process.env['E2E_APP4_STOREFRONT_ORIGIN'],
          // Inherited from the orchestrator, which started the API HTTP process
          // with it; reusing it keeps every participant on one graph config.
          designSessionPepper: process.env['DESIGN_SESSION_SECRET_PEPPER'],
        };

  // 2. APP4 configuration is present and structurally valid. Asserted on the
  //    decoded length, never on the value.
  prove(
    'envelope key decodes to exactly 32 bytes',
    Buffer.from(app4.notificationDeliveryEnvelopeKey, 'base64').length === 32,
  );
  prove(
    'both peppers clear the 32-character minimum',
    app4.verificationCodePepper.length >= 32 && app4.secureLinkTokenPepper.length >= 32,
  );
  prove(
    'the two peppers and the envelope key are three distinct values',
    new Set(app4SecretValues(app4)).size === 3,
  );

  // 3. The real API HTTP process, when the full topology is up.
  if (apiBaseUrl === undefined) {
    say('skip — API HTTP health (no topology; run through the orchestrator app4 mode)');
  } else {
    const response = await fetch(`${apiBaseUrl}/api/health`);
    prove(`API HTTP health responds 200 (${response.status})`, response.status === 200);
  }

  const runtime = await createApp4E01Runtime({ runId, app4, databaseUrl, apiBaseUrl, log: say });

  try {
    // 1, 4–9. The two real contexts and the providers E01 will drive.
    prove('disposable database is migrated and bound', typeof runtime.databaseUrl === 'string');
    prove('API application context booted', runtime.apiContext !== undefined);
    prove(
      'real SecureGrantIssuer resolves from the API graph',
      runtime.secureGrantIssuer?.constructor?.name === 'SecureGrantIssuer',
    );
    prove('worker context booted', runtime.workerContext !== undefined);
    prove(
      'real JobExecutionService resolves',
      runtime.jobExecutionService?.constructor?.name === 'JobExecutionService',
    );
    prove(
      'real RecordingNotificationChannelAdapter resolves',
      runtime.recordingAdapter?.constructor?.name === 'RecordingNotificationChannelAdapter',
    );

    // 7. Polling is held: the gate override is what keeps the loop from
    //    claiming, so the proof is that nothing has been claimed or sent while
    //    the context has been up — not a private field read.
    prove('recording adapter starts empty', runtime.recordingAdapter.records.length === 0);

    // 10, 11. One universe. Not an env comparison — each context is asked, over
    //    its own live pool, which database it is actually connected to. Two
    //    contexts that agree here cannot be reading different data later.
    const [apiDatabase, workerDatabase] = await Promise.all([
      runtime.currentDatabaseOf('api'),
      runtime.currentDatabaseOf('worker'),
    ]);
    prove(
      `both contexts are connected to the same database (${apiDatabase})`,
      apiDatabase === workerDatabase && apiDatabase === runtime.safeMetadata.databaseName,
    );
    prove(
      'no secret is exposed through the safe descriptor',
      app4SecretValues(app4).every(
        (secret) => !JSON.stringify(runtime.safeMetadata).includes(secret),
      ),
    );

    say(`universe: ${JSON.stringify(runtime.safeMetadata)}`);
    say('APP4_E01_HARNESS_READY');
  } finally {
    // 12. Cleanup closes both contexts (and drops the database when owned).
    await runtime.close();
    say('ok — cleanup closed both contexts');
  }

  // 13. Secret-leak guard over everything this run printed.
  const printed = transcript.join('\n');
  const leaked = app4SecretValues(app4).filter((secret) => printed.includes(secret));
  assert.equal(
    leaked.length,
    0,
    `H01 leak guard failed: ${leaked.length} secret(s) reached output`,
  );
  say(`ok — leak guard: secretPresent = false (${checks.length} proofs)`);
}

main().catch((error) => {
  process.stderr.write(`[h01] FAILED: ${error?.stack ?? error}\n`);
  process.exit(1);
});
