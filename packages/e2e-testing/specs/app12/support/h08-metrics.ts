/**
 * The measured half of the `APP12-H08` audit vocabulary.
 *
 * `h08-world.ts` beside this file asks what the **document says** — landmarks,
 * headings, the automated rule scan. This one asks what the **browser painted**:
 * the contrast of every rendered pair, whether the page scrolls sideways, how
 * big each target actually is, and where the keyboard goes.
 *
 * The split is by that question rather than by line count. A change to the axe
 * gate has nothing to say about a target rectangle, and neither file has to be
 * read to work on the other.
 *
 * Nothing here can carry a secret. Contrast returns colours and ratios, reflow
 * returns integers, target size returns rectangles, and the focus helpers read
 * accessible names — approved product copy — but never an input's `value`.
 *
 * Test-only.
 */
import { expect, type Page } from '@playwright/test';

import { PO_APP12_004_TOKENS, loadAxe, loadMeasure, record } from './h08-world';

/* The harness helper layer is plain ESM `.mjs`, so everything imported from it
   arrives untyped; each explicit `expect` is the contract. Same treatment as
   `s03-world.ts`, and for the same reason. */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

const measure = loadMeasure;
const axe = loadAxe;

/**
 * Fails when the document scrolls sideways.
 *
 * SC 1.4.10 Reflow. The message names the widest offending box, because
 * "something overflows by 43px" is not actionable and "the summary aside
 * reaches 1103 in a 1024 viewport" is.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const { measureOverflow } = await measure();
  const overflow = await measureOverflow(page);
  record(`reflow.${label}.overflowPx`, overflow.overflowPx);
  expect(
    overflow.overflows,
    `${label} scrolls horizontally by ${String(overflow.overflowPx)}px` +
      (overflow.widest === undefined
        ? ''
        : ` — widest box ${String(overflow.widest.selector)} reaches ${String(overflow.widest.right)}`),
  ).toBe(false);
}

/**
 * Every rendered contrast pair, measured, with the failures named.
 *
 * `APP12-H08` §8 asks for a mechanical measurement rather than a visual
 * opinion, so this returns axe's own computed ratios — foreground, background,
 * ratio and the threshold the font size and weight chose — and the caller
 * decides. Colours and numbers only; nothing here can carry content.
 */
export async function measureContrastOn(page: Page, label: string): Promise<any> {
  const { measureContrast } = await measure();
  // `measureContrast` reads `window.axe`, so the scanner has to be in the page
  // whether or not an ordinary scan ran first.
  const { ensureAxe } = await axe();
  await ensureAxe(page);
  const result = await measureContrast(page);
  record(`contrast.${label}.pairs_passed`, result.passes);
  record(`contrast.${label}.failures`, result.failures.length);
  if (result.failures.length > 0) {
    record(
      `contrast.${label}.detail`,
      result.failures
        .map(
          (failure: any) =>
            `${String(failure.target)} ${String(failure.fg)}/${String(failure.bg)} ${String(failure.ratio)}<${String(failure.required)}`,
        )
        .join(' ; '),
    );
  }
  return result;
}

let lockedTokens: Map<string, string> | undefined;

/** The locked palette, read once from the file that declares it. */
async function tokens(): Promise<Map<string, string>> {
  if (lockedTokens === undefined) {
    const { lockedColorTokens } = await measure();
    const { join } = await import('node:path');
    lockedTokens = lockedColorTokens(
      join(requiredRepoRoot(), 'packages', 'styles', 'src', 'settings', '_color.scss'),
    ) as Map<string, string>;
  }
  return lockedTokens;
}

function requiredRepoRoot(): string {
  const value = process.env['E2E_REPO_ROOT'];
  if (value === undefined || value === '') {
    throw new Error('E2E_REPO_ROOT is required for the APP12-H08 contrast measurement.');
  }
  return value;
}

/**
 * Measures contrast and asserts that every failure belongs to the **token
 * layer**.
 *
 * The assertion is the load-bearing part, and it is deliberately not "contrast
 * passes" — it does not, and `PO-APP12-004`/`APP12-V02` is why. What it asserts
 * is the claim H08 can honestly make and be held to: *every failing pairing is
 * two locked design tokens meeting each other, so the repair belongs where the
 * Product Owner already put it, and this checkpoint introduced no colour of its
 * own.*
 *
 * A component that hard-coded a hex value, or reached for a colour outside
 * `_color.scss`, fails here by name — which is exactly the "small contrast
 * defect" §13 makes H08 responsible for, as opposed to the foundation
 * correction it makes `V02` responsible for. The distinction is mechanical
 * rather than a matter of judgement, which is the point.
 */
export async function expectContrastIsTokenOwned(page: Page, label: string): Promise<any> {
  const palette = await tokens();
  const result = await measureContrastOn(page, label);
  const local = result.failures.filter((failure: any) => {
    const fg = String(failure.fg).toLowerCase();
    const bg = String(failure.bg).toLowerCase();
    return !palette.has(fg) || !palette.has(bg);
  });
  const tokenPairs = new Set<string>(
    result.failures.map(
      (failure: any) =>
        `$${String(palette.get(String(failure.fg).toLowerCase()) ?? failure.fg)} on $${String(palette.get(String(failure.bg).toLowerCase()) ?? failure.bg)}`,
    ),
  );
  record(`contrast.${label}.token_pairs`, [...tokenPairs].join(' ; '));
  record(`contrast.${label}.non_token`, local.length);
  // Which of the failing pairs the PO ruling already names, and which H08 is
  // reporting as new. Both are V02's to repair; only the second is news.
  const beyondPo004 = [...tokenPairs].filter(
    (pair) =>
      !PO_APP12_004_TOKENS.some((token) => {
        const name = palette.get(token);
        return name !== undefined && pair.includes(`$${name}`);
      }),
  );
  record(`contrast.${label}.beyond_po_004`, beyondPo004.join(' ; ') || 'none');

  expect(
    local.map(
      (failure: any) =>
        `${String(failure.target)} ${String(failure.fg)} on ${String(failure.bg)} = ${String(failure.ratio)}`,
    ),
    `${label}: contrast failures from a colour that is not a locked design token — these are H08's, not V02's`,
  ).toStrictEqual([]);
  return { ...result, tokenPairs: [...tokenPairs], beyondPo004 };
}

/**
 * The rendered box of every visible, enabled control, with the undersized ones
 * separated out.
 *
 * SC 2.5.8 Target Size (Minimum) is AA and has real exceptions, so this reports
 * and the spec judges. The inline exception is applied here because it is
 * mechanical — a control inside a sentence is sized by the sentence — and the
 * rest are left to the spec, which knows what each control is for.
 */
export async function measureTargetsOn(page: Page, label: string): Promise<any> {
  const { measureTargets, MIN_TARGET_PX } = await measure();
  const measured = await measureTargets(page);
  // Both of SC 2.5.8's mechanical exceptions applied: inline targets, and
  // undersized targets whose 24px circles clear every neighbour. What is left is
  // a genuine failure of the criterion rather than a small number.
  const undersized = measured.filter(
    (target: any) => target.undersized && !target.inline && !target.spacingExempt,
  );
  record(`targets.${label}.measured`, measured.length);
  record(`targets.${label}.undersized`, undersized.length);
  if (undersized.length > 0) {
    record(
      `targets.${label}.detail`,
      undersized
        .map(
          (target: any) =>
            `${String(target.selector)} ${String(target.width)}x${String(target.height)}`,
        )
        .join(' ; '),
    );
  }
  return { measured, undersized, minPx: MIN_TARGET_PX };
}

/** Where focus is now — tag, role, accessible name, and whether it is drawn. */
export async function activeElement(page: Page): Promise<any> {
  const { describeActive } = await measure();
  return describeActive(page);
}

/** Presses Tab `steps` times and returns where focus landed each time. */
export async function tabThrough(page: Page, steps: number): Promise<any[]> {
  const { walkTabOrder } = await measure();
  return walkTabOrder(page, steps);
}

/**
 * Fails when the currently focused control is not visibly drawn as focused.
 *
 * SC 2.4.7. Measured as a before/after difference (see `measureFocusIndicator`),
 * because at least one delivered control draws its ring on a **sibling** and an
 * attribute read on the control itself would report a defect that is not there.
 */
export async function expectFocusIsDrawn(page: Page, what: string): Promise<void> {
  const { measureFocusIndicator } = await measure();
  const indicator = await measureFocusIndicator(page);
  record(`focus.${what}.drawn`, indicator.drawn === true);
  expect(indicator.focused, `${what}: something has focus`).toBe(true);
  expect(indicator.drawn, `${what}: focus is visibly drawn on it or on what wraps it`).toBe(true);
}

/**
 * Tabs forward until `predicate` accepts the focused element, and fails if it
 * never does.
 *
 * This is how every keyboard journey in this run reaches a control: never by
 * clicking it, and never by calling `.focus()`, because both would prove the
 * control exists rather than that a keyboard can get to it.
 *
 * Focus visibility is asserted with `expectFocusIsDrawn` at the stops that
 * matter rather than at every stop on the way. The measurement blurs and
 * refocuses to compute a difference, which is accurate but not free, and running
 * it on all sixty presses of a checkout walk would spend minutes proving the
 * same shell links over and over.
 */
export async function tabUntil(
  page: Page,
  what: string,
  predicate: (active: any) => boolean,
  limit = 60,
): Promise<any> {
  const seen: string[] = [];
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press('Tab');
    const active = await activeElement(page);
    seen.push(`${String(active.tag)}:${String(active.name)}`);
    if (predicate(active)) return active;
  }
  throw new Error(
    `${what} was not reachable by Tab within ${String(limit)} presses — path: ${seen.slice(0, 12).join(' → ')}`,
  );
}

/**
 * Fails when a container traps the keyboard.
 *
 * SC 2.1.2. A trap is *not* a modal cycling its own controls — that is correct
 * and required — so this is used on the page, where focus must be able to leave
 * every control it enters. It presses Tab a bounded number of times and fails if
 * focus never moves at all, which is what a real trap looks like.
 */
export function expectNoStuckFocus(walk: any[], where: string): void {
  const distinct = new Set(
    walk.map((active) => `${String(active.tag)}#${String(active.id)}|${String(active.name)}`),
  );
  expect(
    distinct.size,
    `focus never moved while tabbing through ${where} — ${walk.length} presses, ${distinct.size} distinct targets`,
  ).toBeGreaterThan(1);
}
