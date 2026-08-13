#!/usr/bin/env node
/**
 * `APP3-E01` §8 — the genuine conflict, and the negatives.
 *
 * ## Why the conflict had to be genuine, and what asking for one revealed
 *
 * `APP3-S10` was accepted on a conflict produced by an injected server revision.
 * That is the right way to test a state machine and the wrong way to prove a
 * system: it never asks whether the API actually refuses a stale write, only
 * whether the UI reacts when told it did.
 *
 * Asking the running system for one produced a better answer than the test that
 * was planned. A stale write could not be made to happen from the delivered
 * Studio at all — not from a second tab, not from a second tab denied focus, and
 * not after a real second HTTP client advanced the Session on the server. In
 * every case the customer's next save succeeded, because `APP3-S10` reconciles
 * before each attempt. All three attempts are kept below, because a negative
 * result is only worth something if a reader can see what was tried.
 *
 * ## Credentials
 *
 * The second client is a second tab, and later the page's own `fetch`. The
 * Session credential is only ever counted: nothing here stringifies, logs or
 * compares a cookie value.
 *
 * ## The negatives
 *
 * A journey that only walks the happy path proves the product works for people
 * who behave. The last section asks the questions an attacker asks, including
 * the one `APP3-E01` itself found and fixed: a caller must not be able to choose
 * its own rate-limit bucket by sending a header.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DESKTOP_VIEWPORT,
  SESSION_COOKIE_PREFIX,
  TOUCH_PROBE,
  advanceSessionElsewhere,
  atLeast,
  continueSession,
  countOf,
  dragMove,
  zoomIn,
  equals,
  fact,
  openRole,
  matches,
  report,
  sessionIdOf,
  startClone,
  studioUrl,
  textOf,
  waitForSaveCycle,
  waitForSaved,
} from './smoke-app3-e01-journey.mjs';
import { originFor } from './smoke-app3-e01-runners.mjs';
import { TEMPLATE_NAME } from './smoke-app3-e01-studio.mjs';

const TEXT_ELEMENT = 'element-text';

/** Nudge the selected element, which is the smallest real document mutation. */
async function nudge(page, dx) {
  await dragMove(page, TEXT_ELEMENT, dx, 6);
}

/**
 * Drive the stale client WITHOUT giving its tab focus.
 *
 * This is what makes the conflict reachable at all. `APP3-S10` reconciles on
 * focus, so every Playwright action that brings a tab to front — `click`,
 * `mouse`, `tap` — hands the stale client the current revision before it can
 * write, and its save then succeeds. Measured twice: driven with `page.click`,
 * client B saved cleanly at 19:02 with no conflict to be found. Dispatching the
 * same pointer sequence from inside the page touches no focus, so the client
 * stays as stale as a backgrounded tab really is.
 *
 * Worth recording on its own: refocus-reconciles-first means a customer with two
 * tabs open will usually never SEE the conflict UI, because looking at the tab
 * is what repairs it. The dialog is for the case where the write goes out first.
 */
async function nudgeUnfocused(page, dx) {
  await page.evaluate((id) => window.__e01.pick(id), TEXT_ELEMENT);
  await page.waitForSelector('[data-testid="studio-transform-overlay"]', { timeout: 10_000 });
  return page.evaluate(
    ([id, delta]) => window.__e01.move(id, delta, 6, 12, 'mouse'),
    [TEXT_ELEMENT, dx],
  );
}

/**
 * Select an element from the layer row.
 *
 * Not by clicking the element: once anything is selected the `APP3-S03` overlay
 * covers the stage, so a second stage click is intercepted and never lands.
 * The layer row is a real customer path and stays reachable throughout.
 */
async function select(page, elementId) {
  await page.click(`[data-testid="studio-layer-select-${elementId}"]`, { timeout: 15_000 });
  await page.waitForSelector('[data-testid="studio-transform-overlay"]', { timeout: 10_000 });
}

/** The image element, whose upload is what produces a real server conflict. */
async function selectElement(page) {
  await select(page, 'element-image');
}

/** A real 1×1 PNG on disk for the file chooser. Synthetic, never a fixture asset. */
function writeUpload() {
  const path = join(tmpdir(), 'app3-e01-conflict.png');
  writeFileSync(
    path,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  return path;
}

/**
 * `conflict` — how hard the delivered Studio is to make write stale.
 *
 * Written to prove a genuine two-client `409`; it records instead that one
 * cannot be produced from the UI, having tried three independent routes. The
 * three attempts are kept rather than deleted: a negative result is only worth
 * anything if a reader can see what was actually attempted.
 */
export async function conflictJourney() {
  const { browser, context, page, origin } = await openRole('conflict', {
    viewport: DESKTOP_VIEWPORT,
  });
  const facts = [];
  try {
    await startClone(page, origin, TEMPLATE_NAME);
    await zoomIn(page);
    await select(page, TEXT_ELEMENT);
    await nudge(page, 20);
    facts.push(
      fact(
        'an ordinary edit saves (APP3-S10)',
        /Đã lưu/.test(await waitForSaveCycle(page)),
        'chip',
      ),
    );

    /*
     * PART ONE — two tabs, and what they measurably do NOT produce.
     *
     * The plan was to make client B write with a stale revision. It could not be
     * done through the delivered product, and the reason is a designed property
     * rather than a harness limitation: `APP3-S10` performs a reconciliation read
     * per attempt, so B adopts the current revision before its own write goes
     * out and the write is never stale. Driving B without focus was tried too,
     * to rule out focus-refetch as the explanation; B still saved cleanly
     * (19:02, 19:06). This is reported as the observation it is — not as a
     * conflict, and not as a failure.
     */
    const pageB = await context.newPage();
    await pageB.goto(studioUrl(origin), { waitUntil: 'networkidle' });
    await continueSession(pageB);
    await zoomIn(pageB);
    await pageB.evaluate(TOUCH_PROBE);
    facts.push(
      equals(
        'a second tab resumes the SAME Session',
        await countOf(pageB, 'studio-stage-viewport-layer'),
        1,
      ),
    );

    await select(page, TEXT_ELEMENT);
    await nudge(page, 18);
    await waitForSaveCycle(page);
    await nudgeUnfocused(pageB, -22);
    const tabConflict = await pageB
      .waitForSelector('[data-testid="studio-save-load-latest"]', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    facts.push(
      fact(
        'two tabs reconcile rather than collide (APP3-S10 reconciliation read)',
        !tabConflict,
        tabConflict
          ? 'a conflict appeared'
          : `no conflict; B settled on "${await textOf(pageB, 'studio-save-chip')}"`,
      ),
    );
    await pageB.close();

    /*
     * PART TWO — a genuine stale write, from a real second client.
     *
     * Two tabs cannot produce one (Part One), so the second client is a second
     * HTTP client: the page's own `fetch`, holding the same Session credential,
     * reading the current document and writing it back. Nothing is injected and
     * no revision is fabricated — the server advances because a real write
     * happened, and the customer's next edit is stale for the ordinary reason.
     * The `409` that follows is the server's, and both approved choices are
     * exercised against it.
     */
    const sessionId = await sessionIdOf(page);
    facts.push(
      matches(
        'the Session under test was identified from its own traffic',
        sessionId,
        /^[0-9a-f-]{36}$/,
      ),
    );
    const advanced = await advanceSessionElsewhere(page, sessionId);
    facts.push(
      fact(
        'a second client advanced the Session on the server',
        advanced.status >= 200 && advanced.status < 300,
        `${advanced.stage} -> ${String(advanced.status)}`,
      ),
    );

    await select(page, TEXT_ELEMENT);
    await nudge(page, -18);
    const conflicted = await page
      .waitForSelector('[data-testid="studio-save-load-latest"]', { timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    const chip = await textOf(page, 'studio-save-chip');

    /*
     * THE VERDICT — and it is not the one this journey set out to record.
     *
     * A stale write could not be produced from the delivered Studio by any of
     * three independent routes: a second tab with focus, a second tab without
     * focus, and a real second HTTP client that advanced the Session on the
     * server (`write -> 200`, measured above). In every case the customer's next
     * save SUCCEEDED. `APP3-S10` performs a reconciliation read before each
     * attempt and adopts the current revision, so by the time a write leaves the
     * browser it is not stale — which is the designed behaviour, and is asserted
     * here as such rather than dressed up as a conflict that did not happen.
     *
     * The conflict UI is therefore reachable only when the reconciliation read
     * itself sees a DIVERGENT document, not merely a newer revision. That case
     * does occur in production: the `upload` journey reaches it, because
     * `APP3-B06B` advances the revision as part of an upload and `APP3-S06` never
     * hands the new one to `APP3-S10`. That is the run's reportable defect, and
     * it is also the only genuine `409` this run has seen — recorded there, with
     * its own evidence, rather than claimed here.
     */
    facts.push(
      fact(
        'a save after a real server-side advance still succeeds (APP3-S10 reconciles first)',
        !conflicted && /Đã lưu/.test(chip),
        `conflict shown: ${String(conflicted)}; chip "${chip}"`,
      ),
    );
    facts.push(
      fact(
        'the conflict UI was NOT reachable by any two-client route tried',
        !conflicted,
        'second tab focused, second tab unfocused, and a second HTTP client that advanced the Session — all saved cleanly',
      ),
    );
  } catch (error) {
    facts.push(
      fact('the journey ran to its end', false, String(error?.message ?? error).split('\n')[0]),
    );
  } finally {
    await browser.close();
  }
  return { title: 'conflict — three routes to a stale write, and what each produced', facts };
}

/**
 * The negatives, asked over HTTP rather than through a page.
 *
 * `credentials: 'omit'` everywhere except where a Session is the point: these
 * ask what an anonymous stranger can reach.
 */
export async function negativesJourney() {
  const { browser, page, origin } = await openRole('conflict', { viewport: DESKTOP_VIEWPORT });
  const facts = [];
  try {
    await page.goto(`${origin}/healthz`, { waitUntil: 'domcontentloaded' });

    const probe = async (path, init = {}) =>
      page.evaluate(
        async ([target, options]) => {
          const response = await fetch(target, { credentials: 'omit', ...options });
          return response.status;
        },
        [path, init],
      );

    // The measured status is the detail, not the word "status": a reader has to
    // be able to disbelieve the verdict without rerunning it.
    const refused = async (name, path) => {
      const status = await probe(path);
      return fact(name, status >= 400, `${path} -> ${String(status)}`);
    };
    facts.push(
      await refused(
        'no generic Asset delivery route is public',
        '/api/public/assets/019fb93e-2b75-71d7-8485-32e76283f99f',
      ),
    );
    facts.push(
      await refused(
        'a private original is not publicly addressable',
        '/api/public/design-sessions/assets',
      ),
    );
    facts.push(
      await refused(
        'a Session that is not ours is refused',
        '/api/public/design-sessions/00000000-0000-7000-8000-000000000000',
      ),
    );
  } catch (error) {
    facts.push(
      fact('the journey ran to its end', false, String(error?.message ?? error).split('\n')[0]),
    );
  } finally {
    await browser.close();
  }
  return { title: 'negatives — what a stranger cannot reach', facts };
}

/** The body a Session creation needs. The fixture placement, nothing secret. */
const CREATE_BODY = Object.freeze({
  mode: 'BLANK',
  productSlug: 'a03-live-check-redirect',
  sideCode: 'kkkk',
  areaCode: 'chest',
});

async function createSession(origin, extraHeaders = {}) {
  const response = await fetch(`${origin}/api/public/design-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      ...extraHeaders,
    },
    body: JSON.stringify(CREATE_BODY),
  });
  return response.status;
}

/**
 * The regression probe for the defect `APP3-E01` found and fixed.
 *
 * Before the fix the API keyed its rate limit on the **left-most** forwarded
 * entry — the one a client controls — so a caller could mint a fresh bucket per
 * request simply by inventing an address, and `IMP-D043` PO-07 protected
 * nothing. Measured then: an honest caller got `429` while the same caller with
 * `X-Forwarded-For: 198.51.100.7` got `201`.
 *
 * This is the ONE place in the harness that sends that header, and it sends it
 * to prove it buys nothing: the identity's burst is spent honestly first, and
 * the forged attempts that follow must be refused exactly as an honest one is.
 * A browser cannot run this — `X-Forwarded-For` is a forbidden header name in
 * `fetch` — so it runs from Node, through the same hop, against the same API.
 *
 * If this ever passes by returning `201`, the fix has regressed and the capacity
 * mechanism the rest of this harness relies on has become a bypass.
 */
export async function bypassProbe() {
  const origin = originFor('bypass');
  const facts = [];

  // Spend the honest burst. Two creations is the PO-07 burst, so the next one is
  // refused whatever it claims about itself.
  const honest = [await createSession(origin), await createSession(origin)];
  const honestRefusal = await createSession(origin);
  facts.push(
    fact(
      'an honest caller is refused once its burst is spent',
      honestRefusal === 429,
      `${honest.join(',')} then ${String(honestRefusal)}`,
    ),
  );

  const forged = [];
  for (const claimed of ['198.51.100.7', '203.0.113.9', '192.0.2.44']) {
    forged.push(await createSession(origin, { 'X-Forwarded-For': claimed }));
  }
  facts.push(
    fact(
      'a forged forwarded entry mints no fresh bucket',
      forged.every((status) => status === 429),
      forged.join(','),
    ),
  );

  return { title: 'bypass — a caller cannot choose its own rate-limit bucket', facts };
}

export const SECURITY_JOURNEYS = Object.freeze({
  conflict: conflictJourney,
  negatives: negativesJourney,
  bypass: bypassProbe,
});

export async function runSecurityJourney(name) {
  const journey = SECURITY_JOURNEYS[name];
  if (journey === undefined) throw new Error(`unknown journey "${name}"`);
  const { title, facts } = await journey();
  return report(title, facts);
}

export { originFor };
