/**
 * The shared world for the `APP12-M01.E1` cross-boundary acceptance run.
 *
 * Everything here is **test-only** and every write lands in the run's disposable
 * database, which the orchestrator drops afterwards. No shared development
 * database is touched and no `APP12-G03` dataset is created.
 *
 * ## What this file owns, and what it deliberately does not
 *
 * `M01.E1` re-proves the Admin journeys `A1` accepted and the Storefront
 * journeys `S1` accepted, over one catalog rather than two. The screen
 * vocabulary for each of those already exists — `m01a1-world` for the operator's
 * side, `m01s1-world` for the visitor's — and is imported rather than
 * transcribed a third time, because a third copy of the same Vietnamese is a
 * third thing to drift.
 *
 * What is new here is only what neither package could have: the two origins in
 * one run, the two E1 Products, and the four public surfaces §11 and §12 assert
 * agree with each other.
 *
 * Never imported by application code.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

export { COPY as ADMIN_COPY, NAMES, VIEWPORTS } from './m01a1-world';
export { COPY as SF_COPY } from './m01s1-world';

export type ViewportName = 'desktop' | 'tablet' | 'mobile';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required for the APP12-M01.E1 acceptance run.`);
  }
  return value;
}

function requiredList(name: string): string[] {
  return requiredEnv(name)
    .split(',')
    .filter((entry) => entry !== '');
}

/** The two Products that exist for the cross-boundary journeys and nothing else. */
export const E1 = {
  propagateId: () => requiredEnv('E2E_APP12_M01E1_PROPAGATE_ID'),
  propagateSlug: () => requiredEnv('E2E_APP12_M01E1_PROPAGATE_SLUG'),
  propagateAssets: () => requiredList('E2E_APP12_M01E1_PROPAGATE_ASSETS'),
  degradeId: () => requiredEnv('E2E_APP12_M01E1_DEGRADE_ID'),
  degradeSlug: () => requiredEnv('E2E_APP12_M01E1_DEGRADE_SLUG'),
  degradeAssets: () => requiredList('E2E_APP12_M01E1_DEGRADE_ASSETS'),
  storedPrimary: () => requiredEnv('E2E_APP12_M01E1_STORED_PRIMARY'),
  categorySlug: () => requiredEnv('E2E_APP12_M01E1_CATEGORY'),
  publishedId: () => requiredEnv('E2E_APP12_M01E1_PUBLISHED_ID'),
  publishedSlug: () => requiredEnv('E2E_APP12_M01E1_PUBLISHED_SLUG'),
  publishedAssets: () => requiredList('E2E_APP12_M01E1_PUBLISHED_ASSETS'),
  refusalId: () => requiredEnv('E2E_APP12_M01E1_REFUSAL_ID'),
  refusalSlug: () => requiredEnv('E2E_APP12_M01E1_REFUSAL_SLUG'),
  refusalAssets: () => requiredList('E2E_APP12_M01E1_REFUSAL_ASSETS'),
  refusalRevocable: () => requiredEnv('E2E_APP12_M01E1_REFUSAL_REVOCABLE'),
  signalId: () => requiredEnv('E2E_APP12_M01E1_SIGNAL_ID'),
  signalSlug: () => requiredEnv('E2E_APP12_M01E1_SIGNAL_SLUG'),
  signalAssets: () => requiredList('E2E_APP12_M01E1_SIGNAL_ASSETS'),
  signalPrimary: () => requiredEnv('E2E_APP12_M01E1_SIGNAL_PRIMARY'),
  domainId: () => requiredEnv('E2E_APP12_M01E1_DOMAIN_ID'),
  domainPool: () => requiredList('E2E_APP12_M01E1_DOMAIN_POOL'),
} as const;

export const databaseUrl = (): string => requiredEnv('E2E_DATABASE_URL');

/**
 * One operator session, opened once for a whole spec file.
 *
 * Not a convenience. `staff-auth.config.ts` limits staff logins to **20 per IP
 * per 15 minutes**, and a successful login clears only the *identifier*
 * dimension — the IP budget is spent either way. `M01.E1` runs thirty-three
 * journeys across four projects from one host, so a `beforeEach` login exhausts
 * that budget partway through the run and every later journey then fails at the
 * login form for a reason that has nothing to do with what it tests. That is the
 * rate limiter working correctly; the harness is what has to change.
 *
 * One session per file is also the more faithful journey: an operator curating
 * six Products logs in once.
 *
 * The page comes from a context of its own rather than from the `page` fixture,
 * so Playwright's per-test screenshot and trace capture do not apply to it —
 * which is why every journey here asserts on values it read rather than on an
 * image a reviewer would have to interpret.
 */
export function operatorSession(): { page: () => Page } {
  let context: BrowserContext | undefined;
  let open: Page | undefined;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    open = await context.newPage();
    const { loginAsOperator } = await import('./m01a1-world');
    const session = open;
    // Retried once, and only the *navigation to the form* is what this guards:
    // six contexts open a fresh Admin page in one run, and a login page that has
    // not rendered its inputs within 30 s is an Admin still warming up, not a
    // defect in the journey about to run. The login itself is unchanged — the
    // real form, the real credentials, no cookie injection — so a genuine auth
    // failure still fails here.
    //
    // Two attempts is the ceiling on purpose: `staff-auth.config.ts` allows 20
    // staff logins per IP per 15 minutes, and an unbounded retry would spend
    // that budget on a stuck page and take the rest of the run down with it.
    await expect(async () => {
      await loginAsOperator(session);
    }).toPass({ intervals: [2_000], timeout: 90_000 });
  });

  test.afterAll(async () => {
    await context?.close();
    context = undefined;
    open = undefined;
  });

  return {
    page: () => {
      if (open === undefined) {
        throw new Error('The operator session is not open — did `beforeAll` run?');
      }
      return open;
    },
  };
}
/**
 * Opens a Product Detail page and waits until its gallery is actually painted.
 *
 * `openProduct` waits for the gallery *region*, which exists before the stage
 * image does. On a twenty-image page — twenty real derivatives through a real
 * gateway — that gap is wide enough for an assertion on the stage to run against
 * a region that has one, and the failure then reads as a missing element rather
 * than as a page still arriving.
 */
export async function openGallery(page: Page, slug: string): Promise<void> {
  const { openProduct, stageImage } = await import('./m01s1-world');
  await expect(async () => {
    await openProduct(page, slug);
    await expect(stageImage(page)).toBeVisible({ timeout: 5_000 });
  }).toPass({ intervals: [1_000], timeout: 45_000 });
}

/**
 * Selects one thumbnail and waits for the whole selection to have moved.
 *
 * Addressed by accessible name rather than by index, so a failure means "the
 * control a visitor would press did not select its image" and never "the harness
 * counted wrong".
 *
 * Retried, and deliberately: the strip scrolls horizontally, so at 390 the
 * seventh control starts far outside the viewport, and a click dispatched while
 * the strip is still settling after `scrollIntoViewIfNeeded` lands on a
 * neighbour. The retry is around the *click and its effect together* — the
 * counter, the stage trigger and `aria-current` all have to agree — so a run
 * that merely pressed something cannot pass.
 */
export async function selectStripImage(page: Page, position: number, total: number): Promise<void> {
  const { counterText, strip, thumbnailName, counter } = await import('./m01s1-world');
  const control = strip(page).getByRole('button', { name: thumbnailName(position, total) });
  await expect(control).toHaveCount(1);
  await control.scrollIntoViewIfNeeded();
  await expect(async () => {
    await control.click();
    const current = await strip(page)
      .locator('button[aria-current="true"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
    expect(
      current,
      `after clicking image ${String(position)}, current = ${current.join()}`,
    ).toEqual([thumbnailName(position, total)]);
    await expect(counter(page)).toContainText(counterText(position, total), { timeout: 2_000 });
  }).toPass({ intervals: [500], timeout: 20_000 });
}

export const storefrontOrigin = (): string => requiredEnv('E2E_BASE_STOREFRONT');
export const adminOrigin = (): string => requiredEnv('E2E_BASE_ADMIN');

/**
 * A Storefront address, absolute.
 *
 * The cross-boundary project's `baseURL` is the Admin origin — an operator has
 * to be logged in for the write half of every one of its journeys — so the read
 * half cannot use a relative path. Composing the origin here rather than at each
 * call site is what keeps the two halves in one browser context.
 */
export function sf(path: string): string {
  return new URL(path, storefrontOrigin()).toString();
}

export interface StoredMediaRow {
  /** The association row own id — the identity every public address carries. */
  readonly mediaId: string;
  readonly assetId: string;
  readonly role: string;
  readonly displayOrder: number;
}

/**
 * The stored `product_media` rows, read from the database rather than the API.
 *
 * §12 requires proving a public read mutated nothing, and an assertion made
 * through the same projection the read went through would only prove the
 * projection agrees with itself.
 */
export async function readStoredMedia(productId: string): Promise<StoredMediaRow[]> {
  const { readStoredMedia: read } =
    (await import('../../../support/app12/m01e1-world-mutations.mjs')) as {
      readStoredMedia: (input: {
        databaseUrl: string;
        productId: string;
      }) => Promise<StoredMediaRow[]>;
    };
  return read({ databaseUrl: databaseUrl(), productId });
}

/**
 * Writes one screenshot under `evidences/m01-e1/<viewport>/<name>.png`.
 *
 * Deterministic names, because a random Playwright artifact name cannot be cited
 * from a completion report. Resolved from the repository root the orchestrator
 * passes in, never from the spec's own working directory.
 */
export async function capture(page: Page, viewport: ViewportName, name: string): Promise<string> {
  const path = join(requiredEnv('E2E_REPO_ROOT'), 'evidences', 'm01-e1', viewport, `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  return path;
}

/**
 * The axe gate, with the one authorized exception and nothing else.
 *
 * `color-contrast` is excluded from the **gate** and from nothing else, for the
 * reason `APP12-H08` recorded and `PO-APP12-004` ruled: the failing token pairs
 * are `APP12-V02`'s to change, not this package's. Every other rule counts, and
 * no rule was disabled to reach a number.
 */
export async function expectAxeClean(page: Page, label: string): Promise<void> {
  const { runAxe, describeViolations } = (await import('../../../support/app12/h08-axe.mjs')) as {
    runAxe: (page: Page, options: Record<string, unknown>) => Promise<{ gated: unknown[] }>;
    describeViolations: (scan: unknown) => string;
  };
  const result = await runAxe(page, { label, disableRules: ['color-contrast'] });
  expect(result.gated.length, `axe ${label}: ${describeViolations(result)}`).toBe(0);
}
