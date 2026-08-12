/**
 * `APP3-S09` — the runtime rules: what the watermark is made of, where it sits,
 * what the token may come from, and what the Studio must still not offer.
 *
 * Split from `check-app3-s09.mjs` by responsibility: that module rules on the
 * predecessors, the design approval and the artifacts that must not move; this
 * one on the watermark itself.
 *
 * Read-only, cross-platform pure Node.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  CANONICAL_FILES,
  FEATURE,
  S09_FILES,
  code,
  collect,
  featureCode,
  outsideS09Code,
  read,
} from './check-app3-s09.sources.mjs';

/**
 * The watermark is not in `APP3-P01`, and cannot become so by accident.
 *
 * Asserted against the schema package as well as the feature: the strongest
 * available form of "it is never serialized" is that a `DesignDocument` has
 * nowhere to put it.
 */
export function checkNotSerialized(rootDir, fail) {
  for (const key of ['elements', 'document']) {
    const schema = code(rootDir, key);
    if (/watermark/i.test(schema)) {
      fail(`${CANONICAL_FILES[key]}: APP3-P01 gained a watermark field`);
    }
  }
  const union = code(rootDir, 'elements');
  if (/'watermark'/.test(union)) {
    fail(`${CANONICAL_FILES.elements}: a watermark element type was added to the union`);
  }

  // Nothing writes the token, the copy or the pattern into a document.
  const watermark = code(rootDir, 'watermark');
  const hook = code(rootDir, 'hook');
  for (const written of ['commit(', 'elements:', 'schemaVersion', 'placement:', 'quantize']) {
    if (watermark.includes(written) || hook.includes(written)) {
      fail(`${CANONICAL_FILES.watermark}: the watermark reaches the document ("${written}")`);
    }
  }
  // And it is not parked in a store either, which would outlive the mount and
  // defeat regeneration.
  if (/zustand|useStudioDocumentStore|useStudioInteractionStore/.test(`${watermark}\n${hook}`)) {
    fail(`${CANONICAL_FILES.hook}: the watermark holds editor or document state`);
  }
}

/**
 * The overlay rides the viewport box, not the transformed layer.
 *
 * This is the difference between a watermark that covers what is on screen and
 * one that is correct at fit and gone at 400 % with a pan.
 */
export function checkViewportAnchored(rootDir, fail) {
  const viewport = code(rootDir, 'viewport');
  const screen = code(rootDir, 'screen');
  const styles = code(rootDir, 'styles');

  // The seam: a slot rendered *outside* the transformed layer.
  if (!/overlay/.test(viewport)) {
    fail(`${CANONICAL_FILES.viewport}: publishes no untransformed overlay slot`);
  }
  /*
   * The slot is after the layer's **closing tag**, not merely after its name.
   *
   * The first version of this rule compared the slot's index to the index of the
   * class name, which is on the *opening* tag — so moving `{overlay}` inside the
   * layer still satisfied it. The mutation caught that: a rule weaker than the
   * thing it protects passes every test until the defect ships.
   */
  const layerAt = viewport.indexOf('studio-stage__viewport-layer');
  const childrenAt = viewport.indexOf('{children}', layerAt);
  const layerCloseAt = viewport.indexOf('</div>', childrenAt);
  const overlayAt = viewport.lastIndexOf('{overlay}');
  if (layerAt < 0 || overlayAt < 0 || layerCloseAt < 0 || overlayAt < layerCloseAt) {
    fail(`${CANONICAL_FILES.viewport}: the overlay is not a sibling after the transformed layer`);
  }
  // The screen passes the watermark through that slot rather than as a child.
  if (!/overlay=\{<StudioStageWatermark/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: the watermark is not mounted in the viewport overlay slot`);
  }

  // The layer covers its box and is clipped by the viewport's own overflow.
  const block = watermarkBlock(styles);
  for (const required of ['position: absolute', 'inset: 0']) {
    if (!block.includes(required)) {
      fail(`${CANONICAL_FILES.styles}: the watermark does not cover the viewport ("${required}")`);
    }
  }
  // No zoom or pan may reach it.
  for (const bound of ['zoomStep', 'panXRatio', 'panYRatio', 'viewportTransform']) {
    if (code(rootDir, 'watermark').includes(bound)) {
      fail(`${CANONICAL_FILES.watermark}: the watermark scales or moves with the viewport`);
    }
  }
}

/** Cryptographic randomness, once per runtime, from nothing. */
export function checkToken(rootDir, fail) {
  const model = code(rootDir, 'model');
  const hook = code(rootDir, 'hook');

  if (!/getRandomValues/.test(model)) {
    fail(`${CANONICAL_FILES.model}: the token is not drawn from browser cryptographic randomness`);
  }
  if (/Math\.random/.test(model)) {
    fail(`${CANONICAL_FILES.model}: Math.random is used for a value meant to be unguessable`);
  }
  // Minted in a `useState` initialiser: a `useMemo` is a hint React may discard,
  // and a token that silently changed mid-session would mark two screenshots of
  // one session differently.
  if (!/useState\(mintWatermarkToken\)/.test(hook)) {
    fail(`${CANONICAL_FILES.hook}: the token is not minted exactly once per runtime`);
  }
  if (/useMemo|useRef\(/.test(hook)) {
    fail(`${CANONICAL_FILES.hook}: the token is minted through a recomputable memo`);
  }

  /*
   * No identity reaches the mint.
   *
   * Ruled on the mint's own signature as well as on the terms: a function that
   * takes no argument cannot be handed a secret, which is a stronger statement
   * than any list of banned words.
   */
  if (!/export function mintWatermarkToken\(\)/.test(model)) {
    fail(`${CANONICAL_FILES.model}: the token mint accepts an input it could be given identity in`);
  }
  for (const identity of [
    'sessionId',
    'sessionSecret',
    'cookie',
    'userAgent',
    'navigator',
    'assetId',
    'derivativeId',
    'storageKey',
    'email',
    'phone',
    'location.',
  ]) {
    if (`${model}\n${hook}`.includes(identity)) {
      fail(`${CANONICAL_FILES.model}: the token is derived from identity ("${identity}")`);
    }
  }
  // And it never leaves the browser.
  for (const leak of ['localStorage', 'sessionStorage', 'console.', 'getBrowserApiClient']) {
    if (`${model}\n${hook}\n${code(rootDir, 'watermark')}`.includes(leak)) {
      fail(`${CANONICAL_FILES.model}: the token is persisted, logged or sent ("${leak}")`);
    }
  }
}

/** A repeated pattern whose size is the viewport's, not the document's. */
export function checkPattern(rootDir, fail) {
  const model = code(rootDir, 'model');

  for (const required of ['WATERMARK_ROWS', 'WATERMARK_COLUMNS', 'WATERMARK_ANGLE_DEG']) {
    if (!model.includes(required)) {
      fail(`${CANONICAL_FILES.model}: the pattern publishes no ${required}`);
    }
  }
  // The count is a constant, not a function of anything on the page.
  if (!/export function watermarkTiles\(\)/.test(model)) {
    fail(`${CANONICAL_FILES.model}: the tile count depends on an input it must not depend on`);
  }
  for (const dependency of ['document', 'elements', 'zoom', 'pan', 'scene', 'graph']) {
    if (new RegExp(`\\b${dependency}\\b`).test(model)) {
      fail(`${CANONICAL_FILES.model}: the pattern depends on "${dependency}"`);
    }
  }
  // Diagonal: an axis-aligned band can be cropped along its own edge.
  if (/WATERMARK_ANGLE_DEG = 0\b/.test(model)) {
    fail(`${CANONICAL_FILES.model}: the pattern is axis-aligned and croppable`);
  }
}

/** Both approved treatments, from tokens, with no pixel sampling. */
export function checkContrast(rootDir, fail) {
  const watermark = code(rootDir, 'watermark');
  const block = watermarkBlock(code(rootDir, 'styles'));

  for (const treatment of ['studio-watermark__text--light', 'studio-watermark__text--dark']) {
    if (!watermark.includes(treatment)) {
      fail(`${CANONICAL_FILES.watermark}: only one contrast treatment is drawn (${treatment})`);
    }
    if (!block.includes(`.${treatment}`)) {
      fail(`${CANONICAL_FILES.styles}: ${treatment} has no approved treatment`);
    }
  }
  // Bound tokens, never literals — the defect `APP3-D01-C1` had to repair in the
  // design file itself.
  if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(block)) {
    fail(`${CANONICAL_FILES.styles}: the watermark uses a colour literal`);
  }
  // No per-frame inspection of the customer's own artwork.
  for (const sampling of ['getImageData', 'createImageBitmap', 'toDataURL', 'drawImage']) {
    if (featureCode(rootDir).includes(sampling)) {
      fail(`${FEATURE}: the watermark samples customer pixels ("${sampling}")`);
    }
  }
}

/** Non-interactive, non-announced, and never in anyone's way. */
export function checkAccessibility(rootDir, fail) {
  const watermark = code(rootDir, 'watermark');
  const block = watermarkBlock(code(rootDir, 'styles'));

  if (!/aria-hidden="true"/.test(watermark)) {
    fail(`${CANONICAL_FILES.watermark}: the repeated pattern is announced to assistive technology`);
  }
  for (const required of ['pointer-events: none', 'user-select: none']) {
    if (!block.includes(required)) {
      fail(`${CANONICAL_FILES.styles}: the watermark takes a pointer or a selection`);
    }
  }
  // No control, no focus stop.
  for (const interactive of ['<button', '<a ', 'onClick', 'tabIndex', 'href']) {
    if (watermark.includes(interactive)) {
      fail(`${CANONICAL_FILES.watermark}: the watermark is interactive ("${interactive}")`);
    }
  }
  // The policy is stated once, as real text outside the hidden pattern.
  if (!/StudioWatermarkNotice/.test(watermark)) {
    fail(`${CANONICAL_FILES.watermark}: the policy is not stated as real text`);
  }
}

/**
 * No export, and no security theatre.
 *
 * The two belong together: every one of these hacks is defeated by a phone
 * camera, and shipping one is what tempts a policy note into claiming
 * screenshots are prevented — which
 * `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §6 forbids in terms.
 */
export function checkNoExport(rootDir, fail) {
  const all = featureCode(rootDir);

  for (const control of ['download', 'toDataURL', 'navigator.share', 'window.print', 'saveAs']) {
    if (all.includes(control)) {
      fail(`${FEATURE}: an export or download control ("${control}")`);
    }
  }
  for (const theatre of [
    'PrintScreen',
    'onContextMenu',
    'oncontextmenu',
    "'blur'",
    'visibilitychange',
    'preventDefault()) // screenshot',
  ]) {
    if (all.includes(theatre)) {
      fail(`${FEATURE}: a screenshot-prevention hack ("${theatre}")`);
    }
  }
  /*
   * The copy claims nothing that is untrue.
   *
   * Ruled on the **published strings**, not on the file: the docblock above them
   * explains why a screenshot claim is forbidden and therefore contains the very
   * words a file-wide ban looks for. That is the proxy failure `APP3-B06B`,
   * `APP3-B06C` and `APP3-S06` each recorded, and it fired here first — on this
   * gate's own first run, before anything shipped.
   */
  const copy = code(rootDir, 'copy');
  const published = [...copy.matchAll(/:\s*'([^']*)'/g)].map((match) => match[1] ?? '').join(' ');
  for (const claim of ['chụp màn hình', 'screenshot', 'quay màn hình', 'ghi màn hình', 'chặn']) {
    if (published.toLowerCase().includes(claim)) {
      fail(`${CANONICAL_FILES.copy}: the policy note claims screenshots can be prevented`);
    }
  }
  if (!published.includes('đóng dấu')) {
    fail(`${CANONICAL_FILES.copy}: the policy note does not state that the preview is marked`);
  }

  // One artwork renderer, still.
  const canvases = all.split('<svg').length - 1;
  if (canvases !== 1) {
    fail(`${FEATURE}: opens ${String(canvases)} <svg> roots, expected exactly 1`);
  }
  if (all.includes('<canvas')) fail(`${FEATURE}: renders a canvas`);

  // The watermark is built in its own four files and nowhere else.
  const outside = outsideS09Code(rootDir);
  for (const construction of ['studio-watermark__', 'mintWatermarkToken', 'watermarkTiles(']) {
    if (outside.includes(construction)) {
      fail(`${FEATURE}: a watermark is built outside the four files APP3-S09 owns`);
    }
  }
}

/** The commands this checkpoint owns are discoverable. */
export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  for (const id of ['CMD-CHECK-APP3-S09', 'CMD-TEST-APP3-S09', 'CMD-TEST-APP3-S09-STOREFRONT']) {
    if (!index.includes(id)) fail(`${CANONICAL_FILES.index}: ${id} is not registered`);
  }
}

/** CLAUDE.md §6, for every file this checkpoint owns. */
export function checkFileSizes(rootDir, fail) {
  for (const path of collect(join(rootDir, FEATURE), /\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > 400) {
      fail(`${relative(rootDir, path).replaceAll('\\', '/')}: ${String(lines)} lines exceeds 400`);
    }
  }
  for (const owned of S09_FILES) {
    if (read(rootDir, `${FEATURE}/${owned}`) === undefined) {
      fail(`${FEATURE}/${owned}: missing`);
    }
  }
}

/** No dependency, no migration, no backend change. */
export function checkImmutability(rootDir, fail) {
  const manifest = read(rootDir, 'manifest') ?? '';
  for (const library of ['watermark', 'html2canvas', 'dom-to-image', 'canvas']) {
    if (manifest.includes(`"${library}`)) {
      fail(`${CANONICAL_FILES.manifest}: a dependency was added ("${library}")`);
    }
  }
  const migrations = collect(join(rootDir, 'packages/database/migrations'), /\.sql$/);
  if (migrations.length !== 34) {
    fail(
      `packages/database/migrations: expected 34 migrations, found ${String(migrations.length)}`,
    );
  }
}

/** The watermark's own stylesheet rules, and nothing else's. */
function watermarkBlock(styles) {
  return (styles.match(/^\.studio-watermark[^\n]*\{[\s\S]*?^\}/gm) ?? []).join('\n');
}
