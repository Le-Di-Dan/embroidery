/**
 * `APP12-V01` — the anonymous Storefront tour.
 *
 * Every Wave-1 Storefront route a customer can reach without a credential, at
 * 1440, 1024 and 390, against the density fixture. This is the project that
 * makes §9's "all screens, not samples" true for the public half: the route list
 * below is the App Router tree minus the seven Wave-2 routes `APP12-G02`
 * withholds and minus the two surfaces that need an order, which the commerce
 * project audits because it is the one that creates it.
 *
 * ## The withheld routes are photographed too
 *
 * Not to audit them — there is nothing there to audit, and the roadmap gives
 * Wave-2 UAT to `W01`…`W03` — but because §9 asks V01 to *account for* all 20,
 * and "it answers the canonical not-found page" is a claim that should have a
 * picture next to it rather than a sentence.
 *
 * Audit only. Nothing here writes.
 */
import { test } from '@playwright/test';

import {
  VIEWPORTS,
  auditRouteAcross,
  createAuditLedger,
  envList,
  loadEvidence,
  requiredEnv,
  type AuditLedger,
} from './support/v01-world';

/* Plain-ESM helper layer; see `v01-world.ts`. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-call */

test.describe.configure({ mode: 'serial', timeout: 900_000 });

const SURFACE = 'storefront';

/** The four policy slugs `/chinh-sach/[slug]` resolves, and nothing else. */
const POLICIES = [
  { slug: 'giao-hang', state: 'shipping' },
  { slug: 'thanh-toan', state: 'payment' },
  { slug: 'doi-tra', state: 'returns' },
  { slug: 'bao-mat', state: 'privacy' },
] as const;

/** The seven Wave-2 routes, recorded as withheld rather than audited. */
const WITHHELD = [
  { route: 'withheld-request-new', path: '/yeu-cau/moi' },
  { route: 'withheld-request-sent', path: '/yeu-cau/da-gui' },
  { route: 'withheld-quotation', path: '/truy-cap/bao-gia' },
  { route: 'withheld-design-review', path: '/truy-cap/duyet-thiet-ke' },
  { route: 'withheld-deposit', path: '/truy-cap/thanh-toan' },
  { route: 'withheld-final-payment', path: '/truy-cap/thanh-toan-con-lai' },
] as const;

let ledger: AuditLedger;

test.beforeAll(async () => {
  ledger = await createAuditLedger('storefront-public');
});

test.afterAll(async () => {
  const { appendAuditLog } = await loadEvidence();
  appendAuditLog({
    cluster: 'Cluster 1 — Storefront shell, content and discovery (anonymous)',
    screens: ledger.screens(),
    screenshots: ledger.screenshots(),
    routes: ledger.routes(),
    concerns: [
      'measured; density, hierarchy and CTA judgements are made from these ledgers',
      'see data/storefront-public-measurements.json',
    ],
    next: 'Cluster 2 — Product Detail, checkout and the secure order surface',
  });
});

test('A — the shell and the content routes', async ({ page }) => {
  for (const route of [
    { route: 'home', path: '/', aboveFold: true },
    { route: 'services', path: '/dich-vu', aboveFold: true },
    { route: 'faq', path: '/cau-hoi-thuong-gap', aboveFold: true },
    { route: 'store', path: '/cua-hang', aboveFold: true },
  ]) {
    await auditRouteAcross(page, ledger, {
      surface: SURFACE,
      route: route.route,
      path: route.path,
      viewports: VIEWPORTS,
      aboveFold: route.aboveFold,
    });
  }
});

test('B — the policy family', async ({ page }) => {
  // The shipping policy carries the full viewport matrix; the other three are
  // the same template with different body copy, so they are captured at the
  // reference desktop only. Stated here rather than left to be inferred from a
  // gap in the evidence directory.
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'policy',
    path: '/chinh-sach/giao-hang',
    viewports: VIEWPORTS,
    state: 'shipping',
    aboveFold: true,
  });
  for (const policy of POLICIES.slice(1)) {
    await auditRouteAcross(page, ledger, {
      surface: SURFACE,
      route: 'policy',
      path: `/chinh-sach/${policy.slug}`,
      viewports: VIEWPORTS.slice(0, 1),
      state: policy.state,
    });
  }
});

test('C — discovery and the gallery', async ({ page }) => {
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'discover',
    path: '/kham-pha',
    viewports: VIEWPORTS,
    aboveFold: true,
  });
  // The same route carrying a real filter: the state an operator's taxonomy
  // actually produces, and the one that shows how the grid behaves when the
  // result set shrinks.
  const categories = envList('E2E_APP12_V01_CATEGORIES');
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'discover',
    path: `/kham-pha?category=${categories[0]}`,
    viewports: VIEWPORTS,
    state: 'category-filtered',
    aboveFold: true,
  });

  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'gallery-feed',
    path: '/bo-suu-tap',
    viewports: VIEWPORTS,
    aboveFold: true,
  });
  const gallery = envList('E2E_APP12_V01_GALLERY');
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'gallery-entry',
    path: `/bo-suu-tap/${gallery[0]}`,
    viewports: VIEWPORTS,
    aboveFold: true,
  });
});

test('D — the browsing states of Product Detail', async ({ page }) => {
  // The purchase states themselves belong to the commerce project, which places
  // a real order; what is audited here is the *browsing* composition — a Product
  // whose every SKU is out of stock, and one with four variants across two axes,
  // because those are the two shapes that change the panel's density.
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'product-detail',
    path: `/san-pham/${requiredEnv('E2E_APP12_V01_OUT_OF_STOCK')}`,
    viewports: VIEWPORTS,
    state: 'out-of-stock',
    aboveFold: true,
  });
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'product-detail',
    path: `/san-pham/${requiredEnv('E2E_APP12_V01_MULTI_VARIANT')}`,
    viewports: VIEWPORTS,
    state: 'multi-variant',
    aboveFold: true,
  });
});

test('E — the secure entry points', async ({ page }) => {
  // Both are anonymous: `/truy-cap` is the landing a customer reaches with no
  // credential at all, and `/xac-minh-lien-he` is the verification screen. The
  // credential-bearing states of `/truy-cap/don-hang` are the commerce
  // project's, which is the one that can mint a grant.
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'secure-landing',
    path: '/truy-cap',
    viewports: VIEWPORTS,
    state: 'no-credential',
    aboveFold: true,
  });
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'verify-contact',
    path: '/xac-minh-lien-he',
    viewports: VIEWPORTS,
    state: 'entry',
    aboveFold: true,
  });
});

test('F — the not-found page, and the Wave-2 routes that answer it', async ({ page }) => {
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'not-found',
    path: '/dia-chi-khong-ton-tai',
    viewports: VIEWPORTS,
    state: 'unknown-address',
    aboveFold: true,
  });
  for (const withheld of WITHHELD) {
    await auditRouteAcross(page, ledger, {
      surface: SURFACE,
      route: withheld.route,
      path: withheld.path,
      viewports: VIEWPORTS.slice(0, 1),
      state: 'wave2-withheld',
    });
  }
  // The Studio route is shape-matched rather than listed, so it is addressed
  // through a real Product slug — the only way to reach the pattern at all.
  await auditRouteAcross(page, ledger, {
    surface: SURFACE,
    route: 'withheld-studio',
    path: `/san-pham/${requiredEnv('E2E_APP12_V01_IN_STOCK')}/thiet-ke`,
    viewports: VIEWPORTS.slice(0, 1),
    state: 'wave2-withheld',
  });
});
