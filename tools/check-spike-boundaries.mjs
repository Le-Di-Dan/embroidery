#!/usr/bin/env node
/**
 * Production-isolation gate for research spikes (APP0-R01).
 *
 * A spike may live in the repository and in the root lockfile, but it must be
 * impossible for it — or for any rendering candidate it installs — to reach a
 * shipped application. This checks both halves:
 *
 *   static: no app/package manifest depends on a spike or on a candidate engine,
 *           and no application or package source imports spike code;
 *   build:  the produced `.next` output and the API `dist` contain no spike or
 *           candidate marker (a lockfile entry is not a bundled runtime).
 *
 * Usage: node tools/check-spike-boundaries.mjs [--build] [rootDir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const PRODUCT_WORKSPACES = ['apps', 'packages'];
const SPIKE_SCOPE = '@embroidery-spike/';
const CANDIDATE_PACKAGES = [
  'konva',
  'react-konva',
  'fabric',
  'pixi.js',
  '@pixi/react',
  'interactjs',
];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', '.turbo', 'coverage', 'dist', 'out']);
const BUILD_CONTENT_MARKERS = [
  SPIKE_SCOPE,
  'app0-r01-design-studio',
  ...CANDIDATE_PACKAGES.map((name) => `node_modules/${name}`),
];

function listWorkspaceDirectories(root, group) {
  const base = join(root, group);
  if (!existsSync(base)) {
    return [];
  }
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(base, entry.name));
}

function walk(directory, onFile) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) {
        walk(join(directory, entry.name), onFile);
      }
      continue;
    }
    onFile(join(directory, entry.name));
  }
}

export function collectStaticViolations(root) {
  const violations = [];
  for (const group of PRODUCT_WORKSPACES) {
    for (const workspace of listWorkspaceDirectories(root, group)) {
      const manifestPath = join(workspace, 'package.json');
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const declared = {
          ...(manifest.dependencies ?? {}),
          ...(manifest.devDependencies ?? {}),
          ...(manifest.peerDependencies ?? {}),
        };
        for (const name of Object.keys(declared)) {
          if (name.startsWith(SPIKE_SCOPE)) {
            violations.push(
              `${relative(root, manifestPath)} depends on the spike package "${name}".`,
            );
          }
          if (CANDIDATE_PACKAGES.includes(name)) {
            violations.push(
              `${relative(root, manifestPath)} depends on rendering candidate "${name}"; APP0-R01 selected an engine but APP3 owns adopting it.`,
            );
          }
        }
      }
      const sourceRoot = join(workspace, 'src');
      if (!existsSync(sourceRoot)) {
        continue;
      }
      walk(sourceRoot, (file) => {
        if (!SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension))) {
          return;
        }
        const content = readFileSync(file, 'utf8');
        if (content.includes(SPIKE_SCOPE) || content.includes('spikes/app0-r01')) {
          violations.push(`${relative(root, file)} references spike code.`);
        }
      });
    }
  }
  return violations;
}

export function collectBuildViolations(root) {
  const violations = [];
  const targets = [
    join(root, 'apps', 'admin', '.next'),
    join(root, 'apps', 'storefront', '.next'),
    join(root, 'apps', 'api', 'dist'),
  ].filter((path) => existsSync(path) && statSync(path).isDirectory());
  let scanned = 0;
  for (const target of targets) {
    walk(target, (file) => {
      if (!SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension))) {
        return;
      }
      scanned += 1;
      const content = readFileSync(file, 'utf8');
      for (const marker of BUILD_CONTENT_MARKERS) {
        if (content.includes(marker)) {
          violations.push(
            `${relative(root, file)} contains the spike/candidate marker "${marker}".`,
          );
          return;
        }
      }
    });
  }
  return { violations, scanned, targets: targets.length };
}

function main() {
  const args = process.argv.slice(2);
  const withBuild = args.includes('--build');
  const root = args.find((argument) => !argument.startsWith('--')) ?? process.cwd();
  const violations = collectStaticViolations(root);
  let scanned = 0;
  if (withBuild) {
    const build = collectBuildViolations(root);
    violations.push(...build.violations);
    scanned = build.scanned;
  }
  if (violations.length > 0) {
    console.error('[spike-boundary] violations:');
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }
  console.log(
    `[spike-boundary] clean: no app or package depends on a spike or a rendering candidate${withBuild ? `; ${String(scanned)} built file(s) free of spike markers` : ''}.`,
  );
}

if (process.argv[1]?.endsWith('check-spike-boundaries.mjs')) {
  main();
}
