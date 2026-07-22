#!/usr/bin/env node
/**
 * Styling-boundary gate (APP0-S01B, CLAUDE.md §5, FRONTEND_CONVENTIONS §13,
 * docs/implementation/05-FRONTEND-AND-SCSS-STANDARD.md).
 *
 * Enforces the locked SCSS-only styling system across the frontend apps:
 * one `main.scss` per app at the canonical path, imported exactly once from
 * the root layout; no CSS Modules, Tailwind, CSS-in-JS, `@import`, app-local
 * token duplication, deep imports into the shared package internals, or inline
 * React `style` props.
 *
 * Cross-platform (Windows + Linux): pure Node, no shell. Non-zero exit on any
 * violation. Never modifies files.
 *
 * Usage: node tools/check-styling-boundaries.mjs [rootDir]
 * The optional rootDir argument exists so the checker itself is testable.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import process from 'node:process';

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  'dist',
  'out',
  'coverage',
  '.turbo',
  '__snapshots__',
]);

const STYLE_EXTENSIONS = ['.scss', '.sass', '.css'];
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

// Canonical single global entry, relative to an app root.
const CANONICAL_MAIN_ENTRY = 'src/styles/main.scss';

// Banned CSS-in-JS module families (prefix match for scoped packages).
const BANNED_CSS_IN_JS = ['styled-components', '@emotion', '@stitches', 'stitches', 'styled-jsx'];

// An app must reach the shared foundation only through its public package name
// (`@use "@embroidery/styles"`), and — where the Turbopack Sass loader needs a
// load path — resolve it from that package name (e.g.
// `require.resolve("@embroidery/styles")`), never a hard-coded monorepo-relative
// or machine-absolute path into the package source. These substrings mark a
// direct reference to the package's internal source: a deep module specifier
// (`@embroidery/styles/src/**`) or a filesystem path into `packages/styles/src`
// (covers `../../packages/styles/src`, an absolute path, and back-slashed
// Windows forms once normalized). A package-name-resolved load path contains
// neither substring, so it is allowed.
// Each pattern tolerates any separator run — `/`, `\`, or escaped `\\` — so
// POSIX, Windows-absolute, and TS-escaped Windows paths all match. Matching on
// the original content keeps the reported line accurate.
const INTERNAL_STYLE_PATHS = [
  { needle: '@embroidery/styles/src', re: /@embroidery[/\\]+styles[/\\]+src/ },
  { needle: 'packages/styles/src', re: /packages[/\\]+styles[/\\]+src/ },
];

// First forbidden internal-source reference in `content`, or null.
function findInternalStylePath(content) {
  for (const { needle, re } of INTERNAL_STYLE_PATHS) {
    const match = re.exec(content);
    if (match) {
      return { needle, index: match.index };
    }
  }
  return null;
}

// App root config files that could smuggle in an internal-source path.
const APP_CONFIG_FILES = [
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'next.config.cjs',
  'package.json',
];

// App-local re-declaration of a foundation token is forbidden; apps consume
// tokens through `@use "@embroidery/styles"`. Matches a Sass variable
// *declaration* (`$color-...:`), not a namespaced usage (`styles.$color-...`).
const TOKEN_DECLARATION = /^\s*\$(color|font|spacing|radius|motion|layout|size)[\w-]*\s*:/;

// JSX inline style attribute: `style={` or `style="`. The leading guard avoids
// object properties (`style:`) and member access (`node.style`). Heuristic
// (no full AST): see LIMITATIONS below.
const INLINE_STYLE = /(^|[^.\w])style\s*=\s*[{"']/;

const RULES = {
  cssModule: 'no-css-modules',
  tailwind: 'no-tailwind',
  cssInJs: 'no-css-in-js',
  sassImport: 'no-sass-import',
  mainCount: 'single-main-scss',
  mainPath: 'canonical-main-path',
  globalImport: 'global-style-import-in-root-layout-only',
  internalImport: 'no-shared-package-internal-import',
  tokenDup: 'no-app-local-token-duplication',
  inlineStyle: 'no-inline-style-prop',
};

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) {
        yield* walk(join(dir, entry.name));
      }
    } else if (entry.isFile()) {
      yield join(dir, entry.name);
    }
  }
}

function hasExtension(file, extensions) {
  return extensions.some((extension) => file.endsWith(extension));
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function toPosix(rootDir, filePath) {
  return relative(rootDir, filePath).split(sep).join('/');
}

/**
 * Scans the repository frontend apps and returns { violations, appsChecked,
 * filesScanned }. Each violation is { rule, path, line, message }.
 */
export function checkStylingBoundaries(rootDir) {
  const violations = [];
  const add = (rule, path, line, message) => violations.push({ rule, path, line, message });

  const appsDir = join(rootDir, 'apps');
  let appNames = [];
  try {
    appNames = readdirSync(appsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return { violations, appsChecked: 0, filesScanned: 0 };
  }

  let filesScanned = 0;
  let appsChecked = 0;

  for (const appName of appNames) {
    const appRoot = join(appsDir, appName);
    const srcDir = join(appRoot, 'src');
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
      continue;
    }
    appsChecked += 1;

    // A "frontend app" (subject to the single-entry rules) has a Next config.
    const isFrontendApp = ['ts', 'js', 'mjs', 'cjs'].some((ext) =>
      existsSync(join(appRoot, `next.config.${ext}`)),
    );

    const mainEntries = [];
    const styleImports = [];

    for (const filePath of walk(srcDir)) {
      const rel = toPosix(rootDir, filePath);

      // CSS Modules (rules 1-3).
      if (/\.module\.(css|scss|sass)$/.test(filePath)) {
        add(RULES.cssModule, rel, 1, 'CSS Modules are prohibited; use the shared SCSS system.');
      }

      if (hasExtension(filePath, STYLE_EXTENSIONS)) {
        filesScanned += 1;
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        if (basename(filePath) === 'main.scss') {
          mainEntries.push(rel);
          if (rel !== `apps/${appName}/${CANONICAL_MAIN_ENTRY}`) {
            add(
              RULES.mainPath,
              rel,
              1,
              `main.scss must live at apps/${appName}/${CANONICAL_MAIN_ENTRY}.`,
            );
          }
        }

        lines.forEach((text, i) => {
          if (/^\s*@import\b/.test(text)) {
            add(RULES.sassImport, rel, i + 1, 'Sass @import is prohibited; use @use/@forward.');
          }
          if (/^\s*@tailwind\b/.test(text)) {
            add(RULES.tailwind, rel, i + 1, 'Tailwind directive is prohibited.');
          }
          if (TOKEN_DECLARATION.test(text)) {
            add(
              RULES.tokenDup,
              rel,
              i + 1,
              'App-local token declaration duplicates the shared foundation; consume @embroidery/styles instead.',
            );
          }
        });

        const styleInternal = findInternalStylePath(content);
        if (styleInternal) {
          add(
            RULES.internalImport,
            rel,
            lineOf(content, styleInternal.index),
            'Import the package entry @embroidery/styles, not its src/** internals.',
          );
        }
        continue;
      }

      if (hasExtension(filePath, CODE_EXTENSIONS)) {
        filesScanned += 1;
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((text, i) => {
          // Side-effect or default import of a stylesheet.
          const styleImport = text.match(
            /import\s+(?:[\w*{},\s]+from\s+)?['"]([^'"]+\.(?:css|scss|sass))['"]/,
          );
          if (styleImport) {
            styleImports.push({ rel, line: i + 1, target: styleImport[1] });
          }
          if (findInternalStylePath(text)) {
            add(
              RULES.internalImport,
              rel,
              i + 1,
              'Import the package entry @embroidery/styles, not its src/** internals.',
            );
          }
          if (/\.(tsx|jsx)$/.test(filePath) && INLINE_STYLE.test(text)) {
            add(
              RULES.inlineStyle,
              rel,
              i + 1,
              'Inline React style prop is prohibited; use SCSS classes.',
            );
          }
        });
      }
    }

    // App package.json dependency families (Tailwind / CSS-in-JS).
    const manifestPath = join(appRoot, 'package.json');
    if (existsSync(manifestPath)) {
      const rel = toPosix(rootDir, manifestPath);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const deps = { ...manifest.dependencies, ...manifest.devDependencies };
      for (const name of Object.keys(deps)) {
        if (name === 'tailwindcss') {
          add(RULES.tailwind, rel, 1, 'tailwindcss dependency is prohibited.');
        }
        if (BANNED_CSS_IN_JS.some((banned) => name === banned || name.startsWith(`${banned}/`))) {
          add(RULES.cssInJs, rel, 1, `CSS-in-JS dependency "${name}" is prohibited.`);
        }
      }
    }

    // Tailwind config presence.
    for (const ext of ['js', 'ts', 'cjs', 'mjs']) {
      const configPath = join(appRoot, `tailwind.config.${ext}`);
      if (existsSync(configPath)) {
        add(RULES.tailwind, toPosix(rootDir, configPath), 1, 'Tailwind config is prohibited.');
      }
    }

    // App root config must reach the shared styles package only by its public
    // name. A Sass `loadPaths` hard-coded to packages/styles/src (relative or
    // absolute), or a deep @embroidery/styles/src specifier, couples the app to
    // package internals; a package-name-resolved load path does not.
    for (const candidate of APP_CONFIG_FILES) {
      const configPath = join(appRoot, candidate);
      if (!existsSync(configPath)) {
        continue;
      }
      const configContent = readFileSync(configPath, 'utf8');
      const configInternal = findInternalStylePath(configContent);
      if (configInternal) {
        add(
          RULES.internalImport,
          toPosix(rootDir, configPath),
          lineOf(configContent, configInternal.index),
          'Resolve the shared styles load path from the @embroidery/styles package name, not a hard-coded packages/styles/src path.',
        );
      }
    }

    if (!isFrontendApp) {
      continue;
    }

    // Exactly one main.scss per frontend app (rule 7).
    if (mainEntries.length > 1) {
      add(
        RULES.mainCount,
        mainEntries[1],
        1,
        `Only one main.scss is allowed per app; found ${mainEntries.length}.`,
      );
    } else if (mainEntries.length === 0) {
      add(
        RULES.mainCount,
        `apps/${appName}/${CANONICAL_MAIN_ENTRY}`,
        1,
        'Missing the app global Sass entry.',
      );
    }

    // Exactly one global style import, from the root layout, targeting main.scss.
    const layoutRel = `apps/${appName}/src/app/layout.tsx`;
    if (styleImports.length === 0) {
      add(
        RULES.globalImport,
        layoutRel,
        1,
        'Root layout must import the app main.scss exactly once.',
      );
    }
    for (const imported of styleImports) {
      if (imported.rel !== layoutRel) {
        add(
          RULES.globalImport,
          imported.rel,
          imported.line,
          'Global styles may only be imported from the root App Router layout.',
        );
      } else if (basename(imported.target) !== 'main.scss') {
        add(RULES.globalImport, imported.rel, imported.line, 'Root layout must import main.scss.');
      }
    }
    if (styleImports.filter((i) => i.rel === layoutRel).length > 1) {
      add(RULES.globalImport, layoutRel, 1, 'Root layout must import global styles exactly once.');
    }
  }

  return { violations, appsChecked, filesScanned };
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const { violations, appsChecked, filesScanned } = checkStylingBoundaries(rootDir);

  if (violations.length > 0) {
    console.error('Styling-boundary check FAILED:');
    for (const v of violations) {
      console.error(`  ${v.path}:${v.line}  [${v.rule}]  ${v.message}`);
    }
    console.error(
      `\n${violations.length} violation(s). See docs/implementation/05-FRONTEND-AND-SCSS-STANDARD.md.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Styling-boundary check passed (${appsChecked} app(s), ${filesScanned} style/source file(s); ` +
      `rules: css-modules, tailwind, css-in-js, sass-import, single-main, canonical-path, ` +
      `root-layout-import, internal-import, token-duplication, inline-style).`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join('/'))) {
  main();
}
