#!/usr/bin/env node
/**
 * `APP3-E01` §7 — the customer's own chain, on the delivered Studio.
 *
 * Three journeys, one isolated client identity each, one Session each unless the
 * journey is *about* opening two:
 *
 * - `desktop` — discover, clone, edit, save, reload, resume, at 1440 and 1024;
 * - `upload`  — a real customer image through intake, worker and private
 *               delivery, and the refusal path beside it;
 * - `mobile`  — the 390 surface, its gestures and what they must NOT write.
 *
 * Every one of them drives the product the way a customer does — by the label on
 * the screen — and reads its verdict out of the running system.
 *
 * Run through the orchestrator (`smoke-app3-e01.mjs`), which owns the topology,
 * the fixtures and the isolated identities these journeys assume.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  TOUCH_PROBE,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  SESSION_COOKIE_PREFIX,
  TABLET_VIEWPORT,
  atLeast,
  continueSession,
  countOf,
  documentCanSeeSession,
  dragMove,
  zoomIn,
  equals,
  fact,
  matches,
  openRole,
  productUrl,
  recordRequests,
  report,
  sessionCookieFlags,
  restartSession,
  startBlank,
  startClone,
  studioUrl,
  textOf,
  waitForSaved,
} from './smoke-app3-e01-journey.mjs';

/**
 * The Template the journeys clone.
 *
 * Chosen for two reasons and not for its name: it carries an image element AND a
 * text element, so one Session exercises both capabilities, and it sits on the
 * picker's FIRST page, so the journeys never depend on pagination they are not
 * testing. `Chữ thêu tay` is deliberately not used — it is the fixture's one
 * text-only Template and has no image to replace.
 */
export const TEMPLATE_NAME = 'Vườn hồng tháng Tư';
const TEXT_ELEMENT = 'element-text';
const IMAGE_ELEMENT = 'element-image';

/** `STUDIO_IMAGE_COPY.placed` — the one sentence that means the server is done. */
const STUDIO_IMAGE_PLACED = 'Đã thêm ảnh vào bản thiết kế.';

/** A real 1×1 PNG, written to disk for the file chooser. Synthetic, not a fixture asset. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function writeUpload(name, bytes) {
  const path = join(tmpdir(), name);
  writeFileSync(path, bytes);
  return path;
}

/**
 * Select an element, on the stage or from the layer list.
 *
 * Both are real customer paths, and the list is the reliable one for an image:
 * the fixture's image element is 80×30 and renders the `APP3-S02` placeholder
 * until an upload replaces it, so a stage click on it fails Playwright's
 * actionability check while the same selection from the layer row succeeds.
 */
async function selectElement(page, elementId) {
  const row = page.locator(`[data-testid="studio-layer-select-${elementId}"]`);
  if ((await row.count()) === 1) await row.click({ timeout: 15_000 });
  else await page.click(`[data-testid="studio-element-${elementId}"]`, { timeout: 15_000 });
  await page.waitForSelector('[data-testid="studio-transform-overlay"]', { timeout: 10_000 });
}

/** How many history items the engine holds right now. */
function historyCount(page) {
  return page.evaluate(
    () => document.querySelectorAll('[data-testid="studio-history-list"] li').length,
  );
}

/** The persisted transform of one element, read out of the rendered SVG. */
function transformOf(page, elementId) {
  return page.evaluate(
    (id) =>
      document.querySelector(`[data-testid="studio-element-${id}"]`)?.getAttribute('transform') ??
      '',
    elementId,
  );
}

/**
 * `desktop` — the whole chain at 1440, then the 1024 shell.
 *
 * The reload is the point of it. Everything before proves the browser rendered
 * something; only a reload proves the API, the database and the resume path
 * agreed about what the customer did.
 */
export async function desktopJourney() {
  const { browser, context, page, origin } = await openRole('desktop', {
    viewport: DESKTOP_VIEWPORT,
  });
  const facts = [];
  try {
    const product = await page.goto(productUrl(origin), { waitUntil: 'domcontentloaded' });
    facts.push(equals('storefront product page serves', product?.status(), 200));

    const templates = await startClone(page, origin, TEMPLATE_NAME);
    facts.push(atLeast('published Templates offered to the customer (APP3-B05)', templates, 3));
    facts.push(
      equals('exactly one Studio stage', await countOf(page, 'studio-stage-viewport-layer'), 1),
    );
    facts.push(
      equals(
        'the cloned Template rendered its image element',
        await countOf(page, `studio-element-${IMAGE_ELEMENT}`),
        1,
      ),
    );
    facts.push(
      equals(
        'the runtime watermark is drawn (APP3-S09)',
        await countOf(page, 'studio-watermark'),
        1,
      ),
    );

    const flags = await sessionCookieFlags(context);
    facts.push(fact('the Session cookie was issued', flags !== undefined, String(flags?.name)));
    facts.push(equals('cookie HttpOnly', flags?.httpOnly, true));
    facts.push(equals('cookie Secure', flags?.secure, true));
    facts.push(equals('cookie host-only', flags?.hostOnly, true));
    facts.push(equals('cookie path', flags?.path, '/'));
    facts.push(
      equals('page script cannot read the credential', await documentCanSeeSession(page), false),
    );

    await selectElement(page, TEXT_ELEMENT);
    const before = await transformOf(page, TEXT_ELEMENT);
    const zoom = await zoomIn(page);
    await dragMove(page, TEXT_ELEMENT, 24, 12);
    const after = await transformOf(page, TEXT_ELEMENT);
    facts.push(
      fact(
        'a desktop drag moved the element (APP3-S03)',
        before !== after,
        `at zoom ${zoom}: ${before} -> ${after}`,
      ),
    );
    facts.push(atLeast('the move produced history (APP3-S08)', await historyCount(page), 1));

    const chip = await waitForSaved(page);
    facts.push(matches('the save chip reports a server-confirmed save (APP3-S10)', chip, /Đã lưu/));

    await page.reload({ waitUntil: 'networkidle' });
    const asked = await continueSession(page);
    facts.push(
      fact(
        'the returning customer is ASKED to resume rather than resumed silently (APP3-B07)',
        asked,
        String(asked),
      ),
    );
    const resumed = await transformOf(page, TEXT_ELEMENT);
    facts.push(
      equals('the reloaded Session resumed the saved geometry (APP3-B07/S10)', resumed, after),
    );
    facts.push(
      equals(
        'resume did not open a second stage',
        await countOf(page, 'studio-stage-viewport-layer'),
        1,
      ),
    );

    await page.setViewportSize(TABLET_VIEWPORT);
    await page.waitForTimeout(400);
    facts.push(
      equals(
        '1024 offers the text drawer trigger (APP3-S05-C1)',
        await countOf(page, 'studio-text-drawer-trigger'),
        1,
      ),
    );
    facts.push(
      equals('1024 keeps one stage', await countOf(page, 'studio-stage-viewport-layer'), 1),
    );
  } catch (error) {
    // The facts gathered before the failure are the run's most useful output:
    // they say how far the chain got, which a bare stack trace does not.
    facts.push(
      fact('the journey ran to its end', false, String(error?.message ?? error).split('\n')[0]),
    );
  } finally {
    await browser.close();
  }
  return { title: 'desktop — discover, clone, edit, save, reload, resume', facts };
}

/**
 * `upload` — a customer image all the way to private delivery, and the refusal.
 *
 * Two Sessions on this identity, and both are the point: a Blank Session proves
 * the empty stage the copy promises, and a cloned one carries the image element
 * an upload replaces.
 */
export async function uploadJourney() {
  const { browser, context, page, origin } = await openRole('upload', {
    viewport: DESKTOP_VIEWPORT,
  });
  const facts = [];
  try {
    /*
     * The cloned Session comes FIRST, on a browser that has never held another.
     *
     * It was the other way round until this run measured the difference: opening
     * a Blank Session, starting over and then cloning left the browser holding
     * TWO `__Host-` Session credentials, and the upload that followed ended in a
     * real `409`. Whatever the cause of that conflict turns out to be, an upload
     * measured in that state is measuring two things at once, so the pipeline is
     * asked on a clean Session and the second-credential observation is made
     * afterwards, on its own, where it cannot be confused with a delivery fault.
     */
    await startClone(page, origin, TEMPLATE_NAME);
    await selectElement(page, IMAGE_ELEMENT);

    const good = writeUpload('app3-e01-upload.png', Buffer.from(PNG_BASE64, 'base64'));
    await page.setInputFiles('[data-testid="studio-image-file"]', good);
    // The product's own terminal sentence, not a guess at one: anything else
    // would pass on "Đang xử lý ảnh…" and call a stuck pipeline a success.
    const status = await page
      .waitForFunction(
        (placed) => {
          const node = document.querySelector('[data-testid="studio-image-status"]');
          const text = node?.textContent?.trim() ?? '';
          return text === placed ? text : null;
        },
        STUDIO_IMAGE_PLACED,
        { timeout: 180_000 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => '');
    // Whatever the screen actually says, so a failure names the state reached
    // rather than reporting the absence of the state expected.
    const settled = String(status).trim();
    const shown =
      settled === ''
        ? `${await textOf(page, 'studio-image-status')} / ${await textOf(page, 'studio-image-refusal')}`
        : settled;
    facts.push(
      fact(
        'the upload reached a terminal ready state (B06B → worker → B06C)',
        settled !== '',
        shown,
      ),
    );

    /*
     * The finding this journey exists to make.
     *
     * `APP3-B06B` advances the Session revision as part of the upload — the API
     * says so in its own words ("association and revision advance describe one
     * logical fact") and returns the new revision in the upload response.
     * `APP3-S06` keeps that revision for its OWN next upload, in a local state
     * of `use-studio-image`, and never hands it to `APP3-S10`'s autosave, whose
     * `serverRevision` still holds the pre-upload value. So the customer's very
     * next save is a stale write, the server correctly refuses it `409`, and a
     * customer with ONE tab open is shown "Xung đột" for a conflict with nobody.
     *
     * Neither checkpoint could see this alone: S06 was accepted before S10
     * existed, and S10 was accepted against an injected revision rather than one
     * an upload had moved. It is exactly the class of defect a cross-layer
     * journey is for, and it is reported rather than worked around here.
     */
    const saved = await waitForSaved(page, 40_000);
    facts.push(
      matches(
        'an upload does not leave the next save in conflict (APP3-S06 → APP3-S10 revision seam)',
        saved,
        /Đã lưu/,
      ),
    );

    /*
     * Delivery is asked AFTER a reload, on purpose.
     *
     * `APP3-S06` renders the customer's own file from a local object URL while
     * it is being uploaded, so the `href` in the tab that did the uploading is
     * the browser's blob and proves nothing about delivery. A reload has no
     * blob: whatever renders then came from the server, which is the only way to
     * ask whether the private `APP3-B06C` route is what serves it.
     */
    await page.reload({ waitUntil: 'networkidle' });
    await continueSession(page);
    const href = await page.evaluate(
      (id) =>
        document
          .querySelector(`[data-testid="studio-element-${id}"] image`)
          ?.getAttribute('href') ?? '',
      IMAGE_ELEMENT,
    );
    facts.push(
      matches(
        'the image is served by the private Session delivery route (APP3-B06C)',
        href,
        /design-sessions\/[^/]+\/assets\//,
      ),
    );

    if (/^\//.test(href)) {
      const unauthenticated = await page.evaluate(async (path) => {
        const response = await fetch(new URL(path, location.origin), { credentials: 'omit' });
        return response.status;
      }, href);
      facts.push(
        fact(
          'the delivery route refuses a caller with no Session credential',
          unauthenticated >= 400,
          `${href} -> ${String(unauthenticated)}`,
        ),
      );
    } else {
      // Not skipped silently: an unasked question is reported as unasked.
      facts.push(
        fact(
          'the delivery route refuses a caller with no Session credential',
          false,
          `not asked: the element still carries ${href.split(':')[0]}:`,
        ),
      );
    }

    const bad = writeUpload('app3-e01-upload.txt', Buffer.from('not an image', 'utf8'));
    await page.setInputFiles('[data-testid="studio-image-file"]', bad);
    const refusal = await page
      .waitForSelector('[data-testid="studio-image-refusal"]', { timeout: 60_000 })
      .then((node) => node.textContent())
      .catch(() => '');
    facts.push(
      fact(
        'a real rejection is shown to the customer',
        String(refusal).trim() !== '',
        String(refusal).trim() || 'no refusal rendered',
      ),
    );

    /*
     * Starting over, and what the browser is left holding.
     *
     * Last, because it is the step that changes the browser's credential state.
     * `APP3-B07` names each cookie after the Session it belongs to, so declining
     * a resume and opening a new Session leaves the previous credential behind
     * unless something clears it. Measured: 2. A browser holding two Session
     * credentials is a browser whose next write may be attributed to either, and
     * the first upload journey written against that state ended in a real `409`.
     */
    const restarted = await restartSession(page, origin);
    facts.push(
      fact(
        'a returning customer can decline the resume and start over (APP3-B07)',
        restarted,
        String(restarted),
      ),
    );
    await page
      .getByRole('button', { name: 'Bắt đầu với thiết kế trống' })
      .click({ timeout: 20_000 });
    await page.waitForSelector('[data-testid="studio-stage-viewport-layer"]', { timeout: 30_000 });
    facts.push(
      equals('a Blank Session opens an empty stage', await countOf(page, 'studio-stage-empty'), 1),
    );
    facts.push(
      equals(
        'a Blank Session clones no element',
        await countOf(page, `studio-element-${TEXT_ELEMENT}`),
        0,
      ),
    );
    const held = (await context.cookies()).filter((cookie) =>
      cookie.name.startsWith(SESSION_COOKIE_PREFIX),
    );
    facts.push(equals('starting over leaves exactly one Session credential', held.length, 1));
  } catch (error) {
    // The facts gathered before the failure are the run's most useful output:
    // they say how far the chain got, which a bare stack trace does not.
    facts.push(
      fact('the journey ran to its end', false, String(error?.message ?? error).split('\n')[0]),
    );
  } finally {
    await browser.close();
  }
  return { title: 'upload — intake, worker, private delivery, refusal', facts };
}

/**
 * `mobile` — the 390 surface, and the two gestures that must write nothing.
 *
 * The negative half is the valuable half: a pinch that quietly produced a
 * history item or a save would make undo lie and the save chip lie, and neither
 * is visible from the screen.
 */
export async function mobileJourney() {
  const { browser, page, origin } = await openRole('mobile', {
    viewport: MOBILE_VIEWPORT,
    mobile: true,
  });
  const facts = [];
  try {
    await startClone(page, origin, TEMPLATE_NAME);
    facts.push(
      equals(
        'exactly one mobile toolbar (APP3-S11)',
        await countOf(page, 'studio-mobile-toolbar'),
        1,
      ),
    );
    facts.push(
      equals('no desktop history rail at 390', await countOf(page, 'studio-history-rail'), 0),
    );

    const targets = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="studio-mobile-toolbar"] button')].map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.getAttribute('data-testid'),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
    );
    facts.push(equals('five approved toolbar targets', targets.length, 5));
    facts.push(
      fact(
        'every target is at least 56 px tall',
        targets.every((target) => target.height >= 56),
        targets.map((target) => `${target.id}:${String(target.height)}`).join(' '),
      ),
    );

    await page.evaluate(TOUCH_PROBE);
    await page.tap(`[data-testid="studio-element-${TEXT_ELEMENT}"]`);
    await page.waitForSelector('[data-testid="studio-transform-overlay"]', { timeout: 10_000 });

    /*
     * History is counted by UNDOING, not by counting rows.
     *
     * `APP3-S11` renders no history list at 390 — the desktop panel returns null
     * — so a row count here would read 0 whatever the engine holds, and would
     * "pass" the negative assertions below for the wrong reason. Pressing undo
     * exactly once and requiring the element back at its starting geometry is a
     * stronger statement anyway: it proves the move was ONE item, not merely
     * that it was at least one.
     */
    const beforeTransform = await transformOf(page, TEXT_ELEMENT);
    facts.push(
      equals(
        'undo is offered but inert before any edit',
        await page.locator('[data-testid="studio-mobile-undo"]').isDisabled(),
        true,
      ),
    );
    const moved = await page.evaluate((id) => window.__e01.move(id, 30, 18, 20), TEXT_ELEMENT);
    facts.push(
      fact(
        'one finger moved the element (APP3-S11)',
        moved !== null && moved !== beforeTransform,
        `${beforeTransform} -> ${String(moved)}`,
      ),
    );

    await page.tap('[data-testid="studio-mobile-undo"]');
    await page.waitForTimeout(300);
    facts.push(
      equals(
        'one touch move is exactly one history item',
        await transformOf(page, TEXT_ELEMENT),
        beforeTransform,
      ),
    );
    await page.tap('[data-testid="studio-mobile-redo"]');
    await page.waitForTimeout(300);
    facts.push(
      equals('redo restores the moved geometry', await transformOf(page, TEXT_ELEMENT), moved),
    );

    const zoomBefore = await textOf(page, 'studio-zoom-value');
    const requests = await recordRequests(page, () => page.evaluate(() => window.__e01.pinch(20)));
    const zoomAfter = await textOf(page, 'studio-zoom-value');
    facts.push(
      fact(
        'a pinch changed the viewport zoom (APP3-S07 steps)',
        zoomBefore !== zoomAfter,
        `${zoomBefore} -> ${zoomAfter}`,
      ),
    );
    // The same undo-shaped proof: if the pinch had written history, this undo
    // would take back the pinch instead of the move.
    await page.tap('[data-testid="studio-mobile-undo"]');
    await page.waitForTimeout(300);
    facts.push(
      equals('a pinch wrote no history', await transformOf(page, TEXT_ELEMENT), beforeTransform),
    );
    facts.push(
      equals(
        'a pinch wrote no autosave',
        requests.filter((entry) => /^(POST|PUT|PATCH)/.test(entry)).length,
        0,
      ),
    );

    await page.tap('[data-testid="studio-mobile-layers"]');
    facts.push(
      atLeast(
        'the layers sheet lists the cloned elements',
        await countOf(page, 'studio-mobile-layers-status'),
        1,
      ),
    );
  } catch (error) {
    // The facts gathered before the failure are the run's most useful output:
    // they say how far the chain got, which a bare stack trace does not.
    facts.push(
      fact('the journey ran to its end', false, String(error?.message ?? error).split('\n')[0]),
    );
  } finally {
    await browser.close();
  }
  return { title: 'mobile — 390 toolbar, gestures, and what they must not write', facts };
}

export const STUDIO_JOURNEYS = Object.freeze({
  desktop: desktopJourney,
  upload: uploadJourney,
  mobile: mobileJourney,
});

export async function runStudioJourney(name) {
  const journey = STUDIO_JOURNEYS[name];
  if (journey === undefined) throw new Error(`unknown journey "${name}"`);
  const { title, facts } = await journey();
  return report(title, facts);
}
