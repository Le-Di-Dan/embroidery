/**
 * The `APP12-V01` evidence writer.
 *
 * Everything the audit produces lands under `evidences/v01/`, which the
 * checkpoint makes mandatory: a reviewer must be able to browse the folder and
 * follow the audit without opening the final report, and the Product Owner must
 * be able to watch it accumulate **while the run is happening** rather than
 * receive it all at the end.
 *
 * So this module does three things and no more:
 *
 * - it resolves the one evidence root, from the repository root the orchestrator
 *   passes in, and refuses to write anywhere else;
 * - it names screenshots deterministically — `<surface>/<route-key>/<viewport>/
 *   <state>-<shot>.png` — because a random Playwright artifact name cannot be
 *   cited from a finding;
 * - it appends to `AUDIT-LOG.md` as each cluster completes, and flushes the
 *   per-screen measurements to `data/` as they are taken, so a run that is
 *   interrupted still leaves everything it had already seen.
 *
 * ## Secrecy
 *
 * Two rules, and the second is the one that matters. **A screenshot is never
 * taken on a page whose URL still carries a credential** — the callers strip the
 * `ORDER_ACCESS` fragment before they ask for one, exactly as `APP12-S03` and
 * `APP12-H08` do, and `capture` asserts it rather than trusting them. And no
 * file name, log line or measurement key is ever derived from a route's own
 * identifiers: the route key is a fixed slug chosen by the spec.
 *
 * Test-only. Never imported by application code.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Anything that looks like a secure-link credential in a URL. */
const CREDENTIAL_IN_URL = /[#?&](t|token|code|k)=/i;

function repoRoot() {
  const root = process.env['E2E_REPO_ROOT'];
  if (root === undefined || root === '') {
    throw new Error('E2E_REPO_ROOT is not set — the V01 evidence root cannot be resolved');
  }
  return root;
}

/** `<repo>/evidences/v01`, created on first use. */
export function evidenceRoot() {
  const root = join(repoRoot(), 'evidences', 'v01');
  mkdirSync(root, { recursive: true });
  return root;
}

function ensureFile(path) {
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

/**
 * Writes one full-page screenshot and returns its repository-relative path.
 *
 * `fullPage` by default because §12 requires at least one per route/viewport;
 * pass `{ fullPage: false }` for the above-the-fold companion a busy screen
 * needs, and `{ clip }` for a detail crop that a finding points at.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{surface: string, route: string, viewport: string, state: string,
 *          shot?: string, fullPage?: boolean, clip?: object}} where
 */
export async function capture(page, where) {
  const url = page.url();
  if (CREDENTIAL_IN_URL.test(url)) {
    throw new Error(
      'refusing to screenshot a page whose URL still carries a credential — ' +
        'strip the secure-link fragment before capturing',
    );
  }
  const shot = where.shot ?? (where.fullPage === false ? 'above-fold' : 'full');
  const relative = join(
    'evidences',
    'v01',
    where.surface,
    where.route,
    where.viewport,
    `${where.state}-${shot}.png`,
  );
  const absolute = ensureFile(join(repoRoot(), relative));
  await page.screenshot({
    path: absolute,
    fullPage: where.clip === undefined && where.fullPage !== false,
    ...(where.clip === undefined ? {} : { clip: where.clip }),
    animations: 'disabled',
    caret: 'hide',
  });
  return relative.replace(/\\/g, '/');
}

/**
 * The measurement ledger.
 *
 * One JSON document per surface, keyed by `route/viewport/state`, flushed on
 * every write. Flushing every time rather than at the end is deliberate: the run
 * is long, and an audit that loses its measurements because the last journey
 * timed out would have to be repeated from the start.
 */
export function createLedger(surface) {
  const path = join(evidenceRoot(), 'data', `${surface}-measurements.json`);
  ensureFile(path);
  const screens = {};

  return {
    /** Records one measured screen and returns the key it was filed under. */
    add(key, payload) {
      screens[key] = payload;
      writeFileSync(path, `${JSON.stringify({ surface, screens }, null, 2)}\n`, 'utf8');
      return key;
    },
    get path() {
      return path;
    },
    get size() {
      return Object.keys(screens).length;
    },
  };
}

/**
 * Appends one cluster entry to the live audit log.
 *
 * Called as each cluster finishes rather than at the end, because §44 makes the
 * log the Product Owner's window into a run in progress.
 */
export function appendAuditLog(entry) {
  const path = join(evidenceRoot(), 'AUDIT-LOG.md');
  const lines = [
    '',
    `## ${entry.cluster}`,
    '',
    `- completed: \`${new Date().toISOString()}\``,
    `- screens: ${String(entry.screens)}`,
    `- screenshots: ${String(entry.screenshots)}`,
    `- routes: ${entry.routes.join(', ')}`,
    `- top concerns: ${entry.concerns.join(' · ')}`,
    `- next: ${entry.next}`,
    '',
  ];
  appendFileSync(path, lines.join('\n'), 'utf8');
}

/** Writes an arbitrary JSON artifact under `evidences/v01/data/`. */
export function writeData(name, value) {
  const path = ensureFile(join(evidenceRoot(), 'data', name));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}
