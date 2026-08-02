#!/usr/bin/env node
/**
 * `APP2-E01` — the ordered journey itself, separated from the topology that
 * hosts it.
 *
 * The order is the point. Publication visibility asserted before the publish
 * step, or media selection attempted before the worker finished, would prove
 * nothing — so every stage runs in sequence and each one's evidence is read from
 * durable state before the next begins.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  captureBaseline,
  evidence,
  sql,
  waitFor,
  writeFixtureImage,
} from './smoke-app2-e01-fixtures.mjs';
import {
  assertAnonymousProtection,
  completeDraft,
  createDraft,
  login,
  publish,
  unpublish,
  uploadAsset,
} from './smoke-app2-e01-admin-browser.mjs';
import {
  assertDetail,
  assertDiscoverable,
  assertRevoked,
  assertUnknownSlugSafety,
  fetchRaw,
} from './smoke-app2-e01-storefront-browser.mjs';
import { API_CONTAINER } from './smoke-app2-t01-production-topology.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Playwright is a devDependency of the E2E package; resolved from there so this
// harness adds no dependency of its own.
const requireFromE2e = createRequire(join(REPO_ROOT, 'packages', 'e2e-testing', 'package.json'));
const { chromium } = requireFromE2e('@playwright/test');

const PRICE = 480000;

/** Media addresses as the public detail response advertises them right now. */
function mediaPathsFromDetail(html) {
  const paths = [
    ...html.matchAll(/\/api\/public\/products\/[a-z0-9-]+\/media\/[0-9a-f-]+\/[a-z-]+/g),
  ]
    .map((match) => match[0])
    .filter((value, index, all) => all.indexOf(value) === index);
  return paths;
}

export async function runJourney({
  record,
  docker,
  adminBaseUrl,
  storefrontBaseUrl,
  staff,
  prerequisites,
  fixtureDir,
  runId,
}) {
  // --- the state the journey starts from ------------------------------------
  //
  // Since `APP2-E01-C1` the database was created by the canonical migration
  // runner from empty, so every mutable count below is zero and the journey owns
  // everything that appears after this point. It is still measured as a delta
  // and its own Asset is still identified by set difference: an assertion that
  // reads "the newest row" passes just as happily on somebody else's data, and
  // the evidence tables carry real immutability triggers that would refuse to be
  // cleared anyway.
  const baseline = captureBaseline();
  record(
    'nothing is published before the journey starts',
    baseline.publishedProducts === 0,
    baseline,
  );
  record(
    'the journey starts from a zero mutable baseline',
    baseline.products === 0 &&
      baseline.assets === 0 &&
      baseline.derivatives === 0 &&
      baseline.productMedia === 0 &&
      baseline.jobAttempts === 0 &&
      baseline.publishedAudit === 0 &&
      baseline.unpublishedAudit === 0 &&
      baseline.publishedOutbox === 0 &&
      baseline.unpublishedOutbox === 0 &&
      baseline.inspectionOutbox === 0,
    baseline,
  );
  record(
    'prerequisites are present: migration-owned categories and the published worker policy',
    baseline.categories === 4 && baseline.workerPolicy === 1,
    { categories: baseline.categories, workerPolicy: baseline.workerPolicy },
  );
  record(
    'one synthetic staff identity was created through the API bootstrap CLI',
    prerequisites.staff.accounts === 1,
    { status: prerequisites.staff.status, accounts: prerequisites.staff.accounts },
  );

  const fixture = writeFixtureImage(fixtureDir);
  record(
    'a deterministic project-owned PNG was generated for this run',
    {
      ok: fixture.bytes > 1000 && fixture.mimeType === 'image/png',
    }.ok,
    { bytes: fixture.bytes, width: fixture.width, height: fixture.height },
  );

  // --- production runtime identities ----------------------------------------
  // The worker declares no healthcheck, so its inspect format omits health and
  // reports running state instead — asking for a field a container does not have
  // makes the whole template render empty.
  for (const [label, container, healthy] of [
    ['API', 'embroidery-dev-api-1', true],
    ['Admin', 'embroidery-dev-admin-1', true],
    ['worker', 'embroidery-dev-worker-1', false],
    ['Storefront', 'embroidery-dev-storefront-1', true],
  ]) {
    const facts = docker.run([
      'inspect',
      '--format',
      healthy
        ? '{{.Config.Image}}|{{json .Config.Cmd}}|{{len .Mounts}}|{{.State.Health.Status}}'
        : '{{.Config.Image}}|{{json .Config.Cmd}}|{{len .Mounts}}|{{.State.Status}}',
      container,
    ]);
    const [image, cmd, mounts, health] = facts.stdout.trim().split('|');
    record(
      `${label} runs the production runtime with zero development mounts`,
      {
        ok: Number(mounts) === 0 && (healthy ? health === 'healthy' : health === 'running'),
      }.ok,
      { image, cmd, mounts: Number(mounts), health },
    );
  }

  const browser = await chromium.launch();
  const productName = `Tác phẩm E01 ${runId.slice(0, 8)}`;
  const description =
    'Một tác phẩm thử nghiệm cho hành trình xuất bản đầu cuối, thêu tay trên nền vải lanh mộc.';

  try {
    // --- Journey 1: authenticate -------------------------------------------
    const adminContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const admin = await adminContext.newPage();
    await login(admin, {
      baseUrl: adminBaseUrl,
      email: staff.email,
      password: staff.password,
      record,
    });

    // --- Journey 2: upload, and let the worker do the work -------------------
    const assetId = await uploadAsset(admin, { baseUrl: adminBaseUrl, fixture, record });

    // --- Journey 3: create the draft ----------------------------------------
    const draft = await createDraft(admin, {
      baseUrl: adminBaseUrl,
      name: productName,
      description,
      record,
    });

    // --- Journey 4: price and media -----------------------------------------
    await completeDraft(admin, { slug: draft.slug, price: PRICE, record });

    // --- Journey 5: readiness and publish -----------------------------------
    await publish(admin, {
      baseUrl: adminBaseUrl,
      productId: draft.productId,
      slug: draft.slug,
      record,
    });

    const product = {
      name: productName,
      slug: draft.slug,
      categorySlug: 'thu-bong',
      price: PRICE,
      descriptionFragment: 'thêu tay trên nền vải lanh mộc',
    };

    // --- Journeys 6 and 7: the public surfaces ------------------------------
    await assertDiscoverable(browser, { baseUrl: storefrontBaseUrl, product, record });
    await assertDetail(browser, { baseUrl: storefrontBaseUrl, product, record });

    // Capture the live media addresses before revocation, from the response
    // itself rather than from a rebuilt guess.
    const live = await fetchRaw(browser, `${storefrontBaseUrl}/san-pham/${product.slug}`);
    const detailPaths = mediaPathsFromDetail(live.html);
    const listing = await fetchRaw(browser, `${storefrontBaseUrl}/kham-pha`);
    const cardPaths = mediaPathsFromDetail(listing.html);
    const mediaPaths = [
      ['THUMBNAIL', cardPaths[0]],
      ['CATALOG_PREVIEW', detailPaths[0]],
    ].filter(([, path]) => typeof path === 'string');
    record('both public media renditions are live before revocation', mediaPaths.length === 2, {
      renditions: mediaPaths.map(([label]) => label),
    });
    for (const [label, path] of mediaPaths) {
      const media = await fetchRaw(browser, `${storefrontBaseUrl}${path}`);
      record(`the ${label} rendition streams while published`, media.status === 200, {
        status: media.status,
      });
    }

    // --- Journey 8: unpublish and revocation ---------------------------------
    await unpublish(admin, {
      baseUrl: adminBaseUrl,
      productId: draft.productId,
      slug: draft.slug,
      record,
    });
    await assertRevoked(browser, { baseUrl: storefrontBaseUrl, product, mediaPaths, record });
    await assertUnknownSlugSafety(browser, { baseUrl: storefrontBaseUrl, record });
    await assertAnonymousProtection(browser, { baseUrl: adminBaseUrl, record });

    // --- Journey 9: republish, then leave it as a draft ----------------------
    const mediaBefore = evidence.productMedia(draft.slug).length;
    const derivativesBefore = evidence.derivatives(assetId).length;
    await publish(admin, {
      baseUrl: adminBaseUrl,
      productId: draft.productId,
      slug: draft.slug,
      record,
      label: 'republish',
    });
    record(
      'republish reused the existing Asset, media and derivatives',
      {
        ok:
          evidence.productMedia(draft.slug).length === mediaBefore &&
          evidence.derivatives(assetId).length === derivativesBefore,
      }.ok,
      { media: mediaBefore, derivatives: derivativesBefore },
    );
    record(
      'the server-owned slug is unchanged after republish',
      {
        ok: evidence.product(draft.slug)?.status === 'PUBLISHED',
      }.ok,
      { slug: draft.slug },
    );

    const back = await fetchRaw(browser, `${storefrontBaseUrl}/san-pham/${draft.slug}`);
    record(
      'the same detail route serves the Product again',
      {
        ok: back.status === 200 && back.html.includes(productName),
      }.ok,
      { status: back.status },
    );

    await unpublish(admin, {
      baseUrl: adminBaseUrl,
      productId: draft.productId,
      slug: draft.slug,
      record,
      label: 'final unpublish',
    });

    // --- balance and worker boundaries --------------------------------------
    // Deltas, not totals: the baseline may be non-zero and the journey owns
    // only what it added.
    const published = evidence.auditCount('product.published') - baseline.publishedAudit;
    const unpublished = evidence.auditCount('product.unpublished') - baseline.unpublishedAudit;
    record(
      'published and unpublished Audit evidence added by E01 balances at 2 each',
      published === unpublished && published === 2,
      { publishedAdded: published, unpublishedAdded: unpublished },
    );
    const publishedOutbox = evidence.outboxByType('product.published');
    const unpublishedOutbox = evidence.outboxByType('product.unpublished');
    const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
    const publishedAdded = total(publishedOutbox) - baseline.publishedOutbox;
    const unpublishedAdded = total(unpublishedOutbox) - baseline.unpublishedOutbox;
    record(
      'published and unpublished Outbox evidence added by E01 balances at 2 each',
      publishedAdded === unpublishedAdded && publishedAdded === 2,
      { publishedAdded, unpublishedAdded },
    );
    record(
      'publication events remain undispatched — no APP2 consumer owns them',
      {
        ok: (publishedOutbox.DISPATCHED ?? 0) === 0 && (unpublishedOutbox.DISPATCHED ?? 0) === 0,
      }.ok,
      { published: publishedOutbox, unpublished: unpublishedOutbox },
    );

    const attempts = evidence.jobAttempts();
    record(
      'the worker claimed only registered Asset-processing work',
      {
        ok:
          attempts.length > baseline.jobAttempts &&
          attempts.every((row) => row.kind === 'ASSET_PROCESSING'),
      }.ok,
      { kinds: [...new Set(attempts.map((row) => row.kind))] },
    );

    // --- non-disclosure ------------------------------------------------------
    const surfaces = [live.html, listing.html, back.html].join('\n');
    record(
      'no storage key, bucket or provider endpoint reached any public surface',
      {
        ok: !/minio|amazonaws|originals\/|derivatives\/|storage_key/i.test(surfaces),
      }.ok,
      {},
    );
    record(
      'no raw domain code, request id, stack or SQL reached any public surface',
      {
        ok: !/SQLSTATE|at Object\.|requestId|PRODUCT_VERSION_CONFLICT/i.test(surfaces),
      }.ok,
      {},
    );

    const minio = await fetchRaw(browser, `${storefrontBaseUrl}/minio/health/live`).catch(() => ({
      status: 0,
    }));
    record('the private object store is not reachable through the gateway', minio.status !== 200, {
      status: minio.status,
    });

    await adminContext.close();
    return { assetId, product: draft };
  } finally {
    await browser.close();
  }
}

export { mediaPathsFromDetail, waitFor, sql };
