/**
 * `APP4-E01-R01-C1` — the two acceptance gaps the canonical run left open.
 *
 * R01 proved that a real `APP4-B08` replay *creates* a new PENDING intent and a
 * new PENDING outbox event carrying a byte-identical envelope. It never proved
 * that the replay event was then claimed, opened and delivered — so the carried
 * "replay → worker claim/open/deliver" follow-up was closed on evidence that
 * stopped one step short. It also proved rejection equivalence for unknown and
 * revoked tokens, but never for an **expired** grant.
 *
 * This spec closes exactly those two, plus the runtime-output secret scan for
 * the replay lineage. It is independent of the R01 serial spec, builds its own
 * minimal universe through production paths, and re-proves nothing R01 already
 * established.
 *
 * Secret discipline is unchanged: the token exists only in this process's memory
 * and the recording adapter, every comparison is a boolean, and no operand is
 * ever printed or asserted with a matcher that would print one.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

import { createS01Driver } from './support/s01-verification-driver';
import { loginAsAdmin } from '../app1/support/admin-auth';

/* The H01/H02 helper layer is plain ESM `.mjs`; see the R01 spec's note. Every
   value that matters is checked with an explicit `expect`. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the C1 correction run.`);
  }
  return value;
}

let runtime: any;
let evidence: any;
let worker: any;
let fixtures: any;
let secrets: any;

const proofs: Record<string, boolean | string | number> = {};

/** Everything the in-process worker seam printed, for the C1-C scan. */
const runtimeTranscript: string[] = [];
let restoreStdout: (() => void) | undefined;

interface C1State {
  customerId?: string;
  contactPointId?: string;
  sourceIntentId?: string;
  sourceOutboxId?: string;
  sourceGrantId?: string;
  sourceSecretIndex?: number;
}
const state: C1State = {};

/** Issues through the real internal issuer, inside a request context (its contract). */
async function issueGrant(customRequestId: string): Promise<any> {
  const { createRequire } = await import('node:module');
  const requireFromApi = createRequire(`${requiredEnv('E2E_REPO_ROOT')}/apps/api/package.json`);
  const { SecureGrantIssuer } = requireFromApi(
    './dist/modules/customer/application/secure-grant.issuer.js',
  );
  const { RequestContextService } = requireFromApi(
    './dist/platform/request-context/request-context.service.js',
  );
  return await runtime.apiContext
    .get(RequestContextService)
    .run({ requestId: `c1-${Date.now().toString(36)}` }, () =>
      runtime.apiContext
        .get(SecureGrantIssuer)
        .issue({ customerId: state.customerId, customRequestId, notify: true }),
    );
}

async function openAdminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ baseURL: requiredEnv('E2E_BASE_ADMIN') });
  const page = await context.newPage();
  await loginAsAdmin(page, {
    email: requiredEnv('E2E_ADMIN_EMAIL'),
    password: requiredEnv('E2E_ADMIN_PASSWORD'),
    displayName: requiredEnv('E2E_ADMIN_DISPLAY_NAME'),
  });
  return page;
}

test.describe.configure({ mode: 'serial' });

test.describe('APP4-E01-R01-C1 correction', () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    const databaseUrl = requiredEnv('E2E_DATABASE_URL');
    const { createDbEvidence } = (await import('../../support/app4/db-evidence.mjs')) as any;
    const { createApp4E01Runtime } = await import('../../support/app4/app4-runtime.mjs');
    const { createWorkerControl } = (await import('../../support/app4/worker-control.mjs')) as any;
    const { createApp4FixtureUniverse } =
      (await import('../../support/app4/fixture-universe.mjs')) as any;
    secrets = (await import('../../support/app4/secret-compare.mjs')) as any;

    // C1-C: capture what the in-process worker seam writes — this is the process
    // that opens the envelope, so it is where a plaintext leak would surface.
    // Installed *before* the runtime boots, deliberately: the worker's own
    // startup lines are what prove the capture is live, and a transcript that
    // was empty because nothing was ever hooked would make the scan vacuous.
    const originalWrite = process.stdout.write.bind(process.stdout);
    const originalError = process.stderr.write.bind(process.stderr);
    (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
      runtimeTranscript.push(String(chunk));
      return originalWrite(chunk, ...rest);
    };
    (process.stderr as any).write = (chunk: any, ...rest: any[]) => {
      runtimeTranscript.push(String(chunk));
      return originalError(chunk, ...rest);
    };
    restoreStdout = () => {
      (process.stdout as any).write = originalWrite;
      (process.stderr as any).write = originalError;
    };

    runtime = await createApp4E01Runtime({
      runId: requiredEnv('E2E_RUN_ID'),
      app4: {
        verificationCodePepper: requiredEnv('VERIFICATION_CODE_SECRET_PEPPER'),
        secureLinkTokenPepper: requiredEnv('SECURE_LINK_TOKEN_SECRET_PEPPER'),
        notificationDeliveryEnvelopeKey: requiredEnv('NOTIFICATION_DELIVERY_ENVELOPE_KEY'),
        storefrontOrigin: requiredEnv('STOREFRONT_PUBLIC_ORIGIN'),
        designSessionPepper: requiredEnv('DESIGN_SESSION_SECRET_PEPPER'),
      },
      databaseUrl,
    });
    evidence = await createDbEvidence(databaseUrl);
    worker = createWorkerControl(runtime);
    fixtures = await createApp4FixtureUniverse(runtime, { runId: requiredEnv('E2E_RUN_ID') });
  });

  test.afterAll(async () => {
    restoreStdout?.();
    await evidence?.close?.();
    await fixtures?.close?.();
    await runtime?.close?.();
    process.stdout.write(`APP4_E01_R01_C1_PROOFS ${JSON.stringify(proofs)}\n`);
  });

  // ---------------------------------------------------------------------------
  // C1-A / C1-B(first half) — the whole replay lineage, delivered for real
  // ---------------------------------------------------------------------------
  test('C1-A — real B08 replay is claimed, opened and delivered by real W01', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);

    // 1. A verified Customer, through the production S01 path. Not a rerun of
    //    R01's proofs — this is the minimal universe a Customer-bound
    //    secure-grant notification cannot exist without.
    const s01 = createS01Driver(page);
    await s01.openVerification();
    await s01.enterContact(fixtures.contact.email);
    await s01.submitContact();
    await s01.waitForCodeEntry();
    await worker.runOnce();
    const code = worker.secretOf(0) as string;
    await s01.enterCode(code);
    await s01.submitCode();
    await s01.waitForSuccess();

    const customers = await evidence.listRecent('customers');
    state.customerId = customers[0].id as string;
    const points = await evidence.listRecent('customer_contact_points');
    state.contactPointId = points[0].id as string;

    // 2. A real grant with notification, through the real issuer.
    const scaffolding = await fixtures.seedCustomRequest(state.customerId);
    const issued = await issueGrant(scaffolding.customRequestId as string);
    state.sourceGrantId = issued.grantId as string;

    // 3. Drive it to terminal failure through the real execution seam.
    const { DELIVERY_OUTCOME } = (await import('../../support/app4/worker-control.mjs')) as any;
    state.sourceSecretIndex = worker.deliveryCount();
    worker.program(DELIVERY_OUTCOME.TERMINAL_FAILURE);
    await worker.runOnce();

    const intents = await evidence.listRecent('notification_intents');
    const sourceIntent = intents[intents.length - 1];
    expect(sourceIntent.status).toBe('FAILED');
    state.sourceIntentId = sourceIntent.id as string;

    const outbox = await evidence.listRecent('outbox_events');
    const sourceEvent = outbox[outbox.length - 1];
    expect(sourceEvent.status).toBe('DEAD_LETTER');
    state.sourceOutboxId = sourceEvent.id as string;
    proofs.sourceTerminalCreatedThroughProduction = true;

    // Snapshots to compare against after the replay is delivered.
    const sourceEnvelope = await evidence.snapshotTerminalOutbox(state.sourceOutboxId);
    const sourceGrantBefore = await evidence.readGrant(state.sourceGrantId);
    const sourceIntentBefore = await evidence.readNotificationIntent(state.sourceIntentId);
    const sourceSecret = worker.secretOf(state.sourceSecretIndex) as string;
    expect(typeof sourceSecret).toBe('string');

    // 4. Real B08 replay through the Admin API.
    const adminPage = await openAdminPage(browser);
    let replayIntentId: string;
    let replayOutboxId: string;
    try {
      const replay = await adminPage.request.post(
        `/api/admin/notification-intents/${state.sourceIntentId}/replay`,
        { data: {}, failOnStatusCode: false },
      );
      expect(replay.ok()).toBe(true);

      const intentsAfter = await evidence.listRecent('notification_intents');
      const outboxAfter = await evidence.listRecent('outbox_events');
      const replayIntent = intentsAfter[intentsAfter.length - 1];
      const replayEvent = outboxAfter[outboxAfter.length - 1];
      expect(replayIntent.status).toBe('PENDING');
      expect(replayEvent.status).toBe('PENDING');
      // Identify the replay outbox through persisted linkage, not by position
      // alone: the aggregate points at the replay intent.
      expect(replayEvent.aggregate_id).toBe(replayIntent.id);
      replayIntentId = replayIntent.id as string;
      replayOutboxId = replayEvent.id as string;
      proofs.replayAggregateLinksToReplayIntent = true;
    } finally {
      await adminPage.context().close();
    }

    // 5. THE GAP: the replay event is actually claimed, opened and delivered.
    const beforeDelivery = worker.deliveryCount();
    const summary = await worker.runOnce();
    expect(summary).toBeDefined();
    proofs.replayWorkerClaimedNewOutbox = true;

    expect(worker.deliveryCount()).toBe(beforeDelivery + 1);
    const replayDelivery = worker.safeDelivery(beforeDelivery);
    expect(replayDelivery.secretKind).toBe('SECURE_LINK_TOKEN');
    expect(replayDelivery.hasSecureLinkUrl).toBe(true);
    proofs.replayDeliveryRecorded = true;

    // The envelope was opened by the worker, and what came out is the *same*
    // secret the source delivery carried — the manual-replay contract proven
    // through decryption rather than only through stored bytes.
    const replayedSecret = worker.secretOf(beforeDelivery) as string;
    secrets.assertSecretEqual(sourceSecret, replayedSecret, 'replay delivered secret');
    proofs.replayDeliveredSameSecret = true;

    // 6. The replay lineage settled, with an attempt row and the binding intact.
    const replayIntentAfter = await evidence.readNotificationIntent(replayIntentId);
    expect(replayIntentAfter.status).toBe('SATISFIED');
    proofs.replayIntentFinalStatusSatisfied = true;
    expect(replayIntentAfter.recipient_contact_point_id).toBe(state.contactPointId);
    proofs.replayRecipientBindingPreserved = true;

    const attempts = await evidence.readNotificationAttempts(replayIntentId);
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    proofs.replayDeliveryAttemptExists = true;

    // 7. Envelope identity, re-confirmed after real delivery.
    const replayEnvelope = await evidence.snapshotTerminalOutbox(replayOutboxId);
    const fields = Object.keys(sourceEnvelope.envelope);
    secrets.assertByteFieldsEqual(
      sourceEnvelope.envelope,
      replayEnvelope.envelope,
      fields,
      'replay envelope after delivery',
    );
    Object.assign(proofs, {
      replayEnvelopeSameVersion: true,
      replayEnvelopeSameAlgorithm: true,
      replayEnvelopeSameIv: true,
      replayEnvelopeSameCiphertext: true,
      replayEnvelopeSameAuthTag: true,
      replayPayloadSchemaSame: true,
    });

    // 8. The origin stayed terminal through all of it.
    const sourceIntentAfter = await evidence.readNotificationIntent(state.sourceIntentId);
    const sourceEnvelopeAfter = await evidence.snapshotTerminalOutbox(state.sourceOutboxId);
    const sourceGrantAfter = await evidence.readGrant(state.sourceGrantId);
    expect(sourceIntentAfter.status).toBe('FAILED');
    expect(sourceEnvelopeAfter.safe.status).toBe('DEAD_LETTER');
    expect(JSON.stringify(sourceIntentAfter)).toBe(JSON.stringify(sourceIntentBefore));
    expect(JSON.stringify(sourceEnvelopeAfter.safe)).toBe(JSON.stringify(sourceEnvelope.safe));
    expect(JSON.stringify(sourceGrantAfter)).toBe(JSON.stringify(sourceGrantBefore));
    Object.assign(proofs, {
      originIntentStillFailed: true,
      sourceOutboxStillDeadLetter: true,
      sourceOutboxUnchanged: true,
      sourceGrantUnchanged: true,
    });
  });

  // ---------------------------------------------------------------------------
  // C1-B — an expired grant is indistinguishable from an unknown token
  // ---------------------------------------------------------------------------
  test('C1-B — expired grant resolves to the canonical unavailable result', async ({ request }) => {
    test.setTimeout(180_000);
    const scaffolding = await fixtures.seedCustomRequest(state.customerId);
    const expiring = await issueGrant(scaffolding.customRequestId as string);

    // Only the clock moves. `status` stays ACTIVE, the digest, scope and target
    // are untouched — a stale-ACTIVE row is a state APP4 already reports rather
    // than rewrites, so nothing invalid is fabricated.
    await evidence.expireGrant(expiring.grantId, 3600);
    const grant = await evidence.readGrant(expiring.grantId);
    expect(grant.status).toBe('ACTIVE');
    proofs.expiredGrantStillActiveRow = true;

    const apiBase = requiredEnv('E2E_BASE_STOREFRONT');
    const resolve = async (token: string) => {
      const response = await request.post(`${apiBase}/api/public/secure-links/resolve`, {
        data: { token },
        failOnStatusCode: false,
      });
      const body = (await response.json()) as Record<string, unknown>;
      return {
        status: response.status(),
        code: body['code'],
        message: body['message'],
        // The semantic body: `meta.requestId` and `meta.timestamp` are
        // per-request by design and carry nothing about the grant.
        semantic: JSON.stringify({
          success: body['success'],
          code: body['code'],
          message: body['message'],
        }),
        contentType: response.headers()['content-type'],
      };
    };

    const expired = await resolve(expiring.rawToken as string);
    const unknown = await resolve('k'.repeat(43));

    expect(expired.status).toBe(unknown.status);
    expect(expired.status).toBe(404);
    expect(expired.code).toBe(unknown.code);
    expect(expired.code).toBe('SECURE_LINK_UNAVAILABLE');
    expect(expired.message).toBe(unknown.message);
    expect(expired.semantic).toBe(unknown.semantic);
    expect(expired.contentType).toBe(unknown.contentType);
    Object.assign(proofs, {
      expiredStatusEqualsUnknown: true,
      expiredCodeEqualsUnknown: true,
      expiredMessageEqualsUnknown: true,
      expiredSemanticBodyEqualsUnknown: true,
      expiredRelevantHeadersEqual: true,
      expiredCanonicalStatus: expired.status,
      expiredCanonicalCode: String(expired.code),
      SUPERSEDED_REJECTION: 'NOT_REPEATED_IN_C1',
    });
  });

  // ---------------------------------------------------------------------------
  // C1-C — no plaintext secret in the replay path's runtime output
  // ---------------------------------------------------------------------------
  test('C1-C — the replay path leaked no secret into API or worker output', async ({ request }) => {
    test.setTimeout(120_000);
    const sourceSecret = worker.secretOf(state.sourceSecretIndex) as string;
    const link = worker.secureLinkOf(state.sourceSecretIndex) as string | undefined;

    // The API is a separate host process, so its output is read through the
    // orchestrator's loopback control seam rather than guessed at.
    const controlUrl = process.env['E2E_API_CONTROL_URL'];
    let apiTail = '';
    if (controlUrl !== undefined && controlUrl !== '') {
      const response = await request.get(`${controlUrl}/api/log-tail`, { failOnStatusCode: false });
      if (response.ok()) {
        const payload = (await response.json()) as { tail?: unknown };
        apiTail = typeof payload.tail === 'string' ? payload.tail : '';
      }
    }
    expect(apiTail.length).toBeGreaterThan(0);
    proofs.apiOutputCaptured = true;

    const workerOutput = runtimeTranscript.join('\n');
    expect(workerOutput.length).toBeGreaterThan(0);
    proofs.workerOutputCaptured = true;

    // Boolean-only: surface names, never a matching snippet.
    const apiScan = secrets.scanTextsForSecret(sourceSecret, { apiOutput: apiTail });
    const workerScan = secrets.scanTextsForSecret(sourceSecret, { workerOutput });
    expect(apiScan.present).toBe(false);
    expect(workerScan.present).toBe(false);
    proofs.secretPresentInApiOutput = false;
    proofs.secretPresentInWorkerOutput = false;

    if (typeof link === 'string') {
      const linkScan = secrets.scanTextsForSecret(link, { apiOutput: apiTail, workerOutput });
      expect(linkScan.present).toBe(false);
      proofs.secureLinkPresentInLogs = false;
    }
  });
});
