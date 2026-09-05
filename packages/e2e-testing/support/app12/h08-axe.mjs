/**
 * The `APP12-H08` automated accessibility scanner.
 *
 * ## Why axe-core, and why test-only
 *
 * `APP12-H08` §10 allows a focused test-only `axe-core` integration when no
 * accessibility tooling already exists, and none did: the repository carried no
 * `axe`, no `jest-axe`, no `@axe-core/playwright` and no lint plugin for it
 * before this checkpoint. It is a **devDependency of the E2E package alone** —
 * no application, no shared package and no runtime bundle references it, so
 * nothing it does can reach a shipped page.
 *
 * ## What is scanned, and against what
 *
 * The default run asks for the WCAG 2.2 AA tag set exactly — the standard §2
 * names — because that, and not axe's opinion of good practice, is what this
 * gate is measured against. Best-practice rules are still evaluated in a second
 * pass so a reviewer can read them, but they are reported separately and never
 * counted toward the `serious/critical = 0` gate. A rule is never disabled to
 * make a page green (§10).
 *
 * ## Nothing a violation carries may leak
 *
 * axe returns each failing node's outer HTML. On `/truy-cap/don-hang` that
 * markup sits on a screen reached with a live `ORDER_ACCESS` credential, and a
 * report or a console line is exactly the artifact `APP12-S03` and `APP12-H06`
 * spent their §14s keeping such material out of. So the `html` field is
 * **dropped at the boundary** — this module returns rule ids, impacts, tags,
 * counts and CSS target selectors, and no element content at all. A selector
 * names a position in a document; it cannot carry an amount, a reference, a
 * contact or a token.
 *
 * Test-only. Never imported by application code.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** The WCAG 2.2 AA tag set — `APP12-H08` §2's target, stated once. */
export const WCAG22AA_TAGS = Object.freeze([
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
]);

/** axe's own best-practice tag. Reviewed by a human; never part of the gate. */
export const BEST_PRACTICE_TAGS = Object.freeze(['best-practice']);

/** The impacts §15 counts. Anything below is read, not gated. */
export const GATED_IMPACTS = Object.freeze(['serious', 'critical']);

let axeSource;

/** The bundled `axe.min.js`, read once per process. */
function axeBundle() {
  if (axeSource === undefined) {
    axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  }
  return axeSource;
}

/** The scanner version, for the report's own record. */
export function axeVersion() {
  return require('axe-core/package.json').version;
}

/**
 * Installs axe into the page's main frame if it is not already there.
 *
 * `addScriptTag` rather than `addInitScript`: the pages under test carry a
 * strict CSP with a per-request nonce (`APP12-H02`), and an init script would
 * be evaluated as page script and refused. `addScriptTag` runs the source
 * through the CDP evaluation channel, which the policy does not govern.
 */
export async function ensureAxe(page) {
  return installAxe(page);
}

async function installAxe(page) {
  const present = await page.evaluate(() => typeof window.axe !== 'undefined');
  if (present) return;
  // `\n;0;` so the program's completion value is a serializable literal rather
  // than whatever the UMD wrapper happens to leave behind, and on its own line
  // so a trailing `//# sourceMappingURL` comment cannot swallow it.
  await page.evaluate(`${axeBundle()}\n;0;`);
}

/**
 * Runs one scan and returns a compact, secret-free summary.
 *
 * `include` narrows the scan to a region when a page's subject is one panel;
 * omitted, the whole document is scanned. `tags` defaults to WCAG 2.2 AA.
 */
export async function runAxe(page, options = {}) {
  const { include, tags = WCAG22AA_TAGS, label = 'page', disableRules = [] } = options;
  await installAxe(page);

  const raw = await page.evaluate(
    async ({ include, tags, disableRules }) => {
      const context = include === undefined ? document : { include: [include] };
      const rules = {};
      for (const id of disableRules) rules[id] = { enabled: false };
      const result = await window.axe.run(context, {
        runOnly: { type: 'tag', values: tags },
        rules,
        resultTypes: ['violations'],
      });
      return {
        url: window.location.pathname,
        violations: result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          tags: violation.tags,
          help: violation.help,
          nodes: violation.nodes.length,
          // Selectors only — never `node.html`. See the module note.
          targets: violation.nodes.slice(0, 4).map((node) => String(node.target)),
        })),
        passes: result.passes === undefined ? undefined : result.passes.length,
      };
    },
    { include: include ?? undefined, tags: [...tags], disableRules: [...disableRules] },
  );

  return {
    label,
    route: raw.url,
    violations: raw.violations,
    gated: raw.violations.filter((violation) => GATED_IMPACTS.includes(violation.impact)),
  };
}

/**
 * The one-line failure message a spec fails with.
 *
 * Names the rule, its impact and where — and nothing from the element itself,
 * for the reason the module note gives.
 */
export function describeViolations(scan) {
  return scan.gated
    .map(
      (violation) =>
        `${violation.impact}/${violation.id} ×${String(violation.nodes)} @ ${violation.targets.join(' | ')}`,
    )
    .join('; ');
}
