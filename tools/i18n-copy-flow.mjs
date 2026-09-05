/**
 * Where a string literal *ends up*, rather than what it looks like.
 *
 * `tools/check-i18n-static-text.mjs` closes three doors: JSX text, human-facing
 * JSX attributes, and any literal carrying a Vietnamese diacritic. `APP12-V02`
 * stated the gap those leave and `APP12-V02-C1` §3 is the Product Owner
 * rejecting it — an ASCII sentence parked in a constant walks straight through:
 *
 * ```ts
 * const LABEL = 'Order';
 * return <button>{LABEL}</button>;
 * ```
 *
 * `'Order'` is not a JSX text node, carries no diacritic, and is read by every
 * operator who opens the screen.
 *
 * ## Why not simply ban ASCII string literals
 *
 * Because this repository is mostly technical strings. Route paths, import
 * specifiers, CSS class names, `data-testid`s, business-state enum values, HTTP
 * methods, MIME types, operation ids, query keys, log event names and message
 * keys are all ASCII string literals, and a gate that reported them would be
 * switched off within a day. §3 forbids that solution by name.
 *
 * ## What this module does instead
 *
 * It classifies by **AST context, not by content**. It starts at the positions
 * where a value is actually read by a person — a JSX child expression and a
 * human-facing JSX attribute — and walks *backwards* to the literal that
 * reaches them: through local constants, destructuring, object and array
 * literals, conditionals, string concatenation, and imports from other files in
 * the scanned roots.
 *
 * A route path is never reported, because a route path is never rendered as a
 * sentence. Nothing about the string itself is inspected; only where it goes.
 *
 * The walk stops at a call expression, and that stop is the important one:
 * every legitimate sentence in this repository arrives as
 * `someMessage.text('a.b')`, and a call has no literal behind it to report.
 *
 * ## Limits, stated rather than hidden
 *
 * Resolution is syntactic and bounded. It does not follow a value through a
 * function body, through `.map()`, through a reassigned `let`, or into a package
 * outside the scanned roots. Those resolve to "unknown" and are skipped rather
 * than guessed at, which is the trade §3 asks for: no false positives on
 * technical strings, at the cost of a copy string laundered through a helper.
 * The three original rules still stand behind this one, and rule 3 in particular
 * catches any Vietnamese sentence however it is laundered.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath, sep } from 'node:path';

/** How far a value may be chased before the walk gives up. Cycles are tracked too. */
const MAX_DEPTH = 12;

/** Candidate suffixes for a relative module specifier. */
const MODULE_SUFFIXES = ['.ts', '.tsx', `${sep}index.ts`, `${sep}index.tsx`];

/**
 * One parsed file.
 *
 * Parsed lazily: most files are never a resolution target, and parsing both
 * applications a second time would double the gate's runtime for nothing.
 */
function parseModule(ts, filePath) {
  const source = readFileSync(filePath, 'utf8');
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true);
}

/**
 * The index of every file the walk may enter.
 *
 * Only files inside the scanned roots are indexed. An import of `next`, of
 * `@embroidery/i18n` or of anything else outside them resolves to nothing and
 * the walk stops — correctly, because this gate does not police code it is not
 * responsible for.
 */
export function createModuleIndex(ts, files) {
  const known = new Set(files.map((file) => resolvePath(file)));
  const parsed = new Map();
  return {
    has: (filePath) => known.has(resolvePath(filePath)),
    /**
     * Hand the index a file that is already parsed.
     *
     * The gate parses the file it is checking before rule 4 runs, and a test
     * drives the gate on a source string that has no file on disk at all.
     * Without this the walk would re-read from the filesystem — twice the work
     * in the first case and impossible in the second.
     */
    prime(filePath, sourceFile) {
      const key = resolvePath(filePath);
      known.add(key);
      parsed.set(key, sourceFile);
    },
    get(filePath) {
      const key = resolvePath(filePath);
      if (!known.has(key)) return null;
      if (!parsed.has(key)) parsed.set(key, parseModule(ts, key));
      return parsed.get(key);
    },
  };
}

/** A relative specifier resolved to a file this gate indexes. */
function resolveSpecifier(index, fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = join(dirname(fromFile), specifier.split('/').join(sep));
  for (const suffix of ['', ...MODULE_SUFFIXES]) {
    const candidate = `${base}${suffix}`;
    if (index.has(candidate) && existsSync(candidate)) return resolvePath(candidate);
  }
  return null;
}

/** `x as const`, `(x)`, `x satisfies T`, `x!` — none of them change the value. */
function unwrap(ts, node) {
  let current = node;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      (ts.isSatisfiesExpression !== undefined && ts.isSatisfiesExpression(current))
    ) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

/**
 * The declaration of `name` as seen from `file`.
 *
 * Three shapes come back, because three are enough for how this repository
 * writes copy: a value (`const X = …`), a property of an object being
 * destructured (`const { brand } = COPY`), and a hop into another module.
 */
function findBinding(ts, index, file, name) {
  const sourceFile = index.get(file);
  if (sourceFile === null) return null;
  let found = null;

  const visit = (node) => {
    if (found !== null) return;

    // `import { X } from './y'` — hop to the other file's export.
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (element.name.text !== name) continue;
          const target = resolveSpecifier(index, file, node.moduleSpecifier.text);
          if (target !== null) {
            found = {
              kind: 'import',
              file: target,
              name: (element.propertyName ?? element.name).text,
            };
          }
        }
      }
      return;
    }

    // `export { X } from './y'` — the same hop, seen from the other side.
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause !== undefined &&
      ts.isNamedExports(node.exportClause) &&
      node.moduleSpecifier !== undefined
    ) {
      for (const element of node.exportClause.elements) {
        if (element.name.text !== name) continue;
        const target = resolveSpecifier(index, file, node.moduleSpecifier.text);
        if (target !== null) {
          found = {
            kind: 'import',
            file: target,
            name: (element.propertyName ?? element.name).text,
          };
        }
      }
      return;
    }

    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      if (ts.isIdentifier(node.name) && node.name.text === name) {
        found = { kind: 'value', file, node: node.initializer };
        return;
      }
      if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name) || element.name.text !== name) continue;
          const property = element.propertyName;
          const key =
            property === undefined
              ? name
              : ts.isIdentifier(property) || ts.isStringLiteral(property)
                ? property.text
                : null;
          if (key !== null) found = { kind: 'property', file, node: node.initializer, key };
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

/** The initializer of property `key` on an object-literal node. */
function propertyOf(ts, node, key) {
  if (!ts.isObjectLiteralExpression(node)) return null;
  for (const property of node.properties) {
    const name = property.name;
    if (name === undefined) continue;
    const text = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
    if (text !== key) continue;
    if (ts.isPropertyAssignment(property)) return property.initializer;
    if (ts.isShorthandPropertyAssignment(property)) return property.name;
  }
  return null;
}

/** Follow identifiers and property access until an object literal is reached. */
function resolveObject(ts, index, file, expression, depth, seen) {
  if (depth > MAX_DEPTH) return null;
  const node = unwrap(ts, expression);
  if (ts.isObjectLiteralExpression(node)) return { file, node };

  if (ts.isIdentifier(node)) {
    const binding = findBinding(ts, index, file, node.text);
    if (binding === null) return null;
    if (binding.kind === 'import') {
      const target = findBinding(ts, index, binding.file, binding.name);
      if (target === null || target.kind === 'import') return null;
      return target.kind === 'property'
        ? propertyObject(ts, index, target.file, target.node, target.key, depth + 1, seen)
        : resolveObject(ts, index, target.file, target.node, depth + 1, seen);
    }
    if (binding.kind === 'property') {
      return propertyObject(ts, index, binding.file, binding.node, binding.key, depth + 1, seen);
    }
    return resolveObject(ts, index, binding.file, binding.node, depth + 1, seen);
  }

  if (ts.isPropertyAccessExpression(node)) {
    return propertyObject(ts, index, file, node.expression, node.name.text, depth + 1, seen);
  }
  return null;
}

function propertyObject(ts, index, file, objectExpression, key, depth, seen) {
  const target = resolveObject(ts, index, file, objectExpression, depth, seen);
  if (target === null) return null;
  const initializer = propertyOf(ts, target.node, key);
  if (initializer === null) return null;
  return resolveObject(ts, index, target.file, initializer, depth + 1, seen);
}

/** The literals behind one property of an object expression. */
function propertyLiterals(ts, index, file, objectExpression, key, depth, seen) {
  const target = resolveObject(ts, index, file, objectExpression, depth, seen);
  if (target === null) return [];
  const initializer = propertyOf(ts, target.node, key);
  if (initializer === null) return [];
  return literalsReaching(ts, index, target.file, initializer, depth + 1, seen);
}

/**
 * Every string literal that can reach `expression`, with the file it lives in.
 *
 * Returns `[]` for anything the walk cannot follow — a call, a parameter, a
 * value from outside the scanned roots. Silence here means "not proven to be
 * copy", never "proven safe".
 */
export function literalsReaching(ts, index, file, expression, depth = 0, seen = new Set()) {
  if (depth > MAX_DEPTH) return [];
  const node = unwrap(ts, expression);
  const fingerprint = `${file}:${String(node.pos)}:${String(node.end)}`;
  if (seen.has(fingerprint)) return [];
  seen.add(fingerprint);

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ file, node, text: node.text }];
  }
  if (ts.isTemplateExpression(node)) {
    const text = node.head.text + node.templateSpans.map((span) => span.literal.text).join('');
    return [{ file, node, text }];
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...literalsReaching(ts, index, file, node.whenTrue, depth + 1, seen),
      ...literalsReaching(ts, index, file, node.whenFalse, depth + 1, seen),
    ];
  }
  // `a + b` and `a ?? b` — either half can be the sentence someone reads.
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator !== ts.SyntaxKind.PlusToken && operator !== ts.SyntaxKind.QuestionQuestionToken) {
      return [];
    }
    return [
      ...literalsReaching(ts, index, file, node.left, depth + 1, seen),
      ...literalsReaching(ts, index, file, node.right, depth + 1, seen),
    ];
  }
  if (ts.isIdentifier(node)) {
    const binding = findBinding(ts, index, file, node.text);
    if (binding === null) return [];
    if (binding.kind === 'import') {
      const target = findBinding(ts, index, binding.file, binding.name);
      if (target === null || target.kind === 'import') return [];
      return target.kind === 'property'
        ? propertyLiterals(ts, index, target.file, target.node, target.key, depth + 1, seen)
        : literalsReaching(ts, index, target.file, target.node, depth + 1, seen);
    }
    if (binding.kind === 'property') {
      return propertyLiterals(ts, index, binding.file, binding.node, binding.key, depth + 1, seen);
    }
    return literalsReaching(ts, index, binding.file, binding.node, depth + 1, seen);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return propertyLiterals(ts, index, file, node.expression, node.name.text, depth, seen);
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    return propertyLiterals(
      ts,
      index,
      file,
      node.expression,
      node.argumentExpression.text,
      depth,
      seen,
    );
  }
  return [];
}

/**
 * The two positions a person actually reads a value from.
 *
 * Everything rule 4 reports starts here, and it is what keeps the rule from
 * becoming a ban on string literals: a value that never reaches one of these
 * two places is never looked at, whatever it contains.
 *
 * The human-facing attribute set is passed in rather than imported, so the
 * checker stays the single place that decides which attributes a person reads.
 */
export function renderedExpressions(ts, node, humanFacingAttributes) {
  // A JSX expression container that is a *child* — not an attribute value and
  // not a spread. This is the `{LABEL}` in `<button>{LABEL}</button>`.
  if (
    ts.isJsxExpression(node) &&
    node.expression !== undefined &&
    node.parent !== undefined &&
    (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
  ) {
    return [{ node, expression: node.expression, rule: 'jsx-child-copy' }];
  }

  // `aria-label={X}` and the rest of the human-facing attribute set.
  if (
    ts.isJsxAttribute(node) &&
    ts.isIdentifier(node.name) &&
    humanFacingAttributes.has(node.name.text) &&
    node.initializer !== undefined &&
    ts.isJsxExpression(node.initializer) &&
    node.initializer.expression !== undefined
  ) {
    const rule = `jsx-attribute-copy:${node.name.text}`;
    return [{ node, expression: node.initializer.expression, rule }];
  }
  return [];
}
