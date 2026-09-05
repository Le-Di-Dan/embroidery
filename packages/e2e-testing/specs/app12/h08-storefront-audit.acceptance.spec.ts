/**
 * `APP12-H08` — the Storefront audit that changes nothing.
 *
 * Every case here is an anonymous read of a delivered public surface. No order
 * is created, no verification is issued and no operator is involved, which is
 * why this file can sweep four viewports and three routes cheaply while the
 * journey spec beside it spends a real commercial universe on the one path that
 * needs one.
 *
 * ```text
 * A  landmarks, headings and the automated scan   §9, §10
 * B  the mobile drawer as a real dialog           §2, §4
 * C  contrast, measured and attributed            §8  (see PO_APP12_004_TOKENS)
 * D  reflow at 200% zoom and at 1440/1024/390     §8
 * E  target size at 390                           §8
 * F  reduced motion                               §9
 * ```
 *
 * The brand-system regression (§4) lives in A, because the thing being asserted
 * — that the brand is announced exactly once — is a property of the accessible
 * name tree the shell publishes, not of a separate journey.
 */
import { expect, test } from '@playwright/test';

import { requiredEnv } from './support/s02-world';
import {
  VIEWPORTS,
  ZOOM_200,
  expectNoSeriousViolations,
  expectShellLandmarks,
  record,
  reportProofs,
  scanBestPractice,
  warmGateway,
} from './support/h08-world';
import {
  activeElement,
  expectContrastIsTokenOwned,
  expectNoHorizontalOverflow,
  measureTargetsOn,
  tabThrough,
} from './support/h08-metrics';

/* The audit helpers come from the plain-ESM harness layer, so their results
   arrive untyped; each explicit `expect` below is the contract. Same treatment
   as `s03-world.ts` and for the same reason. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

const PRODUCT = (): string => `/san-pham/${requiredEnv('E2E_APP12_S02_PRODUCT_SLUG')}`;

/** The shared shell every journey in this checkpoint depends on (§1). */
const PUBLIC_ROUTES = () => [
  { label: 'homepage', path: '/' },
  { label: 'discover', path: '/kham-pha' },
  { label: 'product-detail', path: PRODUCT() },
  { label: 'secure-landing', path: '/truy-cap/don-hang' },
];

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  reportProofs('[app12-h08-storefront-audit]');
});

test('A — the shared shell publishes one main, one footer, one h1 and one brand name', async ({
  page,
}) => {
  // See `warmGateway`: the gateway's first connection of a project can stall.
  await warmGateway(page, 'storefront-audit');

  for (const route of PUBLIC_ROUTES()) {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The Storefront's own footer, asserted here rather than in the shared
    // landmark helper: the Admin publishes none and correctly so.
    await expect(page.getByRole('contentinfo')).toBeVisible();

    await expectShellLandmarks(page, route.label);
    await expectNoSeriousViolations(page, route.label);
    await scanBestPractice(page, route.label);
  }

  // §4 — the brand-system regression, asserted where it actually lives: in the
  // accessible-name tree.
  //
  // `StorefrontBrand` renders **two** symbols and lets CSS show one, and the
  // footer renders a third. All three are `BrandSymbol`s without a `label`, so
  // all three are `aria-hidden` and none of them is announced — which is the
  // rule the package states and the reason the wordmark beside them is the name.
  await page.goto('/');
  const brand = await page.evaluate(() => {
    const symbols = Array.from(document.querySelectorAll('svg'));
    const namedFor = (root: ParentNode): string[] =>
      Array.from(root.querySelectorAll('a, button, [role="img"]'))
        .map((element) => element.getAttribute('aria-label') ?? '')
        .filter((name) => name.includes('Nét Thêu'));
    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    return {
      symbols: symbols.length,
      named: symbols.filter((svg) => svg.getAttribute('aria-hidden') !== 'true').length,
      inHeader: header === null ? [] : namedFor(header),
      inFooter: footer === null ? [] : namedFor(footer),
      // The wordmark is live text in both lockups, and it is what the symbol
      // beside it stands in for. Counting the visible occurrences is how a
      // *second* announcement inside one lockup would be caught.
      headerWordmarks:
        header === null
          ? 0
          : Array.from(header.querySelectorAll('*')).filter(
              (element) => element.children.length === 0 && element.textContent === 'Nét Thêu',
            ).length,
      // The watermark must stay out of the tree entirely (§4).
      watermarks: document.querySelectorAll('[class*="watermark"]:not([aria-hidden="true"])')
        .length,
    };
  });
  record('brand.symbols', brand.symbols);
  record('brand.symbols_named', brand.named);
  record('brand.header_names', brand.inHeader.join('|'));
  record('brand.footer_names', brand.inFooter.join('|'));

  expect(brand.named, 'every brand symbol is decorative — the wordmark is the name').toBe(0);
  // Two brand lockups on the page — the header's and the footer's — and each
  // announces the brand exactly once. That is the §4 rule: not that the brand
  // appears once on a page (a footer mark is ordinary), but that a single lockup
  // never says it twice, which is precisely what would happen if the symbol
  // beside the wordmark were given a label of its own.
  expect(brand.inHeader, 'the header lockup carries one brand name').toHaveLength(1);
  expect(brand.inFooter, 'the footer lockup carries one brand name').toHaveLength(1);
  expect(brand.headerWordmarks, 'the header renders the wordmark once').toBe(1);
  expect(brand.watermarks, 'no watermark is exposed to assistive technology').toBe(0);
});

test('B — the mobile drawer is a real dialog, and gives focus back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const trigger = page.getByRole('button', { name: 'Mở menu điều hướng' });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  // Opened from the keyboard, because that is the case under test. `focus()`
  // would prove the handler runs; tabbing proves a keyboard can reach it at all.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const onTrigger = await activeElement(page);
  expect(onTrigger.name, 'the drawer trigger is the second stop on the compact shell').toBe(
    'Mở menu điều hướng',
  );
  await page.keyboard.press('Enter');

  const drawer = page.getByRole('dialog', { name: 'Điều hướng' });
  await expect(drawer).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');

  // Focus entered the drawer, and Tab cannot leave it. `useFocusTrap` manages
  // every Tab itself, so the walk below must never land outside — asserted as
  // "every stop is inside the dialog" rather than as a cycle length, which would
  // pin an implementation detail.
  const inside = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return dialog !== null && dialog.contains(document.activeElement);
  });
  expect(inside, 'focus enters the drawer on open').toBe(true);

  const walk = await tabThrough(page, 8);
  const escaped = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return dialog === null || !dialog.contains(document.activeElement);
  });
  record('drawer.tab_stops', new Set(walk.map((stop) => stop.name)).size);
  expect(escaped, 'Tab never leaves the open drawer').toBe(false);

  await expectNoSeriousViolations(page, 'storefront-drawer-open');

  // Escape closes, and focus comes back to the control that opened it — the one
  // behaviour `StorefrontMobileNav` owns rather than delegating to the trap.
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  const restored = await activeElement(page);
  expect(restored.name, 'focus returns to the trigger on close').toBe('Mở menu điều hướng');
});

test('C — every contrast failure is two locked tokens meeting, never a local colour', async ({
  page,
}) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of PUBLIC_ROUTES()) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectContrastIsTokenOwned(page, `${route.label}@${viewport.name}`);
    }
  }
});

test('D — nothing scrolls sideways, at any audited width or at 200% zoom', async ({ page }) => {
  for (const viewport of [...VIEWPORTS, ...ZOOM_200]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of PUBLIC_ROUTES()) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page, `${route.label}@${viewport.name}`);

      // Reflow is about content surviving, not only about a scrollbar being
      // absent: a page that fits because a control was clipped away has not
      // passed. The shell's own two required controls are asserted present and
      // hit-testable at every width, including the halved ones.
      await expect(page.getByRole('link', { name: /Nét Thêu/ }).first()).toBeVisible();
      await expect(page.getByRole('contentinfo')).toBeVisible();
    }
  }
});

test('E — every interactive target at 390 satisfies SC 2.5.8', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of PUBLIC_ROUTES()) {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const targets = await measureTargetsOn(page, `${route.label}@390`);
    expect(
      targets.undersized.map(
        (target: { selector: string; width: number; height: number }) =>
          `${target.selector} ${String(target.width)}x${String(target.height)}`,
      ),
      `${route.label}@390: targets under ${String(targets.minPx)}px with neither the inline nor the spacing exception`,
    ).toStrictEqual([]);
  }

  // The drawer's own controls, which only exist once it is open and are the
  // densest cluster on the compact shell.
  await page.goto('/');
  await page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
  await expect(page.getByRole('dialog', { name: 'Điều hướng' })).toBeVisible();
  const drawerTargets = await measureTargetsOn(page, 'drawer@390');
  expect(
    drawerTargets.undersized.map(
      (target: { selector: string; width: number; height: number }) =>
        `${target.selector} ${String(target.width)}x${String(target.height)}`,
    ),
    'drawer@390: targets under 24px with neither exception',
  ).toStrictEqual([]);
});

test('F — nothing animates when the visitor asks for reduced motion', async ({ browser }) => {
  // A fresh context, because `prefers-reduced-motion` is negotiated when the
  // context is created and cannot be flipped on an open page.
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
    baseURL: requiredEnv('E2E_BASE_STOREFRONT'),
  });
  const page = await context.newPage();
  try {
    for (const route of PUBLIC_ROUTES()) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // Every element the browser is *actually* animating, counted from the
      // running animations rather than from the stylesheet — which is the only
      // way to tell a guarded `@keyframes` from an unguarded one.
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === 'running')
          .map((animation) => {
            const effect = animation.effect;
            const target =
              effect !== null && 'target' in effect && effect.target instanceof Element
                ? effect.target.tagName.toLowerCase()
                : 'unknown';
            return `${target}:${String(animation.constructor.name)}`;
          }),
      );
      record(`reducedmotion.${route.label}.running`, running.length);
      expect(
        running,
        `${route.label} keeps animating under prefers-reduced-motion: reduce`,
      ).toStrictEqual([]);
    }
  } finally {
    await context.close();
  }
});
