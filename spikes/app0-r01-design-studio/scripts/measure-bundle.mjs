#!/usr/bin/env node
/**
 * Incremental bundle cost per candidate.
 *
 * Same bundler, same minifier, same target, same externals for every candidate.
 * React/React-DOM are external because the applications already ship them, so
 * what is measured is the *additional* bytes a candidate would add to the
 * lazily loaded Studio chunk — not the size of a whole Next.js application.
 */
import { gzipSync } from 'node:zlib';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import * as esbuild from 'esbuild';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRATCH = join(PACKAGE_ROOT, '.bundle-scratch');
const EXTERNAL = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'next', 'next/*'];

const ENTRIES = {
  baseline: `
    export * from '../src/document/canonical';
    export * from '../src/document/validate';
    export * from '../src/document/scene';
    export * from '../src/document/units';
    export * from '../src/harness/watermark';
    export * from '../src/adapters/document-state';
  `,
  konva: `
    export * from '../src/adapters/konva/adapter';
  `,
  // Konva without the react-konva reconciler binding, so the wrapper cost of
  // candidate A is visible rather than buried in one number.
  'konva-core': `
    import Konva from 'konva';
    export default Konva;
  `,
  fabric: `
    export * from '../src/adapters/fabric/adapter';
  `,
  svg: `
    export * from '../src/adapters/svg/adapter';
  `,
};

async function measure(name, source) {
  const entry = join(SCRATCH, `${name}.tsx`);
  writeFileSync(entry, source, 'utf8');
  const outfile = join(SCRATCH, `${name}.out.js`);
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    jsx: 'automatic',
    external: EXTERNAL,
    logLevel: 'error',
  });
  const minified = readFileSync(outfile);
  await esbuild.build({
    entryPoints: [entry],
    outfile: `${outfile}.raw.js`,
    bundle: true,
    minify: false,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    jsx: 'automatic',
    external: EXTERNAL,
    logLevel: 'error',
  });
  const raw = readFileSync(`${outfile}.raw.js`);
  return {
    rawBytes: raw.length,
    minifiedBytes: minified.length,
    gzipBytes: gzipSync(minified, { level: 9 }).length,
  };
}

async function main() {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SCRATCH, { recursive: true });
  const results = {};
  for (const [name, source] of Object.entries(ENTRIES)) {
    results[name] = await measure(name, source);
  }
  const baseline = results.baseline;
  const report = {
    bundler: `esbuild ${esbuild.version}`,
    minifier: 'esbuild (same settings for every candidate)',
    external: EXTERNAL,
    baseline,
    candidates: {},
  };
  for (const name of ['konva', 'konva-core', 'fabric', 'svg']) {
    report.candidates[name] = {
      ...results[name],
      incrementalMinifiedBytes: results[name].minifiedBytes - baseline.minifiedBytes,
      incrementalGzipBytes: results[name].gzipBytes - baseline.gzipBytes,
      incrementalGzipKb:
        Math.round(((results[name].gzipBytes - baseline.gzipBytes) / 1024) * 10) / 10,
      // The baseline entry exports the whole shared document layer; a candidate
      // that imports only part of it can measure smaller than the baseline. A
      // negative delta therefore means "adds no engine bytes at all", which is
      // reported as 0 rather than as a fictitious saving.
      engineGzipKb: Math.max(
        0,
        Math.round(((results[name].gzipBytes - baseline.gzipBytes) / 1024) * 10) / 10,
      ),
    };
  }
  mkdirSync(join(PACKAGE_ROOT, 'results'), { recursive: true });
  writeFileSync(
    join(PACKAGE_ROOT, 'results', 'bundle.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  rmSync(SCRATCH, { recursive: true, force: true });
  for (const name of ['konva', 'konva-core', 'fabric', 'svg']) {
    const entry = report.candidates[name];
    console.log(
      `[bundle] ${name}: +${String(entry.incrementalGzipKb)} KB gzip (min ${String(entry.incrementalMinifiedBytes)} B)`,
    );
  }
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
