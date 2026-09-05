#!/usr/bin/env node
/**
 * Hard-coded static-text gate (`APP12-V02` §5A.11).
 *
 * `packages/i18n/messages/vi/*.json` is the canonical Vietnamese message
 * repository. This gate is what keeps it canonical: it fails when a human-facing
 * sentence is written back into a `.ts`/`.tsx` file in either application or in
 * a shared frontend package, which is how a repository with one message
 * authority quietly becomes a repository with two.
 *
 * ## It parses; it does not grep
 *
 * §5A.11 forbids a naive text search, and for a good reason: this repository is
 * full of strings that look like copy to a regular expression and are not —
 * route paths, CSS class names, business-state enum values, operation ids,
 * `data-testid`s, MIME types, query keys. Every one of them would be a false
 * positive, and a gate that cries wolf is a gate somebody turns off.
 *
 * So the source is parsed with the TypeScript compiler and only three kinds of
 * node are considered, each chosen because it *is* the rendering path:
 *
 * 1. **JSX text** — anything a component paints directly between tags.
 * 2. **Human-facing JSX attributes** — `aria-label`, `alt`, `title`,
 *    `placeholder` and the rest of the set below. §5A.12 is explicit that an
 *    accessible name is not exempt for being invisible.
 * 3. **Any string or template literal carrying a Vietnamese diacritic**, in any
 *    position. A route path, a class name and an enum value never carry one;
 *    a Vietnamese sentence almost always does.
 *
 * Comments are never inspected — the catalogs document their keys in Vietnamese
 * on purpose, and the whole point of the migration was to keep that prose next
 * to the code it explains.
 *
 * ## The known gap, stated rather than hidden
 *
 * Rule 3 cannot see an unaccented Vietnamese word in a non-JSX position
 * (`const label = 'Xem'`). Detecting that would mean guessing whether an ASCII
 * string is prose, which produces exactly the false positives §5A.11 rules out.
 * Rules 1 and 2 close the rendering paths, which is where such a string would
 * have to surface to be read by anyone.
 *
 * Cross-platform (Windows + Linux): pure Node, no shell, no network. Never
 * modifies files. Non-zero exit on any violation.
 *
 * Usage: node tools/check-i18n-static-text.mjs [rootDir]
 * The optional rootDir argument exists so the checker itself is testable.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The TypeScript compiler is resolved from the workspace rather than imported
 * by bare name. `pnpm` does not hoist it to the repository root, and a tool that
 * only runs when a package happens to have been installed is not a gate.
 */
function loadTypeScript(rootDir) {
  const candidates = [
    () => require('typescript'),
    () => require(join(rootDir, 'node_modules/typescript/lib/typescript.js')),
    () => require(join(rootDir, 'apps/storefront/node_modules/typescript/lib/typescript.js')),
    () => require(join(rootDir, 'apps/admin/node_modules/typescript/lib/typescript.js')),
  ];
  for (const load of candidates) {
    try {
      return load();
    } catch {
      /* try the next location */
    }
  }
  throw new Error(
    'check-i18n-static-text: the TypeScript compiler could not be resolved. Run `pnpm install`.',
  );
}

/** The frontend source trees that render human-facing copy. */
export const SCANNED_ROOTS = [
  'apps/storefront/src',
  'apps/admin/src',
  // `@embroidery/ui` is the only shared package that renders anything a person
  // reads. The others are transport, geometry and persistence.
  'packages/ui/src',
];

/**
 * JSX attributes whose value a person reads or hears.
 *
 * `alt`, `title` and `placeholder` are painted or spoken; the `aria-*` set is
 * spoken only. §5A.12: none of them is exempt for being invisible.
 */
export const HUMAN_FACING_ATTRIBUTES = new Set([
  'alt',
  'title',
  'placeholder',
  'label',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'downloadName',
]);

/**
 * The documented exemptions (§5A.12).
 *
 * Each is a *file* rather than a pattern, so the list is finite and reviewable,
 * and adding to it is a visible decision rather than a widening regex.
 */
export const EXEMPT_FILES = new Set(
  [
    // The message repository's own loader names its namespaces.
    'packages/i18n/src/messages.ts',
  ].map((path) => path.split('/').join(sep)),
);

/**
 * A directory whose contents are never scanned.
 *
 * Tests are excluded because a test's whole job is to assert the exact rendered
 * sentence; forcing it to read the same message repository the component reads
 * would make it assert that a value equals itself.
 */
export const EXEMPT_DIRECTORIES = new Set(['node_modules', '__snapshots__', 'test', 'tests']);

/** The single-line escape hatch, which must carry a reason. */
export const EXEMPT_COMMENT = /\/\/\s*i18n-exempt:\s*\S+/u;

/** Vietnamese-specific letters. Latin-1 accents alone are not enough — `é` occurs in loanwords. */
const VIETNAMESE = /[ăâêôơưđàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu;

/** Text that is punctuation, digits, or whitespace only, and therefore not copy. */
const NOT_PROSE = /^[\s\p{P}\p{S}\p{N}]*$/u;

function listFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (EXEMPT_DIRECTORIES.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      listFiles(path, out);
      continue;
    }
    if (!/\.tsx?$/u.test(name)) continue;
    if (/\.(test|spec)\.tsx?$/u.test(name)) continue;
    out.push(path);
  }
  return out;
}

/** Whether the line the node starts on carries the documented escape hatch. */
function isExemptLine(sourceFile, node, lines) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return EXEMPT_COMMENT.test(lines[line] ?? '');
}

function violation(sourceFile, node, rule, text) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    line: line + 1,
    column: character + 1,
    rule,
    text: text.trim().replace(/\s+/gu, ' ').slice(0, 80),
  };
}

/**
 * Every hard-coded human-facing string in one source file.
 *
 * Exported so the gate's own tests can drive it on a fixture without touching
 * the repository.
 */
export function findStaticText(ts, filePath, source) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true);
  const lines = source.split(/\r?\n/u);
  const found = [];

  const literalText = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      return node.head.text + node.templateSpans.map((span) => span.literal.text).join('');
    }
    return null;
  };

  const visit = (node) => {
    // 1. JSX text a component paints directly.
    if (ts.isJsxText(node) && !NOT_PROSE.test(node.text)) {
      if (!isExemptLine(sourceFile, node, lines)) {
        found.push(violation(sourceFile, node, 'jsx-text', node.text));
      }
    }

    // 2. A human-facing attribute given a literal instead of a message.
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const attribute = node.name.text;
      const initializer = node.initializer;
      const value =
        initializer === undefined
          ? null
          : ts.isJsxExpression(initializer) && initializer.expression !== undefined
            ? literalText(initializer.expression)
            : literalText(initializer);
      if (
        HUMAN_FACING_ATTRIBUTES.has(attribute) &&
        value !== null &&
        !NOT_PROSE.test(value) &&
        !isExemptLine(sourceFile, node, lines)
      ) {
        found.push(violation(sourceFile, node, `jsx-attribute:${attribute}`, value));
      }
    }

    // 3. A Vietnamese sentence anywhere at all.
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateExpression(node)) &&
      !ts.isJsxAttribute(node.parent)
    ) {
      const value = literalText(node);
      if (value !== null && VIETNAMESE.test(value) && !isExemptLine(sourceFile, node, lines)) {
        found.push(violation(sourceFile, node, 'vietnamese-literal', value));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

export function run(rootDir = process.cwd()) {
  const ts = loadTypeScript(rootDir);
  const failures = [];

  for (const root of SCANNED_ROOTS) {
    const absolute = join(rootDir, root.split('/').join(sep));
    if (!existsSync(absolute)) continue;
    for (const file of listFiles(absolute)) {
      const relativePath = relative(rootDir, file);
      if (EXEMPT_FILES.has(relativePath)) continue;
      const found = findStaticText(ts, file, readFileSync(file, 'utf8'));
      for (const item of found) failures.push({ file: relativePath, ...item });
    }
  }

  return failures;
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const failures = run(rootDir);

  if (failures.length === 0) {
    console.log('check-i18n-static-text: OK — no hard-coded human-facing text.');
    return 0;
  }

  console.error(
    `check-i18n-static-text: ${failures.length} hard-coded human-facing string(s).\n` +
      'Move the sentence into packages/i18n/messages/vi/*.json and read it through\n' +
      "the feature's message view, or mark the line `// i18n-exempt: <reason>` when\n" +
      'it is genuinely a technical value (APP12-V02 §5A.12).\n',
  );
  for (const failure of failures) {
    console.error(
      `  ${failure.file}:${failure.line}:${failure.column}  [${failure.rule}]  ${failure.text}`,
    );
  }
  return 1;
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('check-i18n-static-text.mjs')
) {
  process.exit(main());
}
