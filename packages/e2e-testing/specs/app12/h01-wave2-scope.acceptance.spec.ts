/**
 * `APP12-H01` Journey F — the two grant scopes, with the custom capability
 * released.
 *
 * ## Why this needs its own run
 *
 * Every other H01 journey runs with Wave 2 withheld, which is the state Wave 1
 * ships in. That state proves the *isolation* — `REQUEST_ACCESS` cannot be used
 * because it cannot be minted — and proves nothing about the property underneath
 * it: that when both scopes exist, neither reaches the other's operations.
 *
 * A grant's scope is a column on its row, and the refusal that enforces it lives
 * in `requestSubjectOf` / `orderSubjectOf` and in the scope-pinned repository
 * predicate. None of that is exercised while one of the two scopes cannot be
 * created. So this file runs against a disposable world booted with
 * `CUSTOM_EMBROIDERY_RELEASE_ENABLED=true`, mints **both** grants for real, and
 * crosses them.
 *
 * The release state is read once when the API composes its module graph, so this
 * cannot be a second project inside the Wave-1 run — it is a second run, and the
 * orchestrator sets the same single flag for both the API and the Storefront.
 * There is no second flag and no client-side scope dispatch anywhere in it.
 *
 * ## Both credentials are real
 *
 * The `REQUEST_ACCESS` grant is issued by `publicCustomRequest_submit` inside
 * its own submission transaction — the delivered APP5 authority — and delivered
 * by the real worker as a fragment link on `/truy-cap`. The `ORDER_ACCESS` grant
 * is issued by the delivered Ready-Made checkout. Neither is fabricated, and
 * neither value is ever returned to a report or asserted on: every assertion is
 * a status code, an envelope code or a boolean.
 */
import { expect, test } from '@playwright/test';

import { closeS02World, openS02World, runWorkerUntilIdle, s02Worker } from './support/s02-world';
import {
  closeS03World,
  openS03World,
  openSecureOrder,
  placeOrder,
  s03Evidence,
} from './support/s03-world';
import {
  apiBaseUrl,
  expectIndistinguishableRefusal,
  probeSecure,
  requiredEnv,
} from './support/h01-security';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so the worker control and the evidence reader
   arrive untyped. As in `s03-journeys` and `a02-world`, this file treats those
   imports as `any` and lets each explicit `expect` be the contract. */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/** A 1×1 PNG — a genuinely valid image the intake's signature check accepts. */
const COP_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** The custom secure-access landing (`APP5-B01`). Not the Ready-Made one. */
const REQUEST_ACCESS_PATH = '/truy-cap';
/** The Ready-Made secure-access landing (`APP12-S03`). */
const ORDER_ACCESS_PATH = '/truy-cap/don-hang';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await openS02World();
  await openS03World();
});

test.afterAll(async () => {
  await closeS03World('[app12-h01-wave2]');
  await closeS02World('[app12-h01-wave2-world]');
});

/**
 * The most recent delivered secure-link token of one landing.
 *
 * The landing is what distinguishes the two scopes in the delivery record — a
 * `REQUEST_ACCESS` grant is rendered against `/truy-cap` and an `ORDER_ACCESS`
 * grant against `/truy-cap/don-hang`, by the worker's closed landing set. So the
 * scope of the credential this returns is a fact about the **server's** issuance,
 * not something the test asserted into being.
 */
function latestTokenFor(landing: string): string {
  const worker = s02Worker();
  for (let index = (worker.deliveryCount() as number) - 1; index >= 0; index -= 1) {
    if (worker.safeDelivery(index).secretKind !== 'SECURE_LINK_TOKEN') continue;
    const url = new URL(worker.secureLinkOf(index) as string);
    if (url.pathname !== landing) continue;
    const token = url.hash.slice('#t='.length);
    expect(token.length, `the ${landing} delivery carries a token`).toBeGreaterThan(0);
    return token;
  }
  throw new Error(`no SECURE_LINK_TOKEN delivery was recorded for ${landing}`);
}

/**
 * Submits one real custom request and returns nothing but the landing it was
 * delivered against.
 *
 * The subject is a customer-owned product, which is the smallest real
 * submission: a name and a quantity. No catalog product, no design session and
 * no asset — those are `APP5-E01`'s subject, and repeating them here would be a
 * second acceptance suite rather than a security probe.
 */
async function submitCustomRequest(request: Parameters<typeof probeSecure>[0]): Promise<void> {
  const { issueAndVerifyChallenge } = await import('./support/s02-world');
  const challengeId = await issueAndVerifyChallenge(request);

  // A customer-owned subject must carry an image: `REQUEST_ASSET_NOT_BINDABLE`
  // is what a COP submission with no bound asset is refused with. So the run
  // uses the delivered challenge-scoped intake, uploads a real PNG, and waits
  // for the inspector to make it bindable — the same lane `APP5-E01` drives,
  // reached over HTTP instead of through the browser.
  const upload = await request.post(
    `${apiBaseUrl()}/public/custom-request-intake/challenges/${challengeId}/assets?role=COP_IMAGE`,
    {
      headers: { 'Idempotency-Key': `h01-wave2-cop-${challengeId}` },
      multipart: {
        file: { name: 'anh-san-pham.png', mimeType: 'image/png', buffer: COP_IMAGE },
      },
      failOnStatusCode: false,
    },
  );
  expect(upload.ok(), `the COP image was accepted (got ${String(upload.status())})`).toBe(true);
  const assetId = ((await upload.json()) as { data: { assetId: string } }).data.assetId;

  // Inspection is asynchronous and the worker is held closed, so the run pumps
  // it until the asset is bindable rather than sleeping on it.
  await expect
    .poll(
      async () => {
        await runWorkerUntilIdle();
        const status = await request.get(
          `${apiBaseUrl()}/public/custom-request-intake/challenges/${challengeId}/assets/${assetId}`,
          { failOnStatusCode: false },
        );
        if (!status.ok()) return false;
        return ((await status.json()) as { data: { bindable: boolean } }).data.bindable;
      },
      { timeout: 120_000, intervals: [1_000, 2_000, 5_000] },
    )
    .toBe(true);

  const submitted = await request.post(`${apiBaseUrl()}/public/custom-requests`, {
    data: {
      challengeId,
      customerOwnedProduct: { name: 'Áo khoác H01' },
      breakdown: [{ quantity: 1 }],
      assets: [{ assetId, role: 'COP_IMAGE' }],
    },
    failOnStatusCode: false,
  });
  const refusal = submitted.ok()
    ? ''
    : ` code=${String(((await submitted.json().catch(() => ({}))) as { code?: string }).code)}`;
  expect(
    submitted.ok(),
    `the custom request was accepted with Wave 2 released (got ${String(submitted.status())}${refusal})`,
  ).toBe(true);

  // The grant is issued inside the submission transaction; the worker is what
  // turns its intent into the link this run reads.
  await runWorkerUntilIdle();
}

test('F1 — with Wave 2 released, a REQUEST_ACCESS grant opens its own custom surface', async ({
  request,
}) => {
  test.setTimeout(300_000);

  // The whole journey is meaningless unless the capability is genuinely on, so
  // the first assertion is that a withheld-in-Wave-1 operation is now reachable.
  const templates = await request.get(`${apiBaseUrl()}/public/design-templates`, {
    failOnStatusCode: false,
  });
  expect(
    templates.status(),
    'a STATIC_DENY operation is reachable, so Wave 2 really is released',
  ).not.toBe(404);

  await submitCustomRequest(request);
  const requestAccess = latestTokenFor(REQUEST_ACCESS_PATH);

  // Its own surface: the resolver admits it and reports the scope the row
  // carries. This is the "allowed" half — without it the refusals below could
  // all be "the token is dead".
  const resolved = await request.post(`${apiBaseUrl()}/public/secure-links/resolve`, {
    data: { token: requestAccess },
    failOnStatusCode: false,
  });
  expect(resolved.status(), 'a live REQUEST_ACCESS token resolves').toBe(200);
  const body = (await resolved.json()) as { data?: { scopeKind?: string } };
  expect(body.data?.scopeKind, 'and it resolves as the scope the server issued').toBe(
    'REQUEST_ACCESS',
  );

  // And its own delivered operation answers it.
  const status = await probeSecure(request, apiBaseUrl(), '/public/custom-requests/status', {
    token: requestAccess,
  });
  expect(status.status, 'the custom request status read admits its own credential').toBe(200);
});

test('F2 — a REQUEST_ACCESS credential reaches no ORDER_ACCESS operation', async ({
  browser,
  request,
}) => {
  test.setTimeout(600_000);

  const requestAccess = latestTokenFor(REQUEST_ACCESS_PATH);
  const api = apiBaseUrl();

  // Every Wave-1 Ready-Made operation, with a live credential of the wrong
  // scope. The refusal must be the one indistinguishable answer — a
  // `WRONG_SCOPE` code here would tell a probe the token was real and only
  // pointed somewhere else.
  for (const path of [
    '/public/ready-made-orders/current',
    '/public/orders/full-payment',
    '/public/orders/full-payment/qr',
  ]) {
    const outcome = await probeSecure(request, api, path, { token: requestAccess });
    expectIndistinguishableRefusal(outcome, `${path} with a REQUEST_ACCESS credential`);
  }

  // ── The mirror ───────────────────────────────────────────────────────────
  //
  // A real ORDER_ACCESS credential, from a real Ready-Made order placed in this
  // same released world, against the custom operations. Wave 2 being on is what
  // makes this half expressible at all: with it off, the custom operations are
  // 404 for everyone and the refusal would prove nothing about scope.
  const context = await browser.newContext({
    baseURL: requiredEnv('E2E_BASE_STOREFRONT'),
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await context.newPage();
    await placeOrder(page);
    await openSecureOrder(page);
    const orderAccess = latestTokenFor(ORDER_ACCESS_PATH);

    // Live, and opens its own order.
    const own = await probeSecure(request, api, '/public/ready-made-orders/current', {
      token: orderAccess,
    });
    expect(own.status, 'the ORDER_ACCESS credential opens its own order').toBe(200);

    for (const path of ['/public/custom-requests/status', '/public/quotations/current']) {
      const outcome = await probeSecure(request, api, path, { token: orderAccess });
      expectIndistinguishableRefusal(outcome, `${path} with an ORDER_ACCESS credential`);
    }

    // The resolver tells each credential its own scope and never the other's,
    // which is what the landing page forwards on — server-side, from the grant
    // row, with no client dispatch anywhere.
    const resolvedOrder = await request.post(`${api}/public/secure-links/resolve`, {
      data: { token: orderAccess },
      failOnStatusCode: false,
    });
    const orderBody = (await resolvedOrder.json()) as { data?: { scopeKind?: string } };
    expect(orderBody.data?.scopeKind).toBe('ORDER_ACCESS');
  } finally {
    await context.close();
  }
});

test('F3 — the two landings are the server’s, and the grant count is exact', async () => {
  test.setTimeout(120_000);

  // One ORDER_ACCESS grant for the one Ready-Made order this file placed. The
  // count is the honest check that F2's "mirror" used a real second grant rather
  // than re-reading the first one.
  const evidence = s03Evidence();
  expect(await evidence.countOrderAccessGrants()).toBe(1);

  // Both landings were produced by the worker's closed set, from the scope
  // carried in the sealed envelope — so the two credentials above were told
  // apart by the server's own issuance and not by anything this run decided.
  expect(() => latestTokenFor(REQUEST_ACCESS_PATH)).not.toThrow();
  expect(() => latestTokenFor(ORDER_ACCESS_PATH)).not.toThrow();
});
