/**
 * `APP12-E01` — the Wave-1 commerce regression in a real browser, over a real
 * SMTP boundary.
 *
 * ### What this file is accountable for, and what it deliberately is not
 *
 * `APP12-S03`'s lifecycle suite already walks `AWAITING_SHIPPING_FEE` →
 * `COMPLETED` at three viewports and pins the `APP12-U01-C1` F1–F4 screen truth.
 * It is not re-run here, and the §7 exactly-once accounting lives in E01's API
 * tier where the rows are. This file proves only what neither of those can:
 *
 * - **§3.1 / `FU-APP12-H07-05`** — that *this* run's worker resolves
 *   `SmtpNotificationChannelAdapter`, read out of the composed DI graph. An
 *   environment variable is not evidence; `APP12-N01.S01` learned that twice,
 *   against stale builds in which the recording adapter was still bound.
 * - **§3.7 / `FU-APP12-H02-01`** — that the `ORDER_ACCESS` link a *delivered
 *   message* carries is addressed at the configured `STOREFRONT_PUBLIC_ORIGIN`,
 *   that the email boundary accepted it, and that opening the delivered string
 *   itself reaches the intended Storefront host. A link read back from the
 *   adapter that composed it can only ever agree with itself.
 * - **§3.4 / `FU-APP12-H08-04`** — that the Storefront being exercised was built
 *   from current source. The orchestrator now builds before it starts, and this
 *   asserts the served `BUILD_ID` is the one it built.
 * `PAYMENT_UNDER_REVIEW` (§13, §3.5) is **not** here. It needs a delivered
 * `ORDER_ACCESS` link to reach the state at all, and the finding this file
 * records is that no such link survives the SMTP transport — so scanning it from
 * this world would make an accessibility result hostage to an unrelated
 * blocker. It runs in `e01-review.acceptance.spec.ts` on the recording
 * topology, where the link is available, exactly as `APP12-S03` reaches it.
 *
 * ### Secrets
 *
 * The verification code and the secure link are read inside the world module and
 * handed straight to the field and to `page.goto`. Nothing in this file holds
 * either, and the project disables traces, video and screenshots because the
 * first navigation carries a live token in a URL fragment.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { COPY as S03_COPY } from './support/s03-world';
import {
  ORDER_ACCESS_PATH,
  capturedCount,
  checkoutUrl,
  closeE01World,
  deliveredOrderAccessProof,
  openDeliveredOrderAccess,
  openE01World,
  placeOrder,
  proofs,
  resolvedChannelAdapterName,
  smtpTransportIsLive,
} from './support/e01-world';

test.describe.configure({ mode: 'serial' });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set; the orchestrator owns this run's environment.`);
  }
  return value;
}

test.beforeAll(async () => {
  await openE01World();
});

test.afterAll(async () => {
  await closeE01World('[app12-e01-commerce]');
});

test('the worker resolved the SMTP adapter, not a recording stand-in', () => {
  // Asked of the graph, not of the environment. A stale `dist`, a reverted
  // factory or a misresolved provider all answer with the recording adapter's
  // name here, and the run stops before it can report a green journey while
  // proving the opposite of what §3.1 asks.
  const resolved = resolvedChannelAdapterName();
  expect(resolved).toBe('SmtpNotificationChannelAdapter');
  expect(smtpTransportIsLive()).toBe(true);
  proofs['channelAdapter'] = resolved;
});

test('the Storefront being exercised was built from current source', async ({ page, request }) => {
  // `FU-APP12-H08-04`: for the whole life of this harness `next start` served
  // whatever `.next` happened to be on disk, so a run could pass against source
  // nobody had compiled — and the run passed, on stale code, reporting success.
  //
  // The orchestrator builds before it starts now. This is the mechanical half:
  // the `BUILD_ID` the build just wrote has to be the one the running server is
  // serving. Next publishes each build's manifests under
  // `/_next/static/<BUILD_ID>/`, so asking for that path is a direct question to
  // the server about which build it has loaded — not an inference from a page.
  //
  // The App Router publishes no `__NEXT_DATA__`, which is why the identifier is
  // not read out of the document.
  const buildId = readFileSync(
    join(requiredEnv('E2E_REPO_ROOT'), 'apps', 'storefront', '.next', 'BUILD_ID'),
    'utf8',
  ).trim();
  expect(buildId, 'the build wrote a BUILD_ID').not.toBe('');

  const served = await request.get(`/_next/static/${buildId}/_ssgManifest.js`);
  expect(
    served.status(),
    'the running Storefront serves the build the orchestrator just made',
  ).toBe(200);

  // The control: a build that is not loaded has no manifest. Without this the
  // case above would pass against a server that answered 200 to anything.
  const absent = await request.get('/_next/static/e01-not-a-build/_ssgManifest.js');
  expect(absent.status(), 'a build that is not loaded is not served').toBe(404);

  const response = await page.goto(checkoutUrl());
  expect(response?.status(), 'the checkout route answered').toBe(200);
  proofs['storefrontBuildId'] = buildId;
});

test.describe('the delivered ORDER_ACCESS link', () => {
  let address: string;
  let orderCode: string;
  let linkProof: Record<string, unknown>;

  test('a real order is placed, and its link crosses the email boundary', async ({ page }) => {
    const before = capturedCount();
    const placed = await placeOrder(page);
    address = placed.address;
    orderCode = placed.orderCode;

    // Two messages, not one: the verification code, then the `ORDER_ACCESS`
    // link the creation raised. Both went over TCP to the capture listener.
    expect(capturedCount()).toBeGreaterThan(before);
    linkProof = deliveredOrderAccessProof(address);
    expect(linkProof['found'], 'the delivered message carried an ORDER_ACCESS link').toBe(true);
    proofs['orderPlaced'] = orderCode;
  });

  test('uses the configured STOREFRONT_PUBLIC_ORIGIN', () => {
    // The whole of `FU-APP12-H02-01`. The origin is not a secret — it is the
    // value an operator sets — so naming it here makes the evidence readable.
    const configured = new URL(requiredEnv('STOREFRONT_PUBLIC_ORIGIN')).origin;
    expect(linkProof['origin']).toBe(configured);
    expect(linkProof['pathname']).toBe(ORDER_ACCESS_PATH);
    proofs['orderAccessOrigin'] = String(linkProof['origin']);
  });

  test('carries its credential in the fragment and nowhere else', () => {
    // A fragment is never sent to a server and never appears in a Referer. A
    // query string would be written into every access log on the way.
    expect(linkProof['hasFragment']).toBe(true);
    expect(linkProof['carriesQuery']).toBe(false);
  });

  test('opens the intended Storefront host, from the delivered string itself', async ({ page }) => {
    await openDeliveredOrderAccess(page, address);
    expect(new URL(page.url()).pathname).toBe(ORDER_ACCESS_PATH);
    // The surface authorized, and the fragment already gone — the world module
    // waits for the strip before it returns, so nothing below can observe it.
    await expect(page.getByRole('heading', { name: S03_COPY.headingAwaitingFee })).toBeVisible({
      timeout: 20_000,
    });
    expect(await page.evaluate(() => window.location.hash)).toBe('');
  });
});
