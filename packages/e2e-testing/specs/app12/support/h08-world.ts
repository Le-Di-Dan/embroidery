/**
 * The shared world of the `APP12-H08` accessibility and compatibility run.
 *
 * ## Nothing here is a second commercial universe
 *
 * H08 audits the surfaces `APP12-S01`…`S03` and `A02-C1` delivered, so it drives
 * the worlds those checkpoints already built rather than seeding its own. The
 * catalog is `seedS02Catalog`'s, the order is placed through the delivered
 * checkout by `placeOrder`, the secure link is the one the worker delivered, and
 * the operator logs in through the real form. An accessibility finding on a page
 * a fixture painted is a finding about the fixture, which is the whole reason
 * this run costs a full topology.
 *
 * What this module adds is half the **audit vocabulary**: the run's shared
 * viewports and proof record, the automated rule scan, and the landmark and
 * heading assertions — everything that asks what the **document says**. The
 * measured half — contrast, reflow, target size and the keyboard — lives beside
 * it in `h08-metrics.ts`, split by that question rather than by line count.
 *
 * ## Nothing secret crosses this boundary
 *
 * The scanner drops element HTML at the page boundary (`h08-axe.mjs`), the
 * measurements return colours, rectangles and integers, and the focus walk reads
 * accessible names but never an input's `value`. No helper here returns a token,
 * a code, an envelope or a contact, and the failure messages name rules and
 * selectors rather than content.
 *
 * Test-only.
 */
import { expect, type Page } from '@playwright/test';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so everything imported from it arrives untyped.
   As in `s03-world.ts`, this module treats those imports as `any` and lets each
   explicit `expect` in the specs be the contract. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

/** The three approved viewports (`APP12-D01` §L), reused rather than invented. */
export const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

/** The two the Admin is drawn at. `APP12-D01` §L draws no mobile operator tool. */
export const ADMIN_VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 800 },
] as const;

/**
 * 200% zoom, expressed as a viewport rather than as a browser zoom level.
 *
 * Chromium's `deviceScaleFactor` does not change CSS pixel width, and Playwright
 * exposes no browser-zoom control at all, so "200% zoom" is reproduced the way
 * WCAG defines it: the CSS viewport is halved and the page must still work. 720
 * is half of the 1440 reference; 512 is half of 1024.
 */
export const ZOOM_200 = [
  { name: '1440@200%', width: 720, height: 450 },
  { name: '1024@200%', width: 512, height: 400 },
] as const;

/**
 * The three locked design tokens `PO-APP12-004` already owns.
 *
 * ## Why contrast is measured here and repaired somewhere else
 *
 * The pre-implementation audit measured every contrast failure in both
 * applications and found that all of them are produced by three values in
 * `packages/styles/src/settings/_color.scss`, which that file declares locked
 * against Figma foundation node `101-13`:
 *
 * ```text
 * $color-action-primary   #e8475f   white text on the primary CTA
 * $color-text-tertiary    #9ca3af   captions, fine print, the rights line
 * $color-text-secondary   #6b7280   secondary body copy
 * ```
 *
 * The Product Owner resolved that finding as `PO-APP12-004`: **bounded
 * design-token correction authority, granted to `APP12-V02`**, with before/after
 * measurement across both apps and a `DESIGN_SYSTEM_FOUNDATION.md` update. The
 * same reconciliation routes accessibility explicitly — *"contrast judged
 * post-`V02`"*. H08 runs before `V01`, so darkening a locked foundation token
 * here would execute another checkpoint's authorised correction and destroy the
 * before-state `V02` owes evidence against.
 *
 * So H08 does the part that is its own, and does it more strictly than axe
 * alone: it measures every rendered pair on every audited screen and asserts
 * that every failure is **two locked design tokens meeting each other** — see
 * {@link expectContrastIsTokenOwned}. A component that hard-coded a colour would
 * fail there, and that would be an H08 defect under §13's "small contrast
 * defects". Nothing is waived; the ownership is the one already recorded.
 *
 * These three are listed so the evidence can separate *what the ruling already
 * names* from *what H08 found beyond it*: the run reports `beyond_po_004` per
 * screen, and a token pair appearing there is a new finding for `V02` rather
 * than a restatement of the audit's.
 *
 * The `color-contrast` rule is therefore excluded from the automated **gate**
 * (§10's serious/critical count) and never from the **measurement**. That is the
 * opposite of suppressing a rule to reach a number: the rule's own data is what
 * the §K evidence is built from.
 */
export const PO_APP12_004_TOKENS = Object.freeze(['#e8475f', '#9ca3af', '#6b7280']);

/**
 * The one rule the automated gate does not count, and the reason it does not.
 * See {@link PO_APP12_004_TOKENS}.
 */
export const GATE_EXCLUDED_RULES = Object.freeze(['color-contrast']);

/**
 * Opens one connection through the gateway before a project starts working.
 *
 * ## The fault this exists for, named rather than retried away
 *
 * The E2E gateway is Nginx in a container reaching the host's Next processes
 * through `host.docker.internal`, with `proxy_connect_timeout 10s`. On Windows
 * that first hop, after the connection pool has gone idle between projects, has
 * been observed to stall past ten seconds — so the *first* navigation of a
 * project comes back `504 Gateway Time-out`: an Nginx error page with no `main`,
 * no footer and no form.
 *
 * It cost this checkpoint two runs, in two different places, and each time it
 * looked like something else: once like "the shell does not work in Firefox",
 * once like "the checkout has no contact field". Neither was true, and the
 * identical request succeeded immediately afterwards.
 *
 * So the connection is opened deliberately, before the work, on a route with no
 * assertions attached — and the event is **recorded** when it happens rather
 * than swallowed, so a gateway that is genuinely down still fails the run and a
 * gateway that stalls on every project shows up in the proofs as something to
 * fix. It is a warm-up, not a retry loop: the number of attempts is bounded and
 * a persistent failure raises.
 *
 * Recorded for the harness owner as `FU-APP12-H08-04`.
 */
export async function warmGateway(page: Page, label: string): Promise<void> {
  const PROXY_STALLED = [502, 503, 504];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.goto('/');
    const status = response?.status() ?? 0;
    if (!PROXY_STALLED.includes(status)) {
      if (attempt > 0) record(`gateway.${label}.warm_attempts`, attempt + 1);
      return;
    }
    record(`gateway.${label}.stalled`, `attempt ${String(attempt + 1)} answered ${String(status)}`);
  }
  throw new Error(
    `the gateway answered a proxy error three times for ${label} — this is the environment, not the page`,
  );
}

/** Safe facts only: booleans, counts, ratios and rule ids. Never a secret. */
export const proofs: Record<string, boolean | number | string> = {};

export function record(key: string, value: boolean | number | string): void {
  proofs[key] = value;
}

export function reportProofs(label: string): void {
  process.stdout.write(`${label} ${JSON.stringify(proofs)}\n`);
}

/**
 * The two plain-ESM harness modules, loaded lazily.
 *
 * Exported because `h08-metrics.ts` is the other half of this vocabulary and
 * needs the same two loaders; a second pair of dynamic imports there would be
 * two module instances of a scanner that caches the axe bundle.
 */
export async function loadAxe(): Promise<any> {
  return import('../../../support/app12/h08-axe.mjs');
}

export async function loadMeasure(): Promise<any> {
  return import('../../../support/app12/h08-measure.mjs');
}

const axe = loadAxe;

/**
 * Scans one page (or one region of it) and fails on any serious or critical
 * WCAG 2.2 AA violation.
 *
 * The gate is `APP12-H08` §10's exactly: serious and critical are zero, and
 * everything below is returned so a spec can record it for the manual review the
 * same section requires. No rule is ever disabled to reach the number.
 */
export async function expectNoSeriousViolations(
  page: Page,
  label: string,
  options: { readonly include?: string } = {},
): Promise<any> {
  const { runAxe, describeViolations } = await axe();
  const scan = await runAxe(page, {
    label,
    disableRules: [...GATE_EXCLUDED_RULES],
    ...options,
  });
  record(`axe.${label}.violations`, scan.violations.length);
  record(`axe.${label}.serious_critical`, scan.gated.length);
  if (scan.violations.length > 0) {
    record(
      `axe.${label}.rules`,
      scan.violations.map((violation: any) => `${violation.impact}/${violation.id}`).join(','),
    );
  }
  expect(scan.gated.length, `axe ${label}: ${describeViolations(scan)}`).toBe(0);
  return scan;
}

/** The best-practice pass — reviewed by a human, never gated (§10). */
export async function scanBestPractice(page: Page, label: string): Promise<any> {
  const { runAxe, BEST_PRACTICE_TAGS } = await axe();
  const scan = await runAxe(page, { label, tags: BEST_PRACTICE_TAGS });
  record(
    `bestpractice.${label}`,
    scan.violations.length === 0
      ? 'none'
      : scan.violations.map((violation: any) => `${violation.impact}/${violation.id}`).join(','),
  );
  return scan;
}

/**
 * The document's landmark and heading skeleton, as assistive technology sees it.
 *
 * Counts and names only. Used to prove exactly one `main`, exactly one
 * `contentinfo`, exactly one `h1`, and a heading order with no skipped level.
 */
export async function documentStructure(page: Page): Promise<{
  readonly main: number;
  readonly banner: number;
  readonly contentinfo: number;
  readonly navNames: string[];
  readonly h1: string[];
  readonly headingLevels: number[];
  readonly skippedLevels: string[];
}> {
  return page.evaluate(() => {
    // `<header>` and `<footer>` are only `banner`/`contentinfo` when they are
    // **not** scoped inside a sectioning element — a `<footer>` inside an
    // `<article>` is not a landmark at all. Counting every element with the tag
    // name would report landmarks the accessibility tree does not contain, so
    // the scoping rule is applied here rather than assumed away.
    const SECTIONING = 'article, aside, main, nav, section';
    const scoped = (element: Element): boolean =>
      element.hasAttribute('role') ? false : element.parentElement?.closest(SECTIONING) !== null;
    const banners = Array.from(document.querySelectorAll('header, [role="banner"]')).filter(
      (element) => !scoped(element),
    );
    const contentinfos = Array.from(
      document.querySelectorAll('footer, [role="contentinfo"]'),
    ).filter((element) => !scoped(element));
    const nav = Array.from(document.querySelectorAll('nav, [role="navigation"]'));
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(
      (heading) => {
        const style = window.getComputedStyle(heading);
        return style.display !== 'none' && style.visibility !== 'hidden';
      },
    );
    const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
    const skipped: string[] = [];
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1] ?? 0;
      const current = levels[index] ?? 0;
      if (current > previous + 1) skipped.push(`h${String(previous)}→h${String(current)}`);
    }
    return {
      main: document.querySelectorAll('main, [role="main"]').length,
      banner: banners.length,
      contentinfo: contentinfos.length,
      navNames: nav.map(
        (element) =>
          element.getAttribute('aria-label') ??
          element.getAttribute('aria-labelledby') ??
          '(unnamed)',
      ),
      h1: Array.from(document.querySelectorAll('h1')).map((heading) =>
        (heading.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      ),
      headingLevels: levels,
      skippedLevels: skipped,
    };
  });
}

/**
 * Proves the shell's landmark contract on whatever page is open.
 *
 * Exactly one `main`, **at most** one `contentinfo`, exactly one `h1`, no
 * skipped heading level, and every navigation landmark distinctly named — the
 * last because the Storefront renders the bar nav and the drawer nav from one
 * component and `APP1-S01A` deliberately gave them different names so assistive
 * technology can tell them apart.
 *
 * ## Why `contentinfo` is "at most one" and not "exactly one"
 *
 * The Storefront shell publishes a footer on every route and the Admin shell
 * publishes none — on any screen, including the login page, which has no shell
 * at all. Neither is a defect: WCAG requires no particular landmark, and an
 * operator tool with nothing to put in a footer should not grow an empty one to
 * satisfy a rule. What *would* be a defect is two, because a second
 * `contentinfo` makes the first unfindable — which is the mistake `APP4-S01`
 * actually shipped with `<main>` and caught in a browser rather than in jsdom.
 * So the assertion is the one that catches a real fault, and the Storefront's
 * own "there is a footer" is asserted where it belongs: in the Storefront spec,
 * on the `contentinfo` role directly.
 */
export async function expectShellLandmarks(page: Page, label: string): Promise<void> {
  const structure = await documentStructure(page);
  record(`landmarks.${label}.main`, structure.main);
  record(`landmarks.${label}.contentinfo`, structure.contentinfo);
  record(`landmarks.${label}.h1`, structure.h1.length);
  record(`landmarks.${label}.nav`, structure.navNames.join('|'));

  expect(structure.main, `${label}: exactly one main landmark`).toBe(1);
  expect(
    structure.contentinfo,
    `${label}: at most one contentinfo landmark — a second makes the first unfindable`,
  ).toBeLessThanOrEqual(1);
  expect(structure.h1.length, `${label}: exactly one h1 — found ${structure.h1.join(' / ')}`).toBe(
    1,
  );
  expect(
    structure.skippedLevels,
    `${label}: heading levels skip — ${structure.skippedLevels.join(', ')}`,
  ).toStrictEqual([]);
  const named = structure.navNames.filter((name) => name !== '(unnamed)');
  expect(
    new Set(named).size,
    `${label}: navigation landmarks share a name — ${structure.navNames.join(', ')}`,
  ).toBe(named.length);
}
