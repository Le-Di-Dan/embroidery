#!/usr/bin/env node
/**
 * `APP3-E01` §7 — the cross-layer journey runtime.
 *
 * The shared half: how a journey opens a browser against its own isolated
 * client identity, how it states a fact, and how it reports. The journeys
 * themselves are in `smoke-app3-e01-studio.mjs` and
 * `smoke-app3-e01-security.mjs`; the orchestrator that brings the topology up
 * and runs them is `smoke-app3-e01.mjs`.
 *
 * ## What a journey is allowed to assume
 *
 * Nothing. Every fact this run reports is read out of the running system at the
 * moment it is claimed — the DOM the customer sees, the response the API
 * returned, the flags the browser recorded on the cookie. A journey that
 * asserted against a fixture it had itself just written would prove only that
 * the fixture existed.
 *
 * ## Credentials
 *
 * A Session cookie is a credential. This file reads its *flags* and never its
 * value: `context.cookies()` returns both, and every helper here projects the
 * flags out before anything can reach a log, a report or a comparison. There is
 * one place a value is handled at all — sharing a Session between two clients
 * for the genuine `409` — and it is passed object-to-object inside the browser
 * process without being stringified. Nothing in this harness prints, stores or
 * compares a cookie value.
 */
import { createRequire } from 'node:module';

// The one pinned browser toolchain in the repository, reached through the
// package that already depends on it: this checkpoint installs nothing.
const requireFromE2E = createRequire(
  new URL('../packages/e2e-testing/package.json', import.meta.url),
);
const { chromium } = requireFromE2E('@playwright/test');

import { PRODUCT_SLUG } from './smoke-app3-s01-fixtures.mjs';
import { originFor } from './smoke-app3-e01-runners.mjs';

export { PRODUCT_SLUG };

/**
 * The Session cookie's name PREFIX. Its value is never read anywhere here.
 *
 * A prefix rather than a name because `APP3-B07` issues one cookie per Session
 * and puts the Session's own identifier in the name, so there is nothing to
 * match exactly. `__Host-` is the load-bearing part: a browser refuses a cookie
 * carrying it unless the cookie is `Secure`, host-only and path-`/`, so finding
 * one at all is already an assertion about how it was issued.
 */
export const SESSION_COOKIE_PREFIX = '__Host-nettheu_ds_';

export const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
export const TABLET_VIEWPORT = { width: 1024, height: 768 };
export const MOBILE_VIEWPORT = { width: 390, height: 844 };

/**
 * One recorded fact.
 *
 * `detail` is what a reader needs to disbelieve the verdict — the measured
 * value, not a restatement of the expectation.
 */
export function fact(name, ok, detail) {
  return { name, ok: Boolean(ok), detail: String(detail) };
}

export function equals(name, actual, expected) {
  return fact(
    name,
    Object.is(actual, expected),
    `${String(actual)} (expected ${String(expected)})`,
  );
}

export function atLeast(name, actual, minimum) {
  return fact(name, actual >= minimum, `${String(actual)} (expected >= ${String(minimum)})`);
}

export function matches(name, actual, pattern) {
  return fact(
    name,
    pattern.test(String(actual)),
    `${String(actual)} (expected ${String(pattern)})`,
  );
}

/** The Studio route for the fixture Product. The customer's own URL. */
export function studioUrl(origin, slug = PRODUCT_SLUG) {
  return `${origin}/san-pham/${slug}/thiet-ke`;
}

export function productUrl(origin, slug = PRODUCT_SLUG) {
  return `${origin}/san-pham/${slug}`;
}

/**
 * A browser for one role, bound to that role's origin.
 *
 * `ignoreHTTPSErrors` is deliberately absent: the run is plain HTTP on loopback,
 * which is potentially trustworthy by definition, so nothing has to be excused.
 */
export async function openRole(role, { viewport = DESKTOP_VIEWPORT, mobile = false } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 3 } : {}),
  });
  const page = await context.newPage();
  return { browser, context, page, origin: originFor(role) };
}

/**
 * The Session cookie's security flags, with the value projected away.
 *
 * `value` never leaves this function. A `__Host-` prefix is not decoration: the
 * browser refuses the cookie outright unless it is `Secure`, host-only and
 * path-`/`, so its presence is itself an assertion about how it was issued.
 */
export async function sessionCookieFlags(context) {
  const cookies = await context.cookies();
  const cookie = cookies.find((candidate) => candidate.name.startsWith(SESSION_COOKIE_PREFIX));
  if (cookie === undefined) return undefined;
  return {
    name: cookie.name,
    httpOnly: cookie.httpOnly === true,
    secure: cookie.secure === true,
    sameSite: cookie.sameSite,
    path: cookie.path,
    hostOnly: cookie.domain.startsWith('.') === false,
  };
}

/** Whether the page's own script can see the credential. It must not. */
export async function documentCanSeeSession(page) {
  return page.evaluate(
    (prefix) => document.cookie.split(';').some((entry) => entry.trim().startsWith(prefix)),
    SESSION_COOKIE_PREFIX,
  );
}

/** Count of nodes carrying a test id. Used for "exactly one", and for absence. */
export function countOf(page, testId) {
  return page.evaluate((id) => document.querySelectorAll(`[data-testid="${id}"]`).length, testId);
}

export function textOf(page, testId) {
  return page.evaluate(
    (id) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? '',
    testId,
  );
}

/**
 * Requests the page made, by route, while `action` ran.
 *
 * The autosave assertions need this: "a pinch writes nothing" is a claim about
 * the network, and the only honest way to make it is to watch the network.
 */
export async function recordRequests(page, action) {
  const seen = [];
  const listener = (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) seen.push(`${request.method()} ${url.pathname}`);
  };
  page.on('request', listener);
  try {
    await action();
  } finally {
    page.off('request', listener);
  }
  return seen;
}

/** Open the Studio route and start a Blank Session, the way a customer does. */
export async function startBlank(page, origin) {
  await page.goto(studioUrl(origin), { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Bắt đầu với thiết kế trống' }).click({ timeout: 20_000 });
  await page.waitForSelector('[data-testid="studio-stage-viewport-layer"]', { timeout: 30_000 });
}

/**
 * Reopen the Studio route on an existing Session.
 *
 * `APP3-B07` resume is a decision, not a redirect: a returning customer is asked
 * whether to continue, and the stage does not exist until they answer. A journey
 * that waited for the stage without answering would time out against correct
 * behaviour, so the prompt is answered the way the customer answers it.
 */
export async function continueSession(page) {
  // 30s, because the prompt only exists once the resume read has answered, and
  // a second client opening the same Session cold waits for the whole S01 chain
  // before it is offered anything at all.
  const prompt = await page
    .waitForSelector('[data-testid="studio-resume-continue"]', { timeout: 30_000 })
    .catch(() => undefined);
  if (prompt !== undefined) await prompt.click();
  await page.waitForSelector('[data-testid="studio-stage-viewport-layer"]', { timeout: 45_000 });
  return prompt !== undefined;
}

/**
 * Leave the Session the browser is holding and go back to the picker.
 *
 * A returning customer is offered two things, and `continueSession` only takes
 * one of them. This takes the other, which a journey needs whenever it wants a
 * SECOND Session on the same identity: the route resumes what the cookie
 * points at, so without this there is no way back to the Template picker.
 */
export async function restartSession(page, origin) {
  await page.goto(studioUrl(origin), { waitUntil: 'networkidle' });
  const restart = await page
    .waitForSelector('[data-testid="studio-resume-restart"]', { timeout: 15_000 })
    .catch(() => undefined);
  if (restart !== undefined) await restart.click();
  return restart !== undefined;
}

/**
 * Open the Studio route, count what the picker offers, and clone one Template.
 *
 * The count is returned rather than taken separately because the moment the
 * customer chooses is the moment the `APP3-B05` read has demonstrably arrived:
 * a count taken on an earlier visit is a race with the chain `APP3-S01`
 * deliberately made sequential, and a race that reports `0` says nothing about
 * the read it was meant to prove.
 */
export async function startClone(page, origin, templateName) {
  await page.goto(studioUrl(origin), { waitUntil: 'networkidle' });
  // A substring match, because the picker's accessible name carries the
  // Template's name AND the version label beside it: matching the whole string
  // would couple this run to copy it is not testing.
  const chosen = page.getByRole('button', { name: new RegExp(templateName) }).first();
  await chosen.waitFor({ timeout: 45_000 });
  const offered = await page.getByRole('button', { name: /Phiên bản/ }).count();
  await chosen.click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Dùng mẫu đã chọn' }).click();
  await page.waitForSelector('[data-testid="studio-stage-viewport-layer"]', { timeout: 30_000 });
  return offered;
}

/**
 * Wait for the `APP3-S10` save chip to settle on a saved state.
 *
 * Polls the chip rather than the network, because the chip is the promise the
 * customer is given and the network is only how it is kept.
 */
export async function waitForSaved(page, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = await textOf(page, 'studio-save-chip');
    if (/Đã lưu/i.test(last)) return last;
    await page.waitForTimeout(250);
  }
  return last;
}

/**
 * The in-page touch driver the 390 journey needs.
 *
 * Playwright's `touchscreen` can tap but cannot hold two contacts, and the two
 * gestures worth asserting at 390 are exactly the two-finger ones. So the
 * contacts are dispatched as the Pointer Events the product listens for, one
 * move per animation frame, which is also how `APP3-S11`'s benchmark drives
 * them — the arbitration under test is `pointerdown` counting, and a synthetic
 * contact reaches it through the same path a digitizer's does.
 *
 * Emulation, and named as emulation in the report: no physical device is used.
 */
export const TOUCH_PROBE = `
window.__e01 = (() => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const at = (id) => document.querySelector('[data-testid="' + id + '"]');
  const layer = () => at('studio-stage-viewport-layer');
  const send = (node, type, pointerId, x, y, kind) =>
    node.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      pointerId, pointerType: kind || 'touch', isPrimary: pointerId === 1,
      clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    }));
  return {
    // A layer row, clicked without focusing the tab.
    pick: (elementId) => {
      const row = at('studio-layer-select-' + elementId);
      if (!row) return false;
      row.click();
      return true;
    },
    move: async (elementId, dx, dy, frames, kind) => {
      const element = at('studio-element-' + elementId);
      // The contact goes to the overlay's MOVE surface, not to the element: once
      // an element is selected the overlay covers it, and the element's own
      // handler selects rather than moves. The coordinates are still the
      // element's, because that is where the finger is.
      const node = at('studio-transform-move') || element;
      if (!element || !node) return null;
      const rect = element.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      send(node, 'pointerdown', 1, x, y, kind);
      for (let step = 1; step <= frames; step += 1) {
        await frame();
        send(node, 'pointermove', 1, x + (dx * step) / frames, y + (dy * step) / frames, kind);
      }
      send(node, 'pointerup', 1, x + dx, y + dy, kind);
      await frame();
      return element.getAttribute('transform');
    },
    pinch: async (frames) => {
      const node = layer();
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      send(node, 'pointerdown', 1, cx - 40, cy);
      send(node, 'pointerdown', 2, cx + 40, cy);
      for (let step = 1; step <= frames; step += 1) {
        await frame();
        const spread = 40 + step * 3;
        send(node, 'pointermove', 1, cx - spread, cy);
        send(node, 'pointermove', 2, cx + spread, cy);
      }
      send(node, 'pointerup', 1, cx - 220, cy);
      send(node, 'pointerup', 2, cx + 220, cy);
      await frame();
      return true;
    },
  };
})();
`;

/**
 * Drag the selected element by the overlay's MOVE surface.
 *
 * Not by the element itself: `APP3-S03` draws the transform overlay on top of
 * the selection, so a drag started at the element's centre lands on whichever
 * affordance covers that point. Measured while writing this run — a centre drag
 * produced `scaleX 1.2251, scaleY 1.7619`, which is a resize wearing a move's
 * name. Naming the move surface is the difference between asserting what
 * happened and asserting what was intended.
 */
export async function dragMove(page, elementId, dx, dy) {
  const surface = await page.locator('[data-testid="studio-transform-move"]').count();
  if (surface !== 1) throw new Error('no move surface: nothing is selected');
  // The move surface is the whole overlay clipped to the oriented box, so its
  // own bounding box is the stage and its centre is not on the element. The
  // element's centre is inside the clip, which is where a customer grabs it.
  const box = await page.locator(`[data-testid="studio-element-${elementId}"]`).boundingBox();
  if (box === null) throw new Error(`element ${elementId} is not on the stage`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

/**
 * Zoom in, the way the customer does, before grabbing a small element.
 *
 * The fixture Templates place an 80×20 text element, and `APP3-S03` draws its
 * resize handles at the corners of exactly that box — on a 20 px-tall element
 * the corner handles very nearly meet in the middle, so a drag from the centre
 * lands on a handle and resizes. Measured while writing this run: a centre drag
 * at 100% produced `scaleX 1.2251, scaleY 1.7619`. Zooming first is not a
 * workaround for a defect; it is what a person does before grabbing something
 * small, and it makes the move surface the top-most thing under the cursor.
 */
export async function zoomIn(page, steps = 3) {
  for (let step = 0; step < steps; step += 1) {
    const zoom = page.locator('[data-testid="studio-zoom-in"]:not([disabled])');
    if ((await zoom.count()) === 0) break;
    await zoom.click();
    await page.waitForTimeout(120);
  }
  return textOf(page, 'studio-zoom-value');
}

/**
 * Wait for a WHOLE save cycle: dirty, then saved again.
 *
 * `waitForSaved` alone is a trap after the first save, because the chip still
 * reads "Đã lưu" from the previous one and the wait returns instantly — which is
 * how the conflict journey first "proved" that a stale write was accepted: the
 * two clients had simply not written in the order the test assumed.
 */
export async function waitForSaveCycle(page, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!/Đã lưu/i.test(await textOf(page, 'studio-save-chip'))) break;
    await page.waitForTimeout(150);
  }
  return waitForSaved(page, Math.max(2000, deadline - Date.now()));
}

/**
 * The Session id this page is working on, taken from its own traffic.
 *
 * Not from the cookie — that is `HttpOnly` and must stay unreadable — and not
 * from any store the harness reaches into. The id appears in the path of every
 * Session request the page makes, which is the same place a proxy log would
 * find it.
 */
export async function sessionIdOf(page) {
  return page.evaluate(
    () =>
      performance
        .getEntriesByType('resource')
        .map((entry) => /design-sessions\/([0-9a-f-]{36})/.exec(entry.name)?.[1])
        .findLast((id) => id !== undefined) ?? '',
  );
}

/**
 * Advance the Session on the server, as a real second client.
 *
 * This is how a genuine stale write is produced. It is NOT an injected
 * revision: it is a second HTTP client, holding the same Session credential the
 * browser holds, reading the current document and writing it back — exactly what
 * a second device would do. The server advances its revision because a real
 * write happened, and the customer's next edit is then stale for the ordinary
 * reason. Two tabs cannot be used for this: `APP3-S10` reconciles before every
 * attempt, so a tab is never stale by the time it writes (measured twice).
 *
 * Returns the status the second client got, so a failure to arrange the
 * precondition is reported rather than mistaken for a passing conflict test.
 */
export async function advanceSessionElsewhere(page, sessionId) {
  return page.evaluate(async (id) => {
    const base = `/api/public/design-sessions/${id}/document`;
    const headers = {
      'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
    };
    /*
     * The document is read through `resume`, not through a `GET` on the write
     * route. Measured: that route is write-only and answers `404` to a `GET`,
     * which is correct — `APP3-B07` publishes the current document and revision
     * through resume, and resume is what a real second device would call.
     */
    let read = await fetch(base, { credentials: 'include' });
    if (!read.ok) {
      read = await fetch(`/api/public/design-sessions/${id}/resume`, {
        method: 'POST',
        credentials: 'include',
        headers,
      });
    }
    if (!read.ok) return { stage: 'read', status: read.status };
    const body = await read.json();
    const payload = body?.data ?? body;
    const write = await fetch(base, {
      method: 'PUT',
      credentials: 'include',
      headers,
      // `expectedRevision`, the field the published `AutosaveDesignSessionBody`
      // actually names. `revision` is what the SNAPSHOT calls it, and sending
      // that instead is a `400` rather than the `409` this is arranging.
      body: JSON.stringify({
        expectedRevision: payload.revision,
        document: payload.document,
      }),
    });
    return { stage: 'write', status: write.status };
  }, sessionId);
}

/** Print one journey's facts and return whether every one of them held. */
export function report(title, facts) {
  console.log(`\n${title}`);
  for (const item of facts) {
    console.log(`  ${item.ok ? 'ok  ' : 'FAIL'} ${item.name} — ${item.detail}`);
  }
  const failed = facts.filter((item) => !item.ok);
  console.log(`  ${String(facts.length - failed.length)}/${String(facts.length)} held`);
  return failed.length === 0;
}
