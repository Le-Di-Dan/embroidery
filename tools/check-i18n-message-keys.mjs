#!/usr/bin/env node
/**
 * Message-key integrity gate (`APP12-V02` §5A.13).
 *
 * The static-text gate proves no sentence is written in a component. This one
 * proves the other half: that every key a component *reads* actually exists in
 * the canonical Vietnamese message repository, and that the repository is not
 * accumulating sentences nothing renders.
 *
 * Both failures are silent without it. A renamed key degrades to the key string
 * in a production browser — a page that looks finished and says
 * `orders.orderAccess.qr.hint` where a sentence belongs. An orphaned key is
 * worse in a different way: a Product Owner edits it, nothing changes, and the
 * repository stops being trusted.
 *
 * ## How a key is found
 *
 * Every read goes through a bound view — `const xMessage = messageView(
 * VI_MESSAGES.<namespace>, '<prefix>')` — and then `xMessage.text('a.b')`. So
 * the checker resolves each view's namespace and prefix from its declaration
 * and joins them to the literal in each call. A call whose argument is not a
 * literal is reported as unresolvable rather than skipped: a computed key is
 * exactly the thing this gate cannot verify, and it must be visible.
 *
 * Cross-platform (Windows + Linux): pure Node, no shell, no network. Never
 * modifies files. Non-zero exit on any violation.
 *
 * Usage: node tools/check-i18n-message-keys.mjs [rootDir]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';

export const MESSAGES_DIR = 'packages/i18n/messages/vi';

export const SCANNED_ROOTS = ['apps/storefront/src', 'apps/admin/src', 'packages/ui/src'];

const EXEMPT_DIRECTORIES = new Set(['node_modules', '__snapshots__']);

/**
 * Namespaces exempt from the orphan check.
 *
 * Empty, and meant to stay that way. It exists as a declared decision rather
 * than an absence: the moment a namespace is added here, the repository has
 * copy nobody renders, and that has to be an argued exception rather than
 * something the checker quietly tolerates.
 */
export const ORPHAN_EXEMPT_NAMESPACES = new Set([]);

function listSourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (EXEMPT_DIRECTORIES.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      listSourceFiles(path, out);
      continue;
    }
    if (/\.tsx?$/u.test(name) && !/\.(test|spec)\.tsx?$/u.test(name)) out.push(path);
  }
  return out;
}

/** Namespace file name (`admin-orders`) from the export identifier (`adminOrders`). */
function namespaceFile(exportName) {
  return exportName.replace(/([A-Z])/gu, (_m, c) => `-${c.toLowerCase()}`);
}

/** Every leaf key path in a message tree, dotted. */
export function flattenKeys(node, trail = [], out = []) {
  if (typeof node === 'string') {
    out.push(trail.join('.'));
    return out;
  }
  if (Array.isArray(node)) {
    // A list is addressed as a whole by `list()`, and per index by `text()`.
    out.push(trail.join('.'));
    node.forEach((item, index) => flattenKeys(item, [...trail, String(index)], out));
    return out;
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) flattenKeys(value, [...trail, key], out);
  }
  return out;
}

export function loadRepository(rootDir) {
  const dir = join(rootDir, MESSAGES_DIR.split('/').join(sep));
  const namespaces = new Map();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const raw = readFileSync(join(dir, name), 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${MESSAGES_DIR}/${name} is not valid JSON: ${error.message}`);
    }
    namespaces.set(name.replace(/\.json$/u, ''), parsed);
  }
  return namespaces;
}

/**
 * The views declared in one file, and the keys each one reads.
 *
 * Deliberately regex-based rather than AST-based, and that is a real trade-off
 * worth stating: the shape being matched is a two-line convention this codebase
 * generates mechanically, so a parser would buy precision the input does not
 * need. The unresolved-call check below is what keeps the simplification
 * honest — anything that does not match the convention is reported, not
 * ignored.
 */
export function readsOf(source) {
  const views = new Map();
  const viewPattern =
    /const\s+(\w+)\s*=\s*messageView\(\s*(?:hydrateMessages\(\s*)?VI_MESSAGES\.(\w+)[^)]*?\)?\s*(?:,\s*'([^']*)')?\s*,?\s*\)/gu;
  for (const match of source.matchAll(viewPattern)) {
    views.set(match[1], { namespace: namespaceFile(match[2]), prefix: match[3] ?? '' });
  }

  const reads = [];
  const unresolved = [];
  const callPattern = /(\w+)\.(text|list|group|scope)\(\s*([^)]*?)\s*(?:,|\))/gu;
  for (const match of source.matchAll(callPattern)) {
    const [, ident, , argument] = match;
    const view = views.get(ident);
    if (view === undefined) continue;
    const literal = argument.match(/^'([^']*)'/u);
    if (literal === null) {
      unresolved.push({ ident, argument: argument.slice(0, 40) });
      continue;
    }
    const key = view.prefix === '' ? literal[1] : `${view.prefix}.${literal[1]}`;
    reads.push({ namespace: view.namespace, key });
  }
  return { views, reads, unresolved };
}

export function run(rootDir = process.cwd()) {
  const failures = [];
  const repository = loadRepository(rootDir);

  const available = new Map();
  for (const [namespace, tree] of repository) {
    available.set(namespace, new Set(flattenKeys(tree)));
  }

  const referenced = new Map();
  for (const namespace of repository.keys()) referenced.set(namespace, new Set());

  for (const root of SCANNED_ROOTS) {
    const absolute = join(rootDir, root.split('/').join(sep));
    if (!existsSync(absolute)) continue;
    for (const file of listSourceFiles(absolute)) {
      const relativePath = relative(rootDir, file);
      const { reads, unresolved } = readsOf(readFileSync(file, 'utf8'));
      for (const { namespace, key } of reads) {
        const keys = available.get(namespace);
        if (keys === undefined) {
          failures.push({ kind: 'unknown-namespace', file: relativePath, detail: namespace });
          continue;
        }
        if (!keys.has(key)) {
          failures.push({ kind: 'missing-key', file: relativePath, detail: `${namespace}.${key}` });
          continue;
        }
        referenced.get(namespace).add(key);
      }
      for (const item of unresolved) {
        failures.push({
          kind: 'computed-key',
          file: relativePath,
          detail: `${item.ident}(${item.argument})`,
        });
      }
    }
  }

  // Orphans: a sentence in the repository that nothing reads. A parent key is
  // considered read when any descendant is, because a catalog is often taken
  // whole through `group()`.
  for (const [namespace, keys] of available) {
    if (ORPHAN_EXEMPT_NAMESPACES.has(namespace)) continue;
    const read = referenced.get(namespace);
    for (const key of keys) {
      const covered = [...read].some(
        (candidate) =>
          candidate === key || candidate.startsWith(`${key}.`) || key.startsWith(`${candidate}.`),
      );
      if (!covered) {
        failures.push({
          kind: 'orphan-key',
          file: `${MESSAGES_DIR}/${namespace}.json`,
          detail: key,
        });
      }
    }
  }

  return failures;
}

function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  let failures;
  try {
    failures = run(rootDir);
  } catch (error) {
    console.error(`check-i18n-message-keys: ${error.message}`);
    return 1;
  }

  if (failures.length === 0) {
    console.log('check-i18n-message-keys: OK — every referenced key exists and every key is read.');
    return 0;
  }

  const byKind = new Map();
  for (const failure of failures) {
    if (!byKind.has(failure.kind)) byKind.set(failure.kind, []);
    byKind.get(failure.kind).push(failure);
  }

  console.error(`check-i18n-message-keys: ${failures.length} problem(s).\n`);
  for (const [kind, items] of byKind) {
    console.error(`  ${kind} (${items.length}):`);
    for (const item of items) console.error(`    ${item.file}  ${item.detail}`);
    console.error('');
  }
  return 1;
}

if (process.argv[1]?.endsWith('check-i18n-message-keys.mjs')) {
  process.exit(main());
}
