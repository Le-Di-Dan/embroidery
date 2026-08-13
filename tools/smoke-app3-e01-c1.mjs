#!/usr/bin/env node
/**
 * `APP3-E01-C1` — the one real browser proof of the repaired revision seam.
 *
 * `APP3-E01` found `FU-APP3-UPLOAD-REVISION-SEAM-01` by putting `APP3-S06` and
 * `APP3-S10` in one browser: an image upload advanced the Session revision, the
 * autosave that followed still presented the pre-upload one, the server refused
 * it `409`, and a customer with a single tab open was shown "Xung đột" for a
 * conflict with nobody — then reloaded into a design that had never persisted.
 *
 * This run walks that exact chain once and records the numbers rather than a
 * verdict: what the upload returned, what the save presented, what the server
 * answered, what the chip said, and what came back after a reload. A journey
 * that only reported "green" would be indistinguishable from one measuring the
 * wrong thing.
 *
 * It is deliberately ONE journey. Every other piece of `APP3-E01` evidence is
 * reused, not rerun, because this correction changes none of the source that
 * produced it.
 *
 * Usage (the identities and the origin allow-list must already be up, which is
 * what `node tools/smoke-app3-e01.mjs --keep` leaves behind):
 *
 *     node tools/smoke-app3-e01-c1.mjs [role]
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  continueSession,
  fact,
  matches,
  openRole,
  report,
  startClone,
  waitForSaved,
} from './smoke-app3-e01-journey.mjs';

/** The Template the run clones: it carries both an image and a text element. */
const TEMPLATE_NAME = 'Vườn hồng tháng Tư';

/** A 1×1 PNG — the smallest thing the real intake pipeline will accept. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function writeUpload(name, bytes) {
  const path = join(mkdtempSync(join(tmpdir(), 'app3-e01-c1-')), name);
  writeFileSync(path, bytes);
  return path;
}

/**
 * Everything the two Session mutations said, read off the wire.
 *
 * Recorded from the responses themselves rather than from application state:
 * the whole defect was a client believing a revision the server had superseded,
 * so the client is exactly the wrong witness.
 */
function recordMutations(page) {
  const seen = { upload: null, save: null };
  page.on('response', (response) => {
    const url = response.url();
    const method = response.request().method();
    if (method === 'POST' && /\/design-sessions\/[^/]+\/assets$/.test(url)) {
      void response
        .json()
        .then((body) => {
          seen.upload = {
            status: response.status(),
            revision: body?.data?.sessionRevision ?? null,
          };
        })
        .catch(() => undefined);
      return;
    }
    if (method === 'PUT' && /\/design-sessions\/[^/]+\/document$/.test(url)) {
      let presented = null;
      try {
        presented = JSON.parse(response.request().postData() ?? '{}').expectedRevision ?? null;
      } catch {
        presented = null;
      }
      const status = response.status();
      void response
        .json()
        .then((body) => {
          seen.save = { presented, status, revision: body?.data?.revision ?? null };
        })
        .catch(() => {
          // A refusal has no snapshot to report, and that is itself the answer.
          seen.save = { presented, status, revision: null };
        });
      return;
    }
    if (method === 'POST' && /\/design-sessions\/[^/]+\/resume$/.test(url)) {
      void response
        .json()
        .then((body) => {
          const elements = body?.data?.document?.elements ?? [];
          seen.resume = {
            revision: body?.data?.revision ?? null,
            images: elements.filter((element) => element?.type === 'image').length,
          };
        })
        .catch(() => undefined);
    }
  });
  return seen;
}

export async function revisionSeamJourney(role = 'desktop') {
  const { browser, page, origin } = await openRole(role);
  const facts = [];
  const wire = recordMutations(page);
  /** Every private delivery read that happened after the reload. */
  let deliveredAfterReload = 0;
  try {
    await startClone(page, origin, TEMPLATE_NAME);

    const file = writeUpload('app3-e01-c1.png', Buffer.from(PNG_BASE64, 'base64'));
    await page.setInputFiles('[data-testid="studio-image-file"]', file);

    // The image is on the stage when the document holds one more image element
    // than the Template gave it. Read from the product's own store rather than
    // from a sentence, so a copy change cannot make this pass or fail.
    const placed = await page
      .waitForFunction(
        () =>
          document.querySelectorAll('[data-testid^="studio-element-"] image').length >= 2
            ? document.querySelectorAll('[data-testid^="studio-element-"] image').length
            : null,
        undefined,
        { timeout: 180_000 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => 0);
    facts.push(
      fact(
        'the upload reached the stage (B06B → worker → S06)',
        placed >= 2,
        `${String(placed)} image elements`,
      ),
    );

    const chip = await waitForSaved(page, 40_000);
    facts.push(
      matches('the save that follows an upload is not a conflict', chip, /Đã lưu/),
      fact(
        'the save presented the revision the upload returned',
        wire.upload !== null && wire.save !== null && wire.save.presented === wire.upload.revision,
        `upload -> ${String(wire.upload?.revision)}, save presented ${String(wire.save?.presented)}`,
      ),
      fact(
        'the server accepted it',
        wire.save?.status === 200,
        `PUT /document -> ${String(wire.save?.status)}, revision ${String(wire.save?.revision)}`,
      ),
    );

    page.on('response', (response) => {
      if (/\/design-sessions\/[^/]+\/assets\/[^/]+\/editor-preview$/.test(response.url())) {
        deliveredAfterReload += response.status() === 200 ? 1 : 0;
      }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await continueSession(page);
    await page.waitForTimeout(2000);

    facts.push(
      fact(
        'the reloaded Session holds the uploaded image',
        (wire.resume?.images ?? 0) >= 2,
        `resume revision ${String(wire.resume?.revision)}, ${String(wire.resume?.images)} image elements`,
      ),
      fact(
        'its bytes are served by the private route (APP3-B06C)',
        deliveredAfterReload > 0,
        `${String(deliveredAfterReload)} editor-preview reads answered 200 after the reload`,
      ),
    );
  } finally {
    await browser.close();
  }
  return { title: 'APP3-E01-C1 — upload → revision → autosave → reload', facts };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const { title, facts } = await revisionSeamJourney(process.argv[2] ?? 'desktop');
  process.exitCode = report(title, facts) ? 0 : 1;
}
