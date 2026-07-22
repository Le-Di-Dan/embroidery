#!/usr/bin/env node
/**
 * Foundation validation for @embroidery/styles (APP0-S01A).
 *
 * Cross-platform (Windows + Linux); uses the Sass JS API only — no shell, no
 * POSIX-only paths. Fails with a non-zero exit code and a readable message.
 *
 * Checks:
 *   1. Every `.scss` file uses `@use`/`@forward` and never legacy `@import`.
 *   2. The public entry compiles successfully.
 *   3. The public entry emits NO CSS (token-only, side-effect free).
 *   4. Tokens resolve through the public entry (colour, spacing tool, radius,
 *      motion) to their approved values.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import * as sass from 'sass';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(scriptDir);
const srcDir = join(packageDir, 'src');
const entryFile = join(srcDir, 'index.scss');

const failures = [];

function fail(message) {
  failures.push(message);
}

function collectScssFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectScssFiles(full));
    } else if (entry.endsWith('.scss')) {
      found.push(full);
    }
  }
  return found;
}

// 1. No legacy @import anywhere in the source tree.
const scssFiles = collectScssFiles(srcDir);
if (scssFiles.length === 0) {
  fail('No .scss files found under src/.');
}
for (const file of scssFiles) {
  const content = readFileSync(file, 'utf8');
  if (/^\s*@import\b/m.test(content)) {
    fail(`Forbidden @import found in ${file}; use @use/@forward instead.`);
  }
}

// 2 + 3. Public entry compiles and emits no CSS.
try {
  const compiled = sass.compile(entryFile);
  if (compiled.css.trim() !== '') {
    fail(`Public entry emitted CSS but must be side-effect free. Output:\n${compiled.css}`);
  }
} catch (error) {
  fail(`Public entry failed to compile: ${error.message}`);
}

// 4. Tokens resolve through the public entry to approved values.
const probe = `@use 'index' as styles;
.probe {
  color: styles.$color-text-primary;
  background: styles.$color-background-primary;
  padding: styles.spacing(24);
  border-radius: styles.$radius-card;
  transition-duration: styles.$motion-duration-fast;
  max-width: styles.$layout-content-max;
}`;

const expectedDeclarations = [
  'color: #171717',
  'background: #faf8f5',
  'padding: 24px',
  'border-radius: 24px',
  'transition-duration: 150ms',
  'max-width: 1280px',
];

try {
  const compiledProbe = sass.compileString(probe, { loadPaths: [srcDir] });
  for (const declaration of expectedDeclarations) {
    if (!compiledProbe.css.includes(declaration)) {
      fail(
        `Expected declaration \`${declaration}\` not produced by public tokens. Output:\n${compiledProbe.css}`,
      );
    }
  }
} catch (error) {
  fail(`Token probe failed to compile: ${error.message}`);
}

if (failures.length > 0) {
  console.error('APP0-S01A foundation validation FAILED:');
  for (const message of failures) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log(
  `APP0-S01A foundation validation PASSED (${scssFiles.length} .scss files; entry emits no CSS; tokens resolve).`,
);
