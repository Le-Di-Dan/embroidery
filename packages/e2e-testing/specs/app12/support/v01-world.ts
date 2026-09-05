/**
 * The shared world of the `APP12-V01` professional UI/UX live audit.
 *
 * ## What an "audit" is here, mechanically
 *
 * One screen, at one viewport, in one state:
 *
 * ```text
 * set the viewport → settle the page (lazy media, fonts, layout)
 *                  → measure it        (v01-ux-probe.mjs — quantities only)
 *                  → photograph it     (v01-evidence.mjs — full page, and the
 *                                       fold when the fold is the story)
 *                  → file both under one key
 * ```
 *
 * Nothing in this module asserts a design opinion, and that is deliberate. §3
 * makes V01 audit-only and §4 makes the judgement a designer's; a spec that
 * failed on "too many characters" would be inventing a threshold the Product
 * Owner did not set, and would stop the run before the next screen was even
 * seen. So the specs **collect**, the run stays green while it collects, and the
 * critique is written afterwards from the numbers and the pictures together.
 *
 * The one thing that *is* asserted is that the screen actually rendered — a
 * gateway error page measures beautifully and says nothing.
 *
 * ## Secrecy
 *
 * `capture` refuses to photograph a page whose URL still carries a credential,
 * and the probe returns no free text. Between them, a live `ORDER_ACCESS`
 * surface can be audited without a token, a code or a contact reaching disk.
 *
 * Test-only.
 */
import { expect, type Page } from '@playwright/test';

/* The harness helper layer is plain ESM `.mjs` — it has to be, because the same
   modules load outside ts-jest — so everything imported from it arrives untyped.
   As in `h08-world.ts`, this module treats those imports as `any`. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

export interface Viewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** The three approved viewports (`APP12-D01` §L), reused rather than invented. */
export const VIEWPORTS: readonly Viewport[] = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 900 },
  { name: '390', width: 390, height: 844 },
];

/** The two the Admin is drawn at. `APP12-D01` §L draws no mobile operator tool. */
export const ADMIN_VIEWPORTS: readonly Viewport[] = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 800 },
];

export async function loadProbe(): Promise<any> {
  return import('../../../support/app12/v01-ux-probe.mjs');
}

export async function loadEvidence(): Promise<any> {
  return import('../../../support/app12/v01-evidence.mjs');
}

/** A required non-secret environment value, named in the failure. */
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set — the V01 audit cannot address its own fixture`);
  }
  return value;
}

/** A comma-separated fixture list, as the orchestrator passes it. */
export function envList(name: string): string[] {
  return requiredEnv(name)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/**
 * Brings a page to rest before it is measured or photographed.
 *
 * The scroll is not decoration. Both applications lazy-load below-the-fold
 * media, and a `fullPage` screenshot taken without scrolling first captures the
 * placeholders rather than the images — which would make every grid in the
 * evidence look emptier and calmer than the product actually is, and this audit
 * is precisely about density. So the page is walked to the bottom, given a beat
 * to decode, and returned to the top before anything is recorded.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => true);
}

export interface AuditTarget {
  /** `storefront` or `admin` — the evidence directory, not the project. */
  readonly surface: string;
  /** The stable route key screenshots and findings both cite. */
  readonly route: string;
  readonly viewport: Viewport;
  /** The state variant, e.g. `default`, `awaiting-payment`, `validation-error`. */
  readonly state?: string | undefined;
  /** Also capture the fold, for screens whose hierarchy lives above it. */
  readonly aboveFold?: boolean | undefined;
}

export interface AuditLedger {
  readonly audit: (page: Page, target: AuditTarget) => Promise<any>;
  readonly screens: () => number;
  readonly screenshots: () => number;
  readonly routes: () => string[];
}

/**
 * Creates the recorder one project writes through.
 *
 * `name` is the measurement file's, and is per-project rather than per-surface
 * so two projects sharing an evidence directory cannot overwrite each other's
 * ledger.
 */
export async function createAuditLedger(name: string): Promise<AuditLedger> {
  const { measureUx } = await loadProbe();
  const { capture, createLedger } = await loadEvidence();
  const ledger = createLedger(name);
  const routes = new Set<string>();
  let shots = 0;

  return {
    audit: async (page, target) => {
      const state = target.state ?? 'default';
      await page.setViewportSize({ width: target.viewport.width, height: target.viewport.height });
      await settle(page);

      // The one assertion in the audit path: the screen rendered. A gateway
      // error page has a body, a height and colours, and would be measured and
      // photographed as though it were the product.
      await expect(
        page.locator('main, [role="main"], form'),
        `${target.route}@${target.viewport.name}: no main content rendered`,
      ).not.toHaveCount(0);

      const metrics = await measureUx(page);
      const screenshots = [
        await capture(page, {
          surface: target.surface,
          route: target.route,
          viewport: target.viewport.name,
          state,
        }),
      ];
      shots += 1;
      if (target.aboveFold === true) {
        screenshots.push(
          await capture(page, {
            surface: target.surface,
            route: target.route,
            viewport: target.viewport.name,
            state,
            fullPage: false,
          }),
        );
        shots += 1;
      }

      routes.add(target.route);
      ledger.add(`${target.route}/${target.viewport.name}/${state}`, {
        route: target.route,
        viewport: target.viewport.name,
        state,
        screenshots,
        ...metrics,
      });
      return metrics;
    },
    screens: () => ledger.size,
    screenshots: () => shots,
    routes: () => [...routes],
  };
}

/**
 * Navigates, and does not accept a gateway error page as the answer.
 *
 * ## The fault this exists for, named rather than retried away
 *
 * `APP12-H08` records it as `FU-APP12-H08-04`: the E2E gateway is Nginx in a
 * container reaching the host's Next processes through `host.docker.internal`
 * with `proxy_connect_timeout 10s`, and on Windows that first hop can stall past
 * ten seconds after the connection pool has gone idle. The request comes back
 * `504` — an Nginx error page with no `main`, no footer and no content.
 *
 * H08 solved it with a per-project warm-up, on the belief that only a project's
 * *first* connection is exposed. This audit disproved that: a run lost its Admin
 * catalog journey to a `504` on the eighth navigation of a project that had
 * already been warmed, after an idle gap while the previous route was measured.
 * A 504 page also measures and photographs perfectly, so the failure surfaced as
 * "the products list links to nothing" rather than as "the gateway stalled".
 *
 * So every audit navigation goes through here, the proxy statuses are treated as
 * *the environment answering*, and the stall is **recorded** rather than
 * swallowed — a gateway that is genuinely down still fails the run, and one that
 * stalls repeatedly shows up in the log as something to fix.
 */
export async function gotoSettled(page: Page, path: string): Promise<void> {
  const PROXY_STALLED = [502, 503, 504];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await page.goto(path, { waitUntil: 'load' });
    const status = response?.status() ?? 0;
    if (!PROXY_STALLED.includes(status)) {
      if (attempt > 0) {
        process.stdout.write(
          `[v01] gateway stalled on ${path} — settled after ${String(attempt + 1)} attempts\n`,
        );
      }
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `the gateway answered a proxy error four times for ${path} — this is the environment, not the page`,
  );
}

/**
 * Opens a route and audits it at every viewport in one call.
 *
 * The navigation is repeated per viewport rather than resized in place, because
 * both applications render responsively **on the server** for at least part of
 * the shell, and resizing a page that was laid out for 1440 is not the same
 * document a phone receives.
 */
export async function auditRouteAcross(
  page: Page,
  ledger: AuditLedger,
  options: {
    readonly surface: string;
    readonly route: string;
    readonly path: string;
    readonly viewports: readonly Viewport[];
    readonly state?: string | undefined;
    readonly aboveFold?: boolean | undefined;
  },
): Promise<void> {
  for (const viewport of options.viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await gotoSettled(page, options.path);
    await ledger.audit(page, {
      surface: options.surface,
      route: options.route,
      viewport,
      state: options.state,
      aboveFold: options.aboveFold,
    });
  }
}
