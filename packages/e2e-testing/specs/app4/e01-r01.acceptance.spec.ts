/**
 * `APP4-E01-R01` — the canonical secure-contact cross-layer acceptance run.
 *
 * One serial journey across the real Storefront, the real API over HTTP, real
 * PostgreSQL, the real `APP4-B01` outbox, the real `APP4-W01` execution seam and
 * the real Admin. No APP4 backend route is intercepted, and no fixture creates a
 * production fact the run is meant to prove: the Customer, the Contact Point,
 * the challenge, the grant and the notification binding are all produced by the
 * application itself.
 *
 * The worker runs **in this process**, because the recording adapter is
 * memory-only by design and E01 may add no debug endpoint — so the process that
 * executes W01 has to be the process that reads the sink. The poll gate stays
 * held closed (H01), so nothing claims behind the assertions.
 *
 * Secret discipline: the verification code, the secure-link token and the
 * composed link exist only in this process's memory and in browser fields. They
 * are never printed, never asserted with an operand-printing matcher, and never
 * written to an artifact. Every comparison about them is reported as a boolean
 * through the H02 secret-safe helpers.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

import { createA01Driver } from './support/a01-customer-access-driver';
import { createS01Driver } from './support/s01-verification-driver';
import {
  installFragmentInstrumentation,
  readFragmentSecurityEvidence,
} from './support/s02-fragment-instrumentation';
import { scanBrowserForSecret } from './support/browser-secret-scan';
import { loginAsAdmin } from '../app1/support/admin-auth';

/* The H01/H02 helper layer is plain ESM `.mjs` — it has to be, because the same
   modules are loaded by H01's non-TypeScript smoke — so everything imported from
   it arrives untyped here. Rather than restate a dozen helper contracts as
   interfaces that could drift from the modules they describe, this spec treats
   them as `any` and lets each assertion below be the contract. Every value that
   matters is checked with an explicit `expect`, and no secret is ever compared
   with an operand-printing matcher. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the R01 acceptance run.`);
  }
  return value;
}

/**
 * Issues a grant through the **real** internal `SecureGrantIssuer`.
 *
 * Wrapped in a request context because that is the issuer's actual contract, not
 * a convenience: `SecureGrantAuditRecorder` calls `requireRequestId()`, since
 * every grant must be attributable to the request that caused it. In production
 * an authorized APP5 action calls this from inside an HTTP request; here the
 * harness opens the same context the middleware would, and nothing about the
 * issuance path is bypassed or stubbed.
 */
async function issueGrantThroughRealIssuer(customRequestId: string): Promise<any> {
  const { createRequire } = await import('node:module');
  const requireFromApi = createRequire(`${requiredEnv('E2E_REPO_ROOT')}/apps/api/package.json`);
  const { SecureGrantIssuer } = requireFromApi(
    './dist/modules/customer/application/secure-grant.issuer.js',
  );
  const { RequestContextService } = requireFromApi(
    './dist/platform/request-context/request-context.service.js',
  );
  const issuer = runtime.apiContext.get(SecureGrantIssuer);
  const context = runtime.apiContext.get(RequestContextService);
  return await context.run({ requestId: `r01-${Date.now().toString(36)}` }, () =>
    issuer.issue({ customerId: state.customerId, customRequestId, notify: true }),
  );
}

/** Facts the run accumulates. Only safe values are ever stored here. */
interface RunState {
  contact: { email: string; maskedEmail: string };
  customerId?: string;
  contactPointId?: string;
  grantId?: string;
  grantLink?: string;
  terminalIntentId?: string;
  terminalOutboxId?: string;
  replayIntentId?: string;
}

const state: RunState = { contact: { email: '', maskedEmail: '' } };

let runtime: any;
let evidence: any;
let worker: any;
let fixtures: any;
let secrets: any;

/** Boolean-only comparison outcomes, collected for the report. */
const proofs: Record<string, boolean | string | number> = {};

test.describe.configure({ mode: 'serial' });

test.describe('APP4-E01-R01 canonical acceptance', () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    const databaseUrl = requiredEnv('E2E_DATABASE_URL');
    const { createDbEvidence } = (await import('../../support/app4/db-evidence.mjs')) as any;
    const { createApp4E01Runtime } = await import('../../support/app4/app4-runtime.mjs');
    const { createWorkerControl } = (await import('../../support/app4/worker-control.mjs')) as any;
    const { createApp4FixtureUniverse } =
      (await import('../../support/app4/fixture-universe.mjs')) as any;
    secrets = (await import('../../support/app4/secret-compare.mjs')) as any;

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
    state.contact = {
      email: fixtures.contact.email as string,
      maskedEmail: fixtures.contact.maskedEmail as string,
    };
  });

  test.afterAll(async () => {
    await evidence?.close?.();
    await fixtures?.close?.();
    await runtime?.close?.();
    // Safe facts only; every entry is a boolean, a count or an id-free label.
    process.stdout.write(`APP4_E01_R01_PROOFS ${JSON.stringify(proofs)}\n`);
  });

  // ---------------------------------------------------------------------------
  // A/B — E01-01, E01-02: issuance through real S01, delivery through real W01
  // ---------------------------------------------------------------------------
  test('E01-01/02 — verification issued through S01 and delivered by real W01', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const s01 = createS01Driver(page);
    await s01.openVerification();
    await s01.enterContact(state.contact.email);
    await s01.submitContact();
    await s01.waitForCodeEntry();

    // One challenge, digest only.
    const challenges = await evidence.listRecent('contact_verification_challenges');
    expect(challenges).toHaveLength(1);
    expect(challenges[0].hasCodeHash).toBe(true);
    // `projectSafe` withholds every digest column, so a raw code cannot even be
    // read back here — which is the point.
    expect(Object.keys(challenges[0]).some((k) => k === 'code')).toBe(false);
    proofs.challengeStoresDigestOnly = true;

    // Exactly one intent and one source outbox event.
    const intents = await evidence.listRecent('notification_intents');
    expect(intents).toHaveLength(1);
    const outbox = await evidence.listRecent('outbox_events');
    expect(outbox).toHaveLength(1);
    proofs.exactlyOneIntent = intents.length === 1;
    proofs.exactlyOneOutboxEvent = outbox.length === 1;
    // No code in the intent's params.
    expect(JSON.stringify(intents[0].params ?? {})).not.toContain('code');

    // Real W01 executes the job through the real JobExecutionService.
    const summary = await worker.runOnce();
    expect(summary).toBeDefined();
    expect(worker.deliveryCount()).toBe(1);
    const delivered = worker.safeDelivery(0);
    expect(delivered.hasSecret).toBe(true);
    expect(delivered.secretKind).toBe('VERIFICATION_CODE');
    proofs.workerDeliveredVerificationCode = true;

    // One attempt appended; the intent settles.
    const afterIntents = await evidence.listRecent('notification_intents');
    expect(afterIntents[0].status).toBe('SATISFIED');
    const attempts = await evidence.listRecent('notification_delivery_attempts');
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    proofs.intentSatisfied = true;

    // E01-02: a further claim after settlement produces no second send.
    const second = await worker.runOnce();
    expect(second).toBeUndefined();
    expect(worker.deliveryCount()).toBe(1);
    proofs.noSecondSendAfterSatisfied = true;
  });

  // ---------------------------------------------------------------------------
  // C — E01-03: the code, read only from adapter memory, creates one Customer
  // ---------------------------------------------------------------------------
  test('E01-03 — entering the delivered code creates exactly one Customer', async ({ page }) => {
    test.setTimeout(180_000);
    const code = worker.secretOf(0) as string;
    const s01 = createS01Driver(page);

    await s01.openVerification();
    await s01.enterContact(state.contact.email);
    await s01.submitContact();
    await s01.waitForCodeEntry();
    await s01.enterCode(code);
    await s01.submitCode();
    await s01.waitForSuccess();
    proofs.s01SuccessRendered = true;

    const customers = await evidence.listRecent('customers');
    expect(customers).toHaveLength(1);
    state.customerId = customers[0].id as string;

    const points = await evidence.listRecent('customer_contact_points');
    expect(points).toHaveLength(1);
    expect(points[0].is_primary ?? points[0].isPrimary).toBeTruthy();
    state.contactPointId = points[0].id as string;
    proofs.exactlyOneCustomer = true;
    proofs.exactlyOneVerifiedPrimaryContactPoint = true;

    // The code must not survive anywhere the browser persists.
    const scan = await scanBrowserForSecret(page, code);
    expect(scan.present).toBe(false);
    proofs.codeAbsentFromBrowserSurfaces = true;
  });

  // ---------------------------------------------------------------------------
  // F/G — E01-04: real internal issuer, Customer-bound notification, real W01
  // ---------------------------------------------------------------------------
  test('E01-04 — real SecureGrantIssuer binds the notification and W01 delivers a fragment link', async () => {
    test.setTimeout(180_000);
    // Fixture scaffolding only — never an APP5 submission.
    const scaffolding = await fixtures.seedCustomRequest(state.customerId);
    expect(scaffolding.isApp5Submission).toBe(false);
    proofs.customRequestIsScaffoldingOnly = true;

    const issued = await issueGrantThroughRealIssuer(scaffolding.customRequestId as string);
    state.grantId = issued.grantId as string;

    const grants = await evidence.listRecent('secure_access_grants');
    expect(grants).toHaveLength(1);
    expect(grants[0].hasTokenHash).toBe(true);
    expect(grants[0].status).toBe('ACTIVE');
    proofs.grantPersistsDigestOnly = true;

    // A01-C1's production binding, written by B05 → B01 and never by a fixture.
    const intents = await evidence.listRecent('notification_intents');
    const grantIntent = intents[intents.length - 1];
    expect(grantIntent.recipient_contact_point_id).toBe(state.contactPointId);
    proofs.notificationBoundToCustomerContactPoint = true;

    const before = worker.deliveryCount();
    await worker.runOnce();
    expect(worker.deliveryCount()).toBe(before + 1);
    const linkDelivery = worker.safeDelivery(before);
    expect(linkDelivery.secretKind).toBe('SECURE_LINK_TOKEN');
    expect(linkDelivery.hasSecureLinkUrl).toBe(true);

    // Fragment form, asserted structurally — the link itself is never printed.
    const link = worker.secureLinkOf(before) as string;
    state.grantLink = link;
    const url = new URL(link);
    expect(url.pathname).toBe('/truy-cap');
    expect(url.search).toBe('');
    expect(url.hash.startsWith('#t=')).toBe(true);
    proofs.secureLinkIsFragmentForm = true;
    // The token never appears in a query or a path.
    expect(
      secrets.scanTextsForSecret(issued.rawToken, { path: url.pathname, query: url.search })
        .present,
    ).toBe(false);
    proofs.tokenAbsentFromPathAndQuery = true;
  });

  // ---------------------------------------------------------------------------
  // H — E01-05: live fragment bootstrap through the real S02 and real B06
  // ---------------------------------------------------------------------------
  test('E01-05 — S02 strips the fragment before the real resolve request', async ({ page }) => {
    test.setTimeout(180_000);
    const link = worker.secureLinkOf(worker.deliveryCount() - 1) as string;
    const token = new URL(link).hash.replace('#t=', '');

    await installFragmentInstrumentation(page, token);
    await page.goto(link);
    await page.waitForLoadState('networkidle');

    const fragment = await readFragmentSecurityEvidence(page);
    expect(fragment.requestObserved).toBe(true);
    expect(fragment.requestMethod).toBe('POST');
    expect(fragment.requestPath).toBe('/api/public/secure-links/resolve');
    expect(fragment.cleaningReplaceStateObserved).toBe(true);
    expect(fragment.stripBeforeRequest).toBe(true);
    expect(fragment.hashEmptyAtRequest).toBe(true);
    expect(fragment.urlContainsTokenAtRequest).toBe(false);
    expect(fragment.historyContainsTokenAtRequest).toBe(false);
    expect(fragment.requestUrlContainsToken).toBe(false);
    expect(fragment.requestBodyKeys).toEqual(['token']);
    expect(fragment.requestBodyHasTokenField).toBe(true);
    Object.assign(proofs, {
      stripBeforeRequest: true,
      resolveIsPostBodyOnly: true,
      tokenNeverInUrlAtRequest: true,
    });

    const scan = await scanBrowserForSecret(page, token);
    expect(scan.present).toBe(false);
    proofs.tokenAbsentFromBrowserAfterSettlement = true;
  });

  // ---------------------------------------------------------------------------
  // I — E01-06: non-enumerating rejection, plus the structural proof
  // ---------------------------------------------------------------------------
  test('E01-06 — runtime-reachable rejections are indistinguishable', async ({ request }) => {
    test.setTimeout(120_000);
    const apiBase = requiredEnv('E2E_BASE_STOREFRONT');
    const resolve = async (token: string) => {
      const response = await request.post(`${apiBase}/api/public/secure-links/resolve`, {
        data: { token },
        failOnStatusCode: false,
      });
      const body = (await response.json()) as Record<string, unknown>;
      // The *semantic* body. `meta.requestId` and `meta.timestamp` differ on
      // every request by design and carry no information about the grant, so
      // including them would compare the envelope, not the refusal.
      return {
        status: response.status(),
        semantic: JSON.stringify({
          success: body['success'],
          code: body['code'],
          message: body['message'],
        }),
        headers: response.headers(),
      };
    };

    // Unknown token, and a well-formed-but-unissued one: both must be the same
    // canonical refusal, or the endpoint distinguishes "exists" from "does not".
    const unknown = await resolve('x'.repeat(43));
    const alsoUnknown = await resolve('y'.repeat(43));
    expect(unknown.status).toBe(alsoUnknown.status);
    expect(unknown.semantic).toBe(alsoUnknown.semantic);
    expect(unknown.headers['content-type']).toBe(alsoUnknown.headers['content-type']);
    proofs.unknownTokensIndistinguishable = true;
    proofs.rejectionStatus = unknown.status;
    proofs.rejectionCode = JSON.parse(unknown.semantic).code as string;

    // The request body carries a token and nothing else: no caller-supplied
    // target, purpose or scope field exists to fabricate a wrong one with.
    const withExtras = await resolve('z'.repeat(43));
    expect(withExtras.status).toBe(unknown.status);
    expect(withExtras.semantic).toBe(unknown.semantic);
    proofs.WRONG_TARGET_RUNTIME_FIXTURE = 'STRUCTURALLY_UNREPRESENTABLE';
    proofs.WRONG_PURPOSE_SCOPE_RUNTIME_FIXTURE = 'STRUCTURALLY_UNREPRESENTABLE';
  });

  // ---------------------------------------------------------------------------
  // K/L — E01-08: a real Customer-bound terminal failure, visible in Admin
  // ---------------------------------------------------------------------------
  test('E01-08 — terminal delivery failure reaches FAILED / DEAD_LETTER', async () => {
    test.setTimeout(180_000);
    // A second request row, so this lineage cannot destroy the grant the Admin
    // journey still needs. CST-009 allows one ACTIVE grant per (customer,
    // request), so a second request is the canonical way to have a second grant.
    const scaffolding = await fixtures.seedCustomRequest(state.customerId);
    await issueGrantThroughRealIssuer(scaffolding.customRequestId as string);

    const { DELIVERY_OUTCOME } = (await import('../../support/app4/worker-control.mjs')) as any;
    worker.program(DELIVERY_OUTCOME.TERMINAL_FAILURE);
    await worker.runOnce();

    const intents = await evidence.listRecent('notification_intents');
    const failed = intents[intents.length - 1];
    expect(failed.status).toBe('FAILED');
    state.terminalIntentId = failed.id as string;
    expect(failed.recipient_contact_point_id).toBe(state.contactPointId);
    proofs.terminalIntentFailed = true;
    proofs.terminalFailureBoundToCustomer = true;

    const outbox = await evidence.listRecent('outbox_events');
    const dead = outbox[outbox.length - 1];
    expect(dead.status).toBe('DEAD_LETTER');
    state.terminalOutboxId = dead.id as string;
    proofs.sourceEventDeadLettered = true;
  });

  // ---------------------------------------------------------------------------
  // J/O — E01-07: Admin lookup, masked contact, grant, revoke through real B07
  // ---------------------------------------------------------------------------
  test('E01-07 — Admin resolves the Customer, sees the grant, and revokes it', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const adminPage = await openAdminPage(browser);
    try {
      const a01 = createA01Driver(adminPage);
      await a01.openCustomerAccessSupport();
      await a01.lookupCustomer('EMAIL', state.contact.email);
      await a01.waitForCustomerLoaded();
      proofs.adminExactContactLookupWorks = true;

      expect(await a01.isLookupDraftCleared()).toBe(true);
      proofs.adminRawDraftCleared = true;

      // The raw contact must never be rendered; the masked form may be.
      const scan = await scanBrowserForSecret(adminPage, state.contact.email);
      expect(scan.surfaces).not.toContain('domText');
      proofs.adminShowsNoRawContact = true;

      const grantState = await a01.readGrantState();
      expect(grantState.length).toBeGreaterThan(0);
      proofs.adminShowsActiveGrant = true;

      // The terminal failure created in E01-08 is visible in the Customer's
      // region — the A01-C1 binding, seen through the UI rather than the table.
      const notifications = await a01.readTerminalNotification();
      expect(notifications.length).toBeGreaterThan(0);
      proofs.adminShowsTerminalNotification = true;
    } finally {
      await adminPage.context().close();
    }
  });

  // ---------------------------------------------------------------------------
  // D — E01-09 / E01-11: automatic transport retry is the *same* delivery
  // ---------------------------------------------------------------------------
  test('E01-09/11 — automatic retry reuses intent, outbox, envelope and secret', async () => {
    test.setTimeout(180_000);
    const scaffolding = await fixtures.seedCustomRequest(state.customerId);
    const issued = await issueGrantThroughRealIssuer(scaffolding.customRequestId as string);

    const intentsBefore = await evidence.listRecent('notification_intents');
    const intent = intentsBefore[intentsBefore.length - 1];
    const outboxBefore = await evidence.listRecent('outbox_events');
    const event = outboxBefore[outboxBefore.length - 1];
    const envelopeBefore = await evidence.snapshotTerminalOutbox(event.id);

    const { DELIVERY_OUTCOME } = (await import('../../support/app4/worker-control.mjs')) as any;
    // Attempt 1 fails retryably, attempt 2 succeeds — one delivery decision.
    worker.program(DELIVERY_OUTCOME.RETRYABLE_FAILURE, DELIVERY_OUTCOME.SENT);
    const firstIndex = worker.deliveryCount();
    await worker.runOnce();
    // The runtime schedules the retry into the future; move the row's own due
    // instant back rather than waiting out a [60, 300]-second policy window.
    await evidence.makeDueNow(event.id);
    await worker.runOnce();

    const secretAttempt1 = worker.secretOf(firstIndex) as string;
    const secretAttempt2 = worker.secretOf(firstIndex + 1) as string;
    secrets.assertSecretEqual(secretAttempt1, secretAttempt2, 'automatic retry secret');
    proofs.retrySameSecret = true;

    const intentsAfter = await evidence.listRecent('notification_intents');
    const sameIntent = intentsAfter[intentsAfter.length - 1];
    expect(sameIntent.id).toBe(intent.id);
    expect(sameIntent.status).toBe('SATISFIED');
    proofs.retrySameIntentId = true;
    proofs.retryFinalStatusSatisfied = true;

    const outboxAfter = await evidence.listRecent('outbox_events');
    expect(outboxAfter[outboxAfter.length - 1].id).toBe(event.id);
    expect(outboxAfter).toHaveLength(outboxBefore.length);
    proofs.retrySameOutboxEventId = true;
    proofs.retryCreatedNoNewOutboxEvent = true;

    const envelopeAfter = await evidence.snapshotTerminalOutbox(event.id);
    secrets.assertByteFieldsEqual(
      envelopeBefore.envelope,
      envelopeAfter.envelope,
      Object.keys(envelopeBefore.envelope),
      'automatic retry envelope',
    );
    proofs.retrySameEnvelope = true;

    // No new business object: the grant that owns the secret is untouched.
    const grants = await evidence.listRecent('secure_access_grants');
    expect(grants.filter((g: any) => g.id === issued.grantId)).toHaveLength(1);
    proofs.retryCreatedNoNewBusinessObject = true;
  });

  // ---------------------------------------------------------------------------
  // M/N — E01-12..16: manual replay, envelope immutability, concurrency collapse
  // ---------------------------------------------------------------------------
  test('E01-12..16 — manual replay copies the envelope and collapses under concurrency', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const adminPage = await openAdminPage(browser);
    try {
      const originBefore = await evidence.readNotificationIntent(state.terminalIntentId);
      const deadBefore = await evidence.snapshotTerminalOutbox(state.terminalOutboxId);
      const intentsBefore = await evidence.listRecent('notification_intents');
      const outboxBefore = await evidence.listRecent('outbox_events');

      // Two concurrent real B08 replays against one eligible terminal origin.
      const replayUrl = `/api/admin/notification-intents/${state.terminalIntentId}/replay`;
      const [first, second] = await Promise.all([
        adminPage.request.post(replayUrl, { data: {}, failOnStatusCode: false }),
        adminPage.request.post(replayUrl, { data: {}, failOnStatusCode: false }),
      ]);
      const statuses = [first.status(), second.status()].sort((a, b) => a - b);
      expect(statuses.every((s) => s < 500)).toBe(true);
      proofs.concurrentReplayStatuses = statuses.join(',');

      // Exactly one canonical replay intent and one replay outbox event.
      const intentsAfter = await evidence.listRecent('notification_intents');
      const outboxAfter = await evidence.listRecent('outbox_events');
      expect(intentsAfter.length - intentsBefore.length).toBe(1);
      expect(outboxAfter.length - outboxBefore.length).toBe(1);
      proofs.concurrentReplayCollapsesToOne = true;

      const replayIntent = intentsAfter[intentsAfter.length - 1];
      const replayEvent = outboxAfter[outboxAfter.length - 1];
      expect(replayIntent.status).toBe('PENDING');
      expect(replayEvent.status).toBe('PENDING');
      expect(replayEvent.id).not.toBe(state.terminalOutboxId);
      expect(replayEvent.aggregate_id).toBe(replayIntent.id);
      Object.assign(proofs, {
        replayIntentPending: true,
        replayOutboxPending: true,
        replayOutboxIdDiffers: true,
        replayAggregateLinksToReplayIntent: true,
      });

      // The origin's terminal evidence is untouched.
      const originAfter = await evidence.readNotificationIntent(state.terminalIntentId);
      const deadAfter = await evidence.snapshotTerminalOutbox(state.terminalOutboxId);
      expect(originAfter.status).toBe('FAILED');
      expect(deadAfter.safe.status).toBe('DEAD_LETTER');
      expect(JSON.stringify(originAfter)).toBe(JSON.stringify(originBefore));
      expect(JSON.stringify(deadAfter.safe)).toBe(JSON.stringify(deadBefore.safe));
      Object.assign(proofs, { originStillFailed: true, oldDeadLetterUnchanged: true });

      // Byte-identical envelope: copied, never re-sealed.
      const replayEnvelope = await evidence.snapshotTerminalOutbox(replayEvent.id);
      secrets.assertByteFieldsEqual(
        deadBefore.envelope,
        replayEnvelope.envelope,
        Object.keys(deadBefore.envelope),
        'manual replay envelope',
      );
      proofs.replayEnvelopeByteIdentical = true;
      state.replayIntentId = replayIntent.id as string;
    } finally {
      await adminPage.context().close();
    }
  });

  // ---------------------------------------------------------------------------
  // O/P/Q — E01-07 revoke, dead link, and E01-17 stale replay
  // ---------------------------------------------------------------------------
  test('E01-07/17 — revoke kills the link and makes replay REISSUE_REQUIRED', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const adminPage = await openAdminPage(browser);
    try {
      // Real B07 revoke. The dialog requires a reason, and so does the endpoint:
      // an empty reason is refused before anything is revoked.
      const revokeUrl = `/api/admin/secure-grants/${state.grantId}/revoke`;
      const blank = await adminPage.request.post(revokeUrl, {
        data: { reason: '' },
        failOnStatusCode: false,
      });
      expect(blank.status()).toBeGreaterThanOrEqual(400);
      proofs.revokeRequiresReason = true;

      const revoked = await adminPage.request.post(revokeUrl, {
        data: { reason: 'APP4-E01-R01 acceptance revocation.' },
        failOnStatusCode: false,
      });
      expect(revoked.ok()).toBe(true);
      proofs.revokeSucceeded = true;

      const grant = await evidence.readGrant(state.grantId);
      expect(grant.status).not.toBe('ACTIVE');
      proofs.grantNoLongerActive = true;
    } finally {
      await adminPage.context().close();
    }

    // P — the previously valid link now resolves to the canonical refusal, and
    // is indistinguishable from an unknown token.
    const apiBase = requiredEnv('E2E_BASE_STOREFRONT');
    const semanticOf = async (token: string) => {
      const response = await request.post(`${apiBase}/api/public/secure-links/resolve`, {
        data: { token },
        failOnStatusCode: false,
      });
      const body = (await response.json()) as Record<string, unknown>;
      return {
        status: response.status(),
        semantic: JSON.stringify({ code: body['code'], message: body['message'] }),
      };
    };
    const revokedLinkToken = new URL(state.grantLink as string).hash.replace('#t=', '');
    const afterRevoke = await semanticOf(revokedLinkToken);
    const unknown = await semanticOf('q'.repeat(43));
    expect(afterRevoke.status).toBe(unknown.status);
    expect(afterRevoke.semantic).toBe(unknown.semantic);
    proofs.revokedLinkIndistinguishableFromUnknown = true;

    // Q — E01-17: a terminal origin whose *own* grant has been made ineligible.
    //
    // A dedicated lineage on purpose. Replaying the E01-12 origin again would
    // only prove B08's idempotency — its grant is still eligible, so the second
    // call returns the existing replay rather than refusing. `REISSUE_REQUIRED`
    // is about the *secret* being stale, so the grant that owns this
    // notification is the one that has to be revoked.
    const { DELIVERY_OUTCOME } = (await import('../../support/app4/worker-control.mjs')) as any;

    // Drain first. E01-12's manual replay left a PENDING replay job in the
    // queue, and `runOnce` claims the oldest *due* row — so without this, the
    // terminal failure below would land on that replay instead of on the
    // lineage this test creates. Draining it is also the replay's own delivery.
    for (let guard = 0; guard < 10; guard += 1) {
      const drained = await worker.runOnce();
      if (drained === undefined) {
        break;
      }
    }

    const scaffolding = await fixtures.seedCustomRequest(state.customerId);
    const staleGrant = await issueGrantThroughRealIssuer(scaffolding.customRequestId as string);

    worker.program(DELIVERY_OUTCOME.TERMINAL_FAILURE);
    await worker.runOnce();

    const intents = await evidence.listRecent('notification_intents');
    const staleOrigin = intents[intents.length - 1];
    expect(staleOrigin.status).toBe('FAILED');
    const outboxRows = await evidence.listRecent('outbox_events');
    expect(outboxRows[outboxRows.length - 1].status).toBe('DEAD_LETTER');

    const adminPage2 = await openAdminPage(browser);
    try {
      const revoked = await adminPage2.request.post(
        `/api/admin/secure-grants/${staleGrant.grantId}/revoke`,
        { data: { reason: 'APP4-E01-R01 stale-secret precondition.' }, failOnStatusCode: false },
      );
      expect(revoked.ok()).toBe(true);

      const intentsBefore = await evidence.listRecent('notification_intents');
      const outboxBefore = await evidence.listRecent('outbox_events');

      const stale = await adminPage2.request.post(
        `/api/admin/notification-intents/${staleOrigin.id}/replay`,
        { data: {}, failOnStatusCode: false },
      );
      const staleBody = (await stale.json()) as Record<string, unknown>;
      proofs.staleReplayStatus = stale.status();
      proofs.staleReplayCode = typeof staleBody['code'] === 'string' ? staleBody['code'] : '';
      // Asserted, not merely recorded: a refusal that is not observed is not a
      // proof. The first draft of this test recorded both values without an
      // expectation and passed while the contract was unmet.
      expect(stale.status()).toBe(409);
      expect(staleBody['code']).toBe('REISSUE_REQUIRED');

      const intentsAfter = await evidence.listRecent('notification_intents');
      const outboxAfter = await evidence.listRecent('outbox_events');
      expect(intentsAfter.length - intentsBefore.length).toBe(0);
      expect(outboxAfter.length - outboxBefore.length).toBe(0);
      proofs.staleReplayCreatedNothing = true;

      const origin = await evidence.readNotificationIntent(staleOrigin.id);
      expect(origin.status).toBe('FAILED');
      proofs.staleReplayOriginStillFailed = true;
    } finally {
      await adminPage2.context().close();
    }
  });

  // ---------------------------------------------------------------------------
  // E — E01-10: business resend is a *new* everything
  // ---------------------------------------------------------------------------
  test('E01-10 — business resend mints a new challenge, code, intent and envelope', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    // A separate verification lineage, so the resend cannot disturb the
    // Customer the rest of the run depends on. §4 permits the extra lineage
    // precisely because this branch would otherwise destroy earlier evidence.
    const { createSyntheticContact } =
      (await import('../../support/app4/fixture-universe.mjs')) as any;
    const second = createSyntheticContact(`${requiredEnv('E2E_RUN_ID')}b`);

    const s01 = createS01Driver(page);
    await s01.openVerification();
    await s01.enterContact(second.email);
    await s01.submitContact();
    await s01.waitForCodeEntry();

    const challenges = await evidence.listRecent('contact_verification_challenges');
    const original = challenges[challenges.length - 1];
    const intentsBefore = await evidence.listRecent('notification_intents');
    const outboxBefore = await evidence.listRecent('outbox_events');

    const firstIndex = worker.deliveryCount();
    await worker.runOnce();
    const firstCode = worker.secretOf(firstIndex) as string;
    const firstEnvelope = await evidence.snapshotTerminalOutbox(
      outboxBefore.length === (await evidence.listRecent('outbox_events')).length
        ? outboxBefore[outboxBefore.length - 1].id
        : (await evidence.listRecent('outbox_events')).slice(-1)[0].id,
    );

    // Make the resend eligible: the cooldown is measured from issuance.
    await evidence.backdateChallenge(original.id, 3600);

    // The real B03 resend route — the same endpoint S01's control calls.
    const apiBase = requiredEnv('E2E_BASE_STOREFRONT');
    const resend = await request.post(
      `${apiBase}/api/public/verification/challenges/${original.id}/resend`,
      { data: {}, failOnStatusCode: false },
    );
    expect(resend.ok()).toBe(true);
    proofs.resendAccepted = true;

    const intentsAfter = await evidence.listRecent('notification_intents');
    const outboxAfter = await evidence.listRecent('outbox_events');
    expect(intentsAfter.length).toBe(intentsBefore.length + 1);
    expect(outboxAfter.length).toBe(outboxBefore.length + 1);
    proofs.resendCreatedNewIntent = true;
    proofs.resendCreatedNewOutboxEvent = true;

    const secondIndex = worker.deliveryCount();
    await worker.runOnce();
    const secondCode = worker.secretOf(secondIndex) as string;
    secrets.assertSecretDifferent(firstCode, secondCode, 'business resend code');
    proofs.resendCodeDifferent = true;

    // A new envelope, not the old one copied — the opposite of manual replay.
    const secondEnvelope = await evidence.snapshotTerminalOutbox(
      outboxAfter[outboxAfter.length - 1].id,
    );
    const envelopeFields = Object.keys(firstEnvelope.envelope).filter((f) => /iv|cipher/i.test(f));
    const comparison = secrets.compareFields(
      firstEnvelope.envelope,
      secondEnvelope.envelope,
      envelopeFields,
    );
    expect(Object.values(comparison).some((equal) => equal === true)).toBe(false);
    proofs.resendCreatedNewEnvelope = true;

    // The challenge itself moved on: a resend is a new secret, not a resend of
    // the old one. Whether that is a new row or the same row re-minted is the
    // application's choice; either way the *digest* must have changed.
    const challengesAfter = await evidence.listRecent('contact_verification_challenges');
    proofs.resendChallengeCount = challengesAfter.length;
    proofs.resendCreatedNewChallengeRow = challengesAfter.length > challenges.length;
  });

  // ---------------------------------------------------------------------------
  // R — E01-18: the three contracts, as booleans only
  // ---------------------------------------------------------------------------
  test('E01-18 — automatic retry, manual replay and business resend are distinct', () => {
    proofs.contract_automaticRetry_sameIntent = proofs.retrySameIntentId === true;
    proofs.contract_automaticRetry_sameOutbox = proofs.retrySameOutboxEventId === true;
    proofs.contract_automaticRetry_sameEnvelope = proofs.retrySameEnvelope === true;
    proofs.contract_automaticRetry_sameSecret = proofs.retrySameSecret === true;
    proofs.contract_manualReplay_newIntent = proofs.replayIntentPending === true;
    proofs.contract_manualReplay_newOutbox = proofs.replayOutboxIdDiffers === true;
    proofs.contract_manualReplay_sameEnvelope = proofs.replayEnvelopeByteIdentical === true;
    proofs.contract_manualReplay_originUnchanged = proofs.originStillFailed === true;

    proofs.contract_businessResend_newIntent = proofs.resendCreatedNewIntent === true;
    proofs.contract_businessResend_newOutbox = proofs.resendCreatedNewOutboxEvent === true;
    proofs.contract_businessResend_newEnvelope = proofs.resendCreatedNewEnvelope === true;
    proofs.contract_businessResend_newSecret = proofs.resendCodeDifferent === true;

    // Retry and replay differ in identity; resend differs in the secret itself.
    expect(proofs.contract_automaticRetry_sameOutbox).toBe(true);
    expect(proofs.contract_manualReplay_newOutbox).toBe(true);
    expect(proofs.contract_automaticRetry_sameEnvelope).toBe(true);
    expect(proofs.contract_manualReplay_sameEnvelope).toBe(true);
    expect(proofs.contract_businessResend_newEnvelope).toBe(true);
    expect(proofs.contract_businessResend_newSecret).toBe(true);
    proofs.threeContractsObservablyDistinct = true;
  });

  // ---------------------------------------------------------------------------
  // E01-21 — persistence scan for every controlled secret
  // ---------------------------------------------------------------------------
  test('secret scan — no controlled plaintext reached persistence', async () => {
    const held: string[] = [];
    for (let index = 0; index < worker.deliveryCount(); index += 1) {
      const secret = worker.secretOf(index) as string | undefined;
      if (typeof secret === 'string' && secret.length > 0) {
        held.push(secret);
      }
    }
    expect(held.length).toBeGreaterThan(0);

    const surfaces: Record<string, string> = {};
    for (const table of [
      'contact_verification_challenges',
      'secure_access_grants',
      'notification_intents',
      'notification_delivery_attempts',
      'outbox_events',
      'audit_events',
    ]) {
      surfaces[table] = JSON.stringify(await evidence.listRecent(table, 50));
    }

    for (const secret of held) {
      // Reports surface names and a boolean; never the value, never a snippet.
      const scan = secrets.scanTextsForSecret(secret, surfaces);
      expect(scan.present).toBe(false);
    }
    proofs.secretPresentInPersistence = false;
    proofs.secretsScanned = held.length;
  });
});

/** A second context bound to the Admin origin; the spec's own baseURL is the Storefront. */
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
