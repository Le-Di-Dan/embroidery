#!/usr/bin/env node
/**
 * Scoped per-app SCSS compile gate (`FU-APP10-E01-02`, built at `APP11-S01`).
 *
 * Usage: node tools/check-app-scss.mjs <storefront|admin>
 *
 * Why this exists: `next/jest` mocks stylesheets, so the Jest suites cannot see
 * a fatal Sass error, and `check-file-size.mjs` never reads `.scss` at all.
 * `APP10-E01` measured the consequence — six fatal stylesheet defects reached
 * `production` and took both applications down with an HTTP 500 that every
 * green test suite had missed.
 *
 * Why it is a Node script and not a `sass` CLI invocation: each `main.scss`
 * opens with `@use '@embroidery/styles'`, a **bare package specifier**. The
 * Sass CLI has no package resolution, and `--load-path` cannot supply one
 * (`APP11-G01` §follow-ups records four failed CLI attempts). Next resolves it
 * with its own bundler resolution and then hands Sass a `loadPaths` entry so the
 * package's internal `@use 'settings'` graph resolves too (`next.config.ts`).
 * This gate mirrors exactly that pair — a file importer for bare specifiers,
 * plus the same `loadPaths` value, both derived from the app's own `require`
 * rather than from a hard-coded monorepo path.
 *
 * This is scoped change-impact validation (`CMD-CHECK-APP-SCSS-*` in
 * `docs/implementation/SCOPED_COMMAND_INDEX.md`). It is deliberately NOT part of
 * any global control: Prettier, ESLint and SonarQube remain the only three
 * (`VALIDATION_GOVERNANCE.md` §1.1).
 *
 * It never writes a file. Compilation happens in memory and the CSS is
 * discarded, so no build artifact can be produced, cached or committed.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The two applications that own a canonical Sass entry point. */
export const SCSS_APPS = {
  storefront: { appDir: 'apps/storefront', entry: 'src/styles/main.scss' },
  admin: { appDir: 'apps/admin', entry: 'src/styles/main.scss' },
};

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

export function usage() {
  return `Usage: node tools/check-app-scss.mjs <${Object.keys(SCSS_APPS).join('|')}>`;
}

/**
 * Compiles one Sass entry point with the app's own toolchain.
 *
 * `resolveFrom` is the directory whose `node_modules` chain supplies `sass` and
 * `@embroidery/styles`. It defaults to the entry's own application, and is
 * separable only so the gate's tests can compile a disposable fixture without
 * copying a package tree or mutating a real stylesheet.
 *
 * Returns `{ cssBytes, deprecations }`. A Sass error propagates unchanged: the
 * caller reports it, because the exception message already names the file, line
 * and column, which is the whole point of the gate.
 */
export async function compileScssEntry({ entryPath, resolveFrom }) {
  // Anchored on `next.config.ts` for symmetry with the app's own config; the
  // path is a resolution base and need not exist.
  const appRequire = createRequire(path.join(resolveFrom, 'next.config.ts'));
  const sass = (await import(pathToFileURL(appRequire.resolve('sass')).href)).default;
  const stylesLoadPath = path.dirname(appRequire.resolve('@embroidery/styles'));

  // Bare-specifier resolution, the half `--load-path` cannot provide. Relative
  // and absolute loads return `null` so Sass falls through to its own relative
  // resolution and then to `loadPaths`, preserving the normal precedence.
  const packageImporter = {
    findFileUrl(url) {
      if (url.startsWith('.') || url.startsWith('/')) return null;
      try {
        return pathToFileURL(appRequire.resolve(url));
      } catch {
        return null;
      }
    },
  };

  let deprecations = 0;
  const result = sass.compile(entryPath, {
    loadPaths: [stylesLoadPath],
    importers: [packageImporter],
    logger: {
      warn() {
        deprecations += 1;
      },
      debug() {},
    },
  });

  return { cssBytes: result.css.length, deprecations };
}

/**
 * Compiles the canonical entry for one named application.
 * Throws `RangeError` for an unknown application name.
 */
export async function checkAppScss(appName, repoRoot = REPO_ROOT) {
  const app = SCSS_APPS[appName];
  if (app === undefined) {
    throw new RangeError(`Unknown app "${appName}".`);
  }
  const appDir = path.join(repoRoot, app.appDir);
  const entryPath = path.join(appDir, app.entry);
  const { cssBytes, deprecations } = await compileScssEntry({ entryPath, resolveFrom: appDir });
  return { app: appName, entry: `${app.appDir}/${app.entry}`, cssBytes, deprecations };
}

async function main() {
  const appName = process.argv[2];
  if (appName === undefined) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = await checkAppScss(appName);
  } catch (error) {
    if (error instanceof RangeError) {
      console.error(`${error.message}\n${usage()}`);
    } else {
      // Sass reports the offending file, line and column in `message`.
      console.error(`SCSS compile FAILED (${appName}):\n${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  // Deprecation warnings are counted, not fatal. This gate proves the app
  // compiles; sweeping historical Sass deprecation debt into whichever
  // checkpoint happens to touch a stylesheet is a different decision, and not
  // one this tool may make on its own.
  console.log(
    `SCSS compile PASS  ${result.entry} (${result.cssBytes} bytes CSS, ` +
      `${result.deprecations} deprecation warning(s), not written to disk).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
