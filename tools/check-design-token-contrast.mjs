#!/usr/bin/env node
/**
 * Design-token contrast gate (`APP12-V02` §15, PO authority `PO-APP12-004`).
 *
 * `APP12-H08` measured four token pairs that fail WCAG 2.2 AA and left the
 * decision to the Product Owner; `V01-UX-031` re-observed them and found no
 * fifth. This tool is what makes the correction checkable: it reads the colour
 * tokens straight out of `packages/styles/src/settings/_color.scss` and computes
 * the ratio for each declared pair, so a token edit that breaks a pair fails
 * here rather than in the next audit.
 *
 * It measures **tokens**, not screens. A rendered contrast failure can also come
 * from a component putting the wrong pair together, and `axe` on the live pages
 * is what catches that; this gate exists because a token pair that cannot pass
 * anywhere is worth refusing once rather than in every screen that uses it.
 *
 * Cross-platform (Windows + Linux): pure Node, no shell, no network. Never
 * modifies files. Non-zero exit on any violation.
 *
 * Usage: node tools/check-design-token-contrast.mjs [rootDir]
 *        node tools/check-design-token-contrast.mjs --report   (prints every pair)
 */
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import process from 'node:process';

export const COLOR_TOKENS_PATH = 'packages/styles/src/settings/_color.scss';

/** WCAG 2.2 contrast minimums. */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_NON_TEXT = 3;

/**
 * The pairs the product actually paints, and the target each must meet.
 *
 * A pair is listed when a component genuinely renders that foreground on that
 * background. Listing every possible combination would produce failures for
 * pairs nothing uses, which is how a gate becomes noise.
 */
export const MEASURED_PAIRS = [
  // --- Body and supporting text ---------------------------------------------
  {
    id: 'text-primary-on-background-primary',
    foreground: 'color-text-primary',
    background: 'color-background-primary',
    minimum: AA_NORMAL_TEXT,
    note: 'Body copy on the page.',
  },
  {
    id: 'text-secondary-on-background-primary',
    foreground: 'color-text-secondary',
    background: 'color-background-primary',
    minimum: AA_NORMAL_TEXT,
    note: 'Helper text and captions on the page.',
  },
  {
    id: 'text-secondary-on-background-secondary',
    foreground: 'color-text-secondary',
    background: 'color-background-secondary',
    minimum: AA_NORMAL_TEXT,
    note: 'Helper text inside a card or a filled control. `PO-APP12-004`.',
  },
  {
    id: 'text-tertiary-on-background-secondary',
    foreground: 'color-text-tertiary',
    background: 'color-background-secondary',
    minimum: AA_NORMAL_TEXT,
    note: 'Metadata inside a card. `PO-APP12-004`.',
  },
  {
    id: 'text-tertiary-on-background-primary',
    foreground: 'color-text-tertiary',
    background: 'color-background-primary',
    minimum: AA_NORMAL_TEXT,
    note: 'Metadata on the page.',
  },

  // --- The action ------------------------------------------------------------
  {
    id: 'surface-primary-on-action-fill',
    foreground: 'color-surface-primary',
    background: 'color-action-fill',
    minimum: AA_NORMAL_TEXT,
    note: 'The label of every filled primary action. `PO-APP12-004`.',
  },
  {
    id: 'surface-primary-on-action-fill-hover',
    foreground: 'color-surface-primary',
    background: 'color-action-fill-hover',
    minimum: AA_NORMAL_TEXT,
    note: 'The same label under the pointer.',
  },
  {
    id: 'surface-primary-on-action-fill-active',
    foreground: 'color-surface-primary',
    background: 'color-action-fill-active',
    minimum: AA_NORMAL_TEXT,
    note: 'The same label while pressed.',
  },

  // --- Status ---------------------------------------------------------------
  {
    id: 'status-warning-on-background-secondary',
    foreground: 'color-status-warning',
    background: 'color-background-secondary',
    minimum: AA_NORMAL_TEXT,
    note: 'A warning state inside a card. `PO-APP12-004`.',
  },
  {
    id: 'status-error-on-background-secondary',
    foreground: 'color-status-error',
    background: 'color-background-secondary',
    minimum: AA_NORMAL_TEXT,
    note: 'A refusal inside a card — the paired alert state `PO-APP12-004` asks about.',
  },
  {
    id: 'status-success-on-background-secondary',
    foreground: 'color-status-success',
    background: 'color-background-secondary',
    minimum: AA_NORMAL_TEXT,
    note: 'A satisfied state inside a card.',
  },

  // --- Non-text -------------------------------------------------------------
  {
    id: 'focus-ring-on-background-primary',
    foreground: 'color-focus-ring',
    background: 'color-background-primary',
    minimum: AA_NON_TEXT,
    note: 'The keyboard focus indicator on the page (`V01-UX-007`).',
  },
  {
    id: 'focus-ring-on-background-secondary',
    foreground: 'color-focus-ring',
    background: 'color-background-secondary',
    minimum: AA_NON_TEXT,
    note: 'The same indicator on a card or a filled control.',
  },
  {
    id: 'border-strong-on-background-primary',
    foreground: 'color-border-strong',
    background: 'color-background-primary',
    minimum: AA_NON_TEXT,
    note: 'The boundary of an outlined control (WCAG 1.4.11).',
  },
  {
    id: 'border-strong-on-background-secondary',
    foreground: 'color-border-strong',
    background: 'color-background-secondary',
    minimum: AA_NON_TEXT,
    note: 'The same boundary inside a card.',
  },
];

/** Every `$name: #rrggbb;` in the colour settings, by name without the `$`. */
export function readColorTokens(rootDir) {
  const source = readFileSync(join(rootDir, COLOR_TOKENS_PATH.split('/').join(sep)), 'utf8');
  const tokens = new Map();
  for (const match of source.matchAll(/^\$([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/gmu)) {
    tokens.set(match[1], match[2]);
  }
  return tokens;
}

function channels(hex) {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value.slice(0, 6);
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255);
}

/** WCAG relative luminance. */
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, rounded to two decimals the way a report quotes it. */
export function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
}

export function measure(rootDir = process.cwd()) {
  const tokens = readColorTokens(rootDir);
  return MEASURED_PAIRS.map((pair) => {
    const foreground = tokens.get(pair.foreground);
    const background = tokens.get(pair.background);
    if (foreground === undefined || background === undefined) {
      return { ...pair, missing: true, ratio: null, passes: false };
    }
    const ratio = contrastRatio(foreground, background);
    return {
      ...pair,
      foregroundHex: foreground,
      backgroundHex: background,
      ratio,
      passes: ratio >= pair.minimum,
      missing: false,
    };
  });
}

function main() {
  const args = process.argv.slice(2);
  const report = args.includes('--report');
  const rootDir = args.find((arg) => !arg.startsWith('--')) ?? process.cwd();

  const results = measure(rootDir);
  const failures = results.filter((result) => !result.passes);

  if (report || failures.length > 0) {
    const width = Math.max(...results.map((result) => result.id.length));
    for (const result of results) {
      const status = result.missing ? 'MISSING' : result.passes ? 'pass' : 'FAIL';
      const ratio = result.ratio === null ? '   —  ' : `${result.ratio.toFixed(2)}:1`.padStart(7);
      const stream = result.passes ? console.log : console.error;
      stream(
        `  ${result.id.padEnd(width)}  ${ratio}  need ${result.minimum}  ${status}` +
          (result.missing ? '  (token not found)' : ''),
      );
    }
  }

  if (failures.length > 0) {
    console.error(
      `\ncheck-design-token-contrast: ${failures.length} pair(s) below the WCAG 2.2 AA target.`,
    );
    return 1;
  }

  console.log(`check-design-token-contrast: OK — ${results.length} pairs meet their target.`);
  return 0;
}

if (process.argv[1]?.endsWith('check-design-token-contrast.mjs')) {
  process.exit(main());
}
