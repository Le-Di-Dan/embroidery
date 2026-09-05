#!/usr/bin/env node
/**
 * Writes every static brand icon file from the one canonical geometry source.
 *
 * ## Why a generator rather than four hand-written files
 *
 * The Product Owner brand-system directive requires **one** canonical
 * vector-path source per symbol variant. The React components satisfy that by
 * importing `packages/ui/src/brand/brand-symbol.geometry.json`, but the
 * framework's icon conventions do not go through React: Next serves
 * `app/icon.svg` and `app/apple-icon.png` as static files, and each app needs
 * its own copy at its own path. Four hand-maintained copies of the same path
 * data is exactly the drift the directive forbids.
 *
 * So they are generated. `--check` re-renders and compares without writing,
 * which turns "the icons still match the approved mark" into something a gate
 * can answer instead of something a reviewer has to eyeball.
 *
 * ## Which variant goes where
 *
 * ```text
 * icon.svg        micro       browser tab, 16–32px — the size class BRD0
 *                             requires the ringless variant for
 * apple-icon.png  production  iOS home screen, 180px — comfortably above the
 *                             48px light-ground floor the ring needs
 * ```
 *
 * `apple-icon` is a PNG because Next accepts only `jpg`, `jpeg` and `png` for
 * that convention — SVG is allowed for `icon` but not for `apple-icon`.
 *
 * ## No invented composition
 *
 * Both files are the approved symbol centred on a full-bleed square of the
 * locked canvas token. No corner radius, no padding scheme, no platform
 * treatment and no second colour: the ground exists only so an ink mark stays
 * legible against dark browser chrome and against the iOS home screen, and a
 * full-bleed square is the one shape that adds no geometry of its own.
 *
 * `sharp` is resolved from `apps/worker`, the workspace that owns it. Adding a
 * native image dependency to the repository root so one tool can rasterize two
 * PNGs would be the wrong trade.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GEOMETRY_PATH = join(REPO_ROOT, 'packages/ui/src/brand/brand-symbol.geometry.json');

/** The one source for every number and path below. */
const geometry = JSON.parse(readFileSync(GEOMETRY_PATH, 'utf8'));

/**
 * The brand *name*, which is copy rather than geometry.
 *
 * It used to sit in the geometry JSON beside the vector paths. `APP12-V02-C1`
 * §2 moved it to the canonical Vietnamese message repository, so this generator
 * reads it from there — the same value `@embroidery/i18n`'s `BRAND_NAME`
 * publishes to the applications. The emitted `aria-label` and `<title>` are the
 * two places an icon file says anything a person can read, and they are now
 * spelled by the same authority as every other sentence in the product.
 */
const BRAND_NAME = JSON.parse(
  readFileSync(join(REPO_ROOT, 'packages/i18n/messages/vi/common.json'), 'utf8'),
).brand.name;

/** iOS home-screen icons are served at 180×180. */
const APPLE_ICON_PX = 180;

const APPS = ['storefront', 'admin'];

/**
 * Where the Studio watermark's generated Sass partial goes.
 *
 * The watermark repeats its mark 35 times in two passes. Rendering the symbol as
 * an element there would add 70 `<svg>` nodes to the Studio stage and break the
 * "exactly one SVG scene" invariant `ADR-APP0-001` guards across half a dozen
 * suites — for decoration. A CSS background costs zero DOM nodes and one decoded
 * image, so the mark is emitted here as a data URI instead, still from this one
 * geometry source and still covered by the check mode.
 */
const WATERMARK_PARTIAL =
  'apps/storefront/src/features/design-studio/styles/_brand-mark.generated.scss';

/** The tones the watermark's two legibility passes need. */
const WATERMARK_TONES = ['ink', 'light'];

/**
 * A bare symbol (no ground) as a CSS `url()` data URI.
 *
 * Only the five characters that actually break CSS or URI parsing are encoded;
 * leaving the rest literal keeps the emitted partial readable and reviewable.
 */
function toDataUri(variant, tone) {
  const color = geometry.toneColor[tone];
  const ring =
    variant === 'production'
      ? `<circle cx="${String(geometry.sealRing.cx)}" cy="${String(geometry.sealRing.cy)}" r="${String(geometry.sealRing.r)}" fill="none" stroke="${color}" stroke-width="${String(geometry.sealRing.strokeWidth)}"/>`
      : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${geometry.viewBox}" fill="none">` +
    ring +
    `<path d="${geometry.signatureGesturePath}" fill="none" stroke="${color}" stroke-width="${String(geometry.gestureStrokeWidth[variant])}" stroke-linecap="round" stroke-linejoin="round"/>` +
    '</svg>';
  const encoded = svg
    .replaceAll('%', '%25')
    .replaceAll('#', '%23')
    .replaceAll('<', '%3C')
    .replaceAll('>', '%3E')
    .replaceAll('"', "'");
  return `url("data:image/svg+xml,${encoded}")`;
}

/** The generated Sass partial: one variable per tone, micro variant only. */
function renderWatermarkPartial() {
  const lines = WATERMARK_TONES.map(
    (tone) => `$studio-watermark-mark-${tone}: ${toDataUri('micro', tone)};`,
  );
  const header = [
    '// GENERATED by tools/generate-brand-icons.mjs from',
    '// packages/ui/src/brand/brand-symbol.geometry.json. Do not edit by hand.',
    '//',
    '// The approved Nét Thêu micro symbol as a CSS background, for the one surface',
    '// that repeats it: the Studio runtime watermark. A background rather than an',
    '// element because the watermark draws 35 tiles in two passes, and 70 inline',
    '// SVGs would break the single-SVG-scene invariant ADR-APP0-001 guards — for',
    '// decoration. Same geometry source as every other brand surface.',
    '',
  ];
  return [...header, ...lines, ''].join('\n');
}

/**
 * The symbol as standalone SVG markup, on the canvas ground.
 *
 * @param {'production' | 'micro'} variant
 */
function renderSvg(variant) {
  const ring =
    variant === 'production'
      ? `\n  <circle cx="${String(geometry.sealRing.cx)}" cy="${String(geometry.sealRing.cy)}" r="${String(geometry.sealRing.r)}" fill="none" stroke="${geometry.toneColor.ink}" stroke-width="${String(geometry.sealRing.strokeWidth)}"/>`
      : '';

  // No double hyphen anywhere in this comment: XML forbids it inside a comment,
  // and the string is parsed by the rasterizer before it is ever a file.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by tools/generate-brand-icons.mjs from
     packages/ui/src/brand/brand-symbol.geometry.json. Do not edit by hand:
     run that tool to regenerate, and run it with the check flag in a gate.

     Nét Thêu brand mark, variant "${variant}", exported unaltered from Figma
     ${geometry.$provenance.master}. The path data is the node's own vectorPaths,
     byte-for-byte; BRD0-F02 forbids altering it. Ink and ground are the locked
     $color-text-primary and $color-background-primary tokens. The ground is
     opaque so the ink mark stays legible on dark chrome, and it is a full-bleed
     square, so no corner radius is invented here. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${geometry.viewBox}" width="300" height="300" role="img" aria-label="${BRAND_NAME}">
  <title>${BRAND_NAME}</title>
  <rect width="300" height="300" fill="${geometry.canvasColor}"/>${ring}
  <path d="${geometry.signatureGesturePath}" fill="none" stroke="${geometry.toneColor.ink}" stroke-width="${String(geometry.gestureStrokeWidth[variant])}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

async function main() {
  const check = process.argv.includes('--check');
  const workerRequire = createRequire(join(REPO_ROOT, 'apps/worker/package.json'));
  const sharp = workerRequire('sharp');

  const iconSvg = renderSvg('micro');
  const appleSvg = renderSvg('production');
  const applePng = await sharp(Buffer.from(appleSvg))
    .resize(APPLE_ICON_PX, APPLE_ICON_PX)
    .png()
    .toBuffer();

  const targets = [
    {
      path: join(REPO_ROOT, WATERMARK_PARTIAL),
      body: Buffer.from(renderWatermarkPartial(), 'utf8'),
    },
  ];
  for (const app of APPS) {
    targets.push({
      path: join(REPO_ROOT, `apps/${app}/src/app/icon.svg`),
      body: Buffer.from(iconSvg, 'utf8'),
    });
    targets.push({
      path: join(REPO_ROOT, `apps/${app}/src/app/apple-icon.png`),
      body: applePng,
    });
  }

  const stale = [];
  for (const target of targets) {
    let current = null;
    try {
      current = readFileSync(target.path);
    } catch {
      current = null;
    }
    if (current !== null && current.equals(target.body)) continue;
    if (check) {
      stale.push(target.path.slice(REPO_ROOT.length + 1).replaceAll('\\', '/'));
      continue;
    }
    writeFileSync(target.path, target.body);
  }

  if (check && stale.length > 0) {
    console.error(
      'check:brand-icons FAILED — these files do not match the approved geometry:\n  ' +
        stale.join('\n  ') +
        '\nRun `node tools/generate-brand-icons.mjs` to regenerate them.',
    );
    process.exit(1);
  }

  console.log(
    check
      ? `check:brand-icons — ${String(targets.length)} icon file(s) match ${geometry.$provenance.master}`
      : `generated ${String(targets.length)} icon file(s) from the approved geometry`,
  );
}

await main();
