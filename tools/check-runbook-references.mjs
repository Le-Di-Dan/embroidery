#!/usr/bin/env node
/**
 * `APP12-H07` — operational runbook reference integrity.
 *
 * A runbook is only worth following if every command it names exists, every
 * path it cites is real, and every cross-reference resolves. Those three things
 * rot silently: a tool is renamed, a script is moved, a section is retitled, and
 * the runbook still reads perfectly while sending an operator to a command that
 * is not there — in the middle of an incident, which is the worst possible
 * moment to discover it.
 *
 * So this is a documentation-integrity gate, in the same family as
 * `check-figma-design-index.mjs`. It is **not** a recovery command and executes
 * nothing operational: every check is a lookup against the repository tree.
 *
 * Four checks:
 *
 *   1. ALERT     every `runbook:` id in the Wave-1 Prometheus rules resolves to
 *                an entry in the operations index. An alert whose runbook id
 *                names nothing is an alert with no procedure.
 *   2. LINK      every relative link between operations documents resolves to a
 *                file, and to a heading in it when an anchor is given.
 *   3. PATH      every repository path cited in backticks exists on disk.
 *   4. COMMAND   every `node tools/…` and `pnpm <script>` named by a runbook
 *                exists as a file, or as a script in the owning package.
 *
 * Usage:  node tools/check-runbook-references.mjs
 * Exit:   0 pass · 1 findings · 2 usage/IO error
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const REPO_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OPERATIONS_DIR = join(REPO_ROOT, 'docs', 'operations');
const INDEX_FILE = join(OPERATIONS_DIR, 'README.md');
const ALERT_RULES = join(
  REPO_ROOT,
  'infrastructure',
  'monitoring',
  'prometheus',
  'rules',
  'wave1-commerce.rules.yml',
);

/** Top-level directories a backticked token must start with to be a repo path. */
const PATH_ROOTS = ['apps/', 'packages/', 'infrastructure/', 'tools/', 'docs/'];

/**
 * A cited path may name a glob or an angle-bracket placeholder; neither is a
 * file. Anything carrying one of these is documentation, not a claim about the
 * tree, and is skipped rather than reported.
 */
const NOT_A_CONCRETE_PATH = /[*<>{}|\s]|\.\.\./;

/** GitHub's heading-slug rules, as far as these documents exercise them. */
export function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/** Every heading slug a markdown document publishes. */
export function headingSlugs(markdown) {
  const slugs = new Set();
  for (const line of markdown.split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line);
    if (match) slugs.add(slugify(match[1]));
  }
  return slugs;
}

/** Fenced code blocks are examples, not citations; strip them before scanning. */
export function stripFencedBlocks(markdown) {
  return markdown.replace(/^```[\s\S]*?^```/gm, '');
}

/** `runbook: RUNBOOK-…` ids carried by the alert rules. */
export function alertRunbookIds(rulesYaml) {
  const ids = new Set();
  for (const match of rulesYaml.matchAll(/^\s*runbook:\s*([A-Z0-9-]+)\s*$/gm)) {
    ids.add(match[1]);
  }
  return ids;
}

/** Relative markdown links, with their optional anchors. */
export function markdownLinks(markdown) {
  const links = [];
  /* The target must exclude `#` so a same-document link — `](#some-heading)`,
     which is ordinary markdown — parses as an empty target plus an anchor
     rather than as a file literally named `#some-heading`. An empty target
     means "this document", resolved by the caller. */
  for (const match of markdown.matchAll(/\]\(([^)#\s]*)(?:#([^)\s]+))?\)/g)) {
    const [, target, anchor] = match;
    if (/^[a-z]+:/i.test(target)) continue;
    links.push({ target, anchor: anchor ?? undefined });
  }
  return links;
}

/** Backticked tokens that claim to be repository paths. */
export function citedPaths(markdown) {
  const paths = new Set();
  for (const match of stripFencedBlocks(markdown).matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim();
    if (NOT_A_CONCRETE_PATH.test(token)) continue;
    if (!PATH_ROOTS.some((root) => token.startsWith(root))) continue;
    paths.add(token.replace(/[.,;:]$/, ''));
  }
  return paths;
}

/** `node tools/<file>` invocations, from prose and from code blocks alike. */
export function citedNodeTools(markdown) {
  const tools = new Set();
  for (const match of markdown.matchAll(/node\s+(tools\/[A-Za-z0-9._-]+\.mjs)/g)) {
    tools.add(match[1]);
  }
  return tools;
}

/** `pnpm <script>` and `pnpm --filter <workspace> <script>` invocations. */
export function citedPnpmScripts(markdown) {
  const scripts = [];
  for (const match of markdown.matchAll(
    /* Segments carry hyphens — `check:storefront-route-authority` is a real
       script name, and a pattern without them silently truncates to
       `check:storefront`, which then matches nothing and reports the wrong
       thing. Caught by this tool's own suite. */
    /pnpm\s+(?:--filter\s+(\S+)\s+)?([a-z][a-z0-9-]*(?::[a-z0-9-]+)*)/g,
  )) {
    const [, workspace, script] = match;
    if (script === 'install' || script === 'run' || script === 'exec') continue;
    scripts.push({ workspace, script });
  }
  return scripts;
}

/** Every workspace `package.json`, indexed by its declared name. */
function workspacePackages(root) {
  const byName = new Map();
  const roots = ['apps', 'packages'];
  for (const group of roots) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const entry of readdirSync(groupDir)) {
      const manifest = join(groupDir, entry, 'package.json');
      if (!existsSync(manifest) || !statSync(manifest).isFile()) continue;
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
      if (typeof parsed.name === 'string') byName.set(parsed.name, parsed);
    }
  }
  return byName;
}

function operationsDocuments(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => ({ name, body: readFileSync(join(dir, name), 'utf8') }));
}

export function check(root) {
  const findings = [];
  const add = (kind, where, detail) => findings.push({ kind, where, detail });

  const documents = operationsDocuments(join(root, 'docs', 'operations'));
  if (documents.length === 0) {
    add('SETUP', 'docs/operations', 'no runbook documents found');
    return findings;
  }

  const slugsByDocument = new Map(
    documents.map((document) => [document.name, headingSlugs(document.body)]),
  );

  // 1. ALERT — every alert runbook id resolves in the index.
  const rulesPath = join(
    root,
    'infrastructure/monitoring/prometheus/rules/wave1-commerce.rules.yml',
  );
  if (!existsSync(rulesPath)) {
    add('SETUP', 'infrastructure/monitoring', 'the Wave-1 alert rules file is missing');
  } else {
    const index = readFileSync(join(root, 'docs/operations/README.md'), 'utf8');
    for (const id of alertRunbookIds(readFileSync(rulesPath, 'utf8'))) {
      if (!index.includes(id)) {
        add(
          'ALERT',
          'docs/operations/README.md',
          `${id} is carried by an alert and resolves to nothing`,
        );
      }
    }
  }

  const packages = workspacePackages(root);
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  for (const { name, body } of documents) {
    const where = `docs/operations/${name}`;

    // 2. LINK
    for (const { target, anchor } of markdownLinks(body)) {
      const targetName = target === '' ? name : target;
      const targetSlugs = slugsByDocument.get(targetName);
      if (targetSlugs === undefined) {
        if (!existsSync(join(root, 'docs', 'operations', targetName))) {
          add('LINK', where, `${target} does not exist`);
        }
        continue;
      }
      if (anchor !== undefined && !targetSlugs.has(anchor)) {
        add('LINK', where, `${targetName}#${anchor} names no heading`);
      }
    }

    // 3. PATH
    for (const cited of citedPaths(body)) {
      if (!existsSync(join(root, cited))) {
        add('PATH', where, `${cited} does not exist`);
      }
    }

    // 4. COMMAND
    for (const tool of citedNodeTools(body)) {
      if (!existsSync(join(root, tool))) {
        add('COMMAND', where, `${tool} does not exist`);
      }
    }
    for (const { workspace, script } of citedPnpmScripts(body)) {
      const manifest = workspace === undefined ? rootManifest : packages.get(workspace);
      if (manifest === undefined) {
        add('COMMAND', where, `pnpm --filter ${workspace} names no workspace`);
        continue;
      }
      const scripts = manifest.scripts ?? {};
      if (!(script in scripts)) {
        const owner = workspace === undefined ? 'the root package' : workspace;
        add('COMMAND', where, `pnpm ${script} is not a script of ${owner}`);
      }
    }
  }

  return findings;
}

function main() {
  let findings;
  try {
    findings = check(REPO_ROOT);
  } catch (error) {
    console.error(`[runbook-references] ${String(error instanceof Error ? error.message : error)}`);
    process.exit(2);
  }

  if (findings.length === 0) {
    console.log('RUNBOOK REFERENCES: PASS');
    process.exit(0);
  }

  console.log(`RUNBOOK REFERENCES: FAIL (${String(findings.length)})`);
  for (const { kind, where, detail } of findings) {
    console.log(`  ${kind}: ${where} — ${detail}`);
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

export { REPO_ROOT, OPERATIONS_DIR, INDEX_FILE, ALERT_RULES };
