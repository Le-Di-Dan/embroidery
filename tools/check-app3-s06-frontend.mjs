/**
 * `APP3-S06` — the Storefront rules.
 *
 * The ways an image capability ships working and wrong:
 *
 * - **Intrinsic size taken from the browser.** `naturalWidth` on a decoded
 *   `<img>` is the same number as the server's measurement right up until it
 *   is not, and the document is what gets stitched.
 * - **The Blob route polled as a state machine.** `APP3-B06C` answers one 404
 *   for eleven private misses, so 404-then-200 reads a refusal as progress and
 *   can never show a rejected upload at all.
 * - **A candidate committed without `APP3-P01`/`APP3-P02`.** The server proved
 *   the derivative eligible; it proved nothing about where the element lands.
 * - **A clamp.** An image quietly shrunk to fit is an image the customer never
 *   chose, and `IMP-D045` PO-09 forbids every form of it.
 * - **An object URL that outlives its media.** Written into the document it is a
 *   storage address in a saved design; kept in a store it outlives the component
 *   that revokes it; keyed by element it survives a replacement and renders the
 *   previous picture under the new identity.
 * - **A mobile editing surface.** Hidden with CSS, a file input still opens a
 *   picker — and mobile image tooling is `APP3-S11`'s.
 *
 * Read-only, cross-platform pure Node.
 */
import { isS10Delivered, isS11Delivered } from './app3-accepted-paths.mjs';
import {
  CANONICAL_FILES,
  code,
  compositionCode,
  featureCode,
  read,
} from './check-app3-s06.sources.mjs';

/** The document is built from the server's measurements, and from nothing else. */
export function checkImageAuthority(rootDir, fail) {
  const authority = code(rootDir, 'authority');
  const placement = code(rootDir, 'placement');
  const all = featureCode(rootDir);

  // All four `APP3-P01` authorities, in the order that makes each meaningful.
  for (const required of [
    'validateDesignDocumentStructure',
    'validateDesignDocumentComplexity',
    'validateDesignDocumentContext',
    'ruleOnCandidate',
  ]) {
    if (!authority.includes(required)) {
      fail(`${CANONICAL_FILES.authority}: a candidate is not ruled on by ${required}`);
    }
  }
  const structureAt = authority.indexOf('validateDesignDocumentStructure(');
  const contextAt = authority.indexOf('validateDesignDocumentContext(');
  const geometryAt = authority.indexOf('ruleOnCandidate(');
  if (structureAt > contextAt || contextAt > geometryAt) {
    fail(`${CANONICAL_FILES.authority}: the candidate authorities are asked out of order`);
  }

  // The element's four media fields come from the status projection.
  for (const field of ['assetId', 'derivativeId', 'intrinsicWidthPx', 'intrinsicHeightPx']) {
    if (!placement.includes(field)) {
      fail(`${CANONICAL_FILES.placement}: the image element carries no ${field}`);
    }
  }
  if (!/intrinsicWidthPx: media\.widthPx/.test(placement)) {
    fail(`${CANONICAL_FILES.placement}: intrinsic width is not the server's measurement`);
  }

  // Nothing anywhere in the feature measures a picture or the DOM for geometry.
  for (const measurement of [
    'naturalWidth',
    'naturalHeight',
    'decode()',
    'createImageBitmap',
    'new Image(',
  ]) {
    if (all.includes(measurement)) {
      fail(`the Studio derives image geometry from the browser ("${measurement}")`);
    }
  }

  // No repair, in any of the forms `IMP-D045` PO-09 names.
  for (const repair of [/clamp(?!ed to the interval)/i, /snapTo/, /scaleDown/, /fitInside/]) {
    if (repair.test(code(rootDir, 'imageHook')) || repair.test(placement)) {
      fail(`the image capability repairs a refused candidate (${String(repair)})`);
    }
  }
  // The initial box preserves the ratio and never enlarges.
  if (!/Math\.min\(\s*1,/.test(placement)) {
    fail(`${CANONICAL_FILES.placement}: the initial placement may upscale`);
  }
  checkInitialSizeConstruction(placement, code(rootDir, 'imageHook'), fail);
  // Replacement keeps the element, its z-order and its transform.
  if (!/\.\.\.element,\s*assetId: media\.assetId/.test(placement)) {
    fail(`${CANONICAL_FILES.placement}: a replacement does not keep the existing element`);
  }
  /*
   * A replacement changes the media identity and nothing else.
   *
   * Scoped to `withReplacedImage` rather than to the file: `withNewImage`
   * legitimately calls `initialImageTransform`, and a file-wide ban would refuse
   * the one function that is *supposed* to place something. What must stay
   * impossible is a replacement recomputing the box — a customer who positioned
   * their image made a decision, and re-fitting it because the new picture has a
   * different shape discards that decision silently.
   */
  const replace = placement.slice(placement.indexOf('export function withReplacedImage'));
  for (const forbidden of ['initialImageTransform', 'transform:', '.filter(']) {
    if (replace.includes(forbidden)) {
      fail(`${CANONICAL_FILES.placement}: a replacement re-places or removes the element`);
    }
  }
}

/**
 * The initial box is **constructed** from every limit that applies (`APP3-S06-C1`).
 *
 * The shape this rejects is the one that shipped: an initial placement fitted to
 * the Embroidery Area rectangle alone, leaving `APP3-P02` to refuse it whenever
 * the Area's millimetre maximum was the tighter bound. That refusal is correct
 * and useless — nothing is inserted, so the advice to resize with `APP3-S03`
 * names an element that does not exist.
 *
 * Ruled mechanically, on the `initialImageTransform` body rather than the file,
 * because `withReplacedImage` deliberately does none of this and a file-wide
 * rule would be satisfied by the wrong function.
 */
function checkInitialSizeConstruction(placement, imageHook, fail) {
  const from = placement.indexOf('export function initialImageTransform');
  const to = placement.indexOf('export function withNewImage');
  const label = `${CANONICAL_FILES.placement}: the initial placement`;
  if (from < 0 || to < 0 || to < from) {
    fail(`${label} is not a distinct rule`);
    return;
  }
  const initial = placement.slice(from, to);

  // The physical maxima participate in the size, through P02's own conversion.
  if (!/mmToPx\(/.test(initial)) {
    fail(`${label} does not convert a physical maximum through APP3-P02`);
  }
  for (const axis of ['maxWidthMm', 'maxHeightMm']) {
    if (!initial.includes(axis)) fail(`${label} is not bounded by ${axis}`);
  }
  // And so does the Area rectangle: the tighter of the two decides.
  for (const axis of ['boundWidthPx', 'boundHeightPx']) {
    if (!initial.includes(axis)) fail(`${label} is not bounded by ${axis}`);
  }
  // One `Math.min` per axis bound plus the intrinsic cap. Fewer means an axis
  // is decided by one authority rather than the tighter of both.
  if ((initial.match(/Math\.min\(/g) ?? []).length < 3) {
    fail(`${label} does not take the tighter of the rectangle and the physical maximum`);
  }
  // Centred in the Area on both axes.
  for (const origin of ['boundXPx', 'boundYPx']) {
    if (!initial.includes(origin)) fail(`${label} is not centred on ${origin}`);
  }

  /*
   * No second px↔mm implementation, anywhere in the file.
   *
   * `IMP-D045` PO-10 makes `product_sides.px_per_mm` the sole scale authority. A
   * local constant here would be a screen-shaped opinion about physical size,
   * and the failure mode is a logo stitched at the wrong size on a garment —
   * discovered on the garment.
   */
  for (const forked of [/const\s+\w*px_?per_?mm\w*\s*=/i, /25\.4/, /\b96\b/, /devicePixelRatio/]) {
    if (forked.test(placement)) {
      fail(`${CANONICAL_FILES.placement}: a second px↔mm scale (${String(forked)})`);
    }
  }

  /*
   * The construction is still only a candidate.
   *
   * Deriving a valid size does not excuse the final ruling — that is what makes
   * this a construction and not a clamp. The hook must refuse a null derivation
   * outright and put everything else through `ruleOnImageCandidate`.
   */
  if (!/=== null\) return \{ ok: false/.test(imageHook)) {
    fail(`${CANONICAL_FILES.imageHook}: an impossible placement is not refused`);
  }
  if (!/ruleOnImageCandidate\(/.test(imageHook)) {
    fail(`${CANONICAL_FILES.imageHook}: a constructed placement is committed unvalidated`);
  }
  /*
   * The hook may refuse on its own. It may never accept on its own.
   *
   * Ruled as the absence of a fabricated success rather than the presence of a
   * call, because a call is still there when only *one* of the two paths is
   * validated — which is exactly what "the helper believes the candidate is
   * valid, so skip the final check" looks like in a diff.
   */
  if (/return \{ ok: true/.test(imageHook)) {
    fail(`${CANONICAL_FILES.imageHook}: a placement is accepted without APP3-P02`);
  }
}

/** The status projection is polled; the binary route never is. */
export function checkPolling(rootDir, fail) {
  const status = code(rootDir, 'statusHook');
  const service = code(rootDir, 'service');

  if (!/publicDesignSessionAssetStatus\(/.test(service)) {
    fail(`${CANONICAL_FILES.service}: does not read the status projection`);
  }
  /*
   * The whole polling rule: keep asking only while there is no verdict.
   *
   * Asserted inside the `refetchInterval` body rather than anywhere in the file.
   * `isTerminalAssetState` is also read by `isPolling`, so a file-wide check was
   * satisfied by that second use even with the stop condition deleted — the
   * mutation was real and the rule was not.
   */
  const interval = /refetchInterval: \([\s\S]*?\n {4}\},/.exec(status)?.[0] ?? '';
  if (interval === '') {
    fail(`${CANONICAL_FILES.statusHook}: publishes no polling interval rule`);
  } else if (!/isTerminalAssetState\([\s\S]*?\? false/.test(interval)) {
    fail(`${CANONICAL_FILES.statusHook}: polling does not stop on a terminal state`);
  }
  if (!/READY/.test(status) || !/REJECTED/.test(status)) {
    fail(`${CANONICAL_FILES.statusHook}: a terminal state is not both READY and REJECTED`);
  }
  if (!/enabled: address !== undefined/.test(status)) {
    fail(`${CANONICAL_FILES.statusHook}: polling is not gated on there being an upload`);
  }
  if (!/retry: false/.test(status)) {
    fail(`${CANONICAL_FILES.statusHook}: an expired Session is retried on a timer`);
  }
  // The binary route is never a poll target. A `refetchInterval` beside the
  // Blob query is exactly how the 404-as-progress misreading arrives.
  const media = code(rootDir, 'mediaHook');
  if (/refetchInterval/.test(media)) {
    fail(`${CANONICAL_FILES.mediaHook}: the binary route is polled`);
  }
  // The interval is declared once and read, never restated at a call site.
  if (!/SESSION_ASSET_POLL_INTERVAL_MS/.test(status)) {
    fail(`${CANONICAL_FILES.statusHook}: the polling interval is not a named constant`);
  }
}

/** Object URLs are runtime-only, keyed by derivative, and always revoked. */
export function checkObjectUrls(rootDir, fail) {
  const media = code(rootDir, 'mediaHook');
  const keys = code(rootDir, 'queryKeys');
  const store = code(rootDir, 'documentStore');

  if (!/URL\.createObjectURL\(/.test(media) || !/URL\.revokeObjectURL\(/.test(media)) {
    fail(`${CANONICAL_FILES.mediaHook}: does not own the object URL lifecycle`);
  }
  // Revoked in effect **cleanup**, which is the one placement that also fires on
  // unmount and on replacement.
  if (!/return \(\) => \{[\s\S]{0,240}revokeObjectURL/.test(media)) {
    fail(`${CANONICAL_FILES.mediaHook}: object URLs are not revoked on cleanup`);
  }
  // Keyed by derivative: a replacement must address different bytes, or the
  // previous picture renders under the new media identity.
  if (
    !/sessionAssetPreview: \(sessionId: string, assetId: string, derivativeId: string\)/.test(keys)
  ) {
    fail(`${CANONICAL_FILES.queryKeys}: the preview key does not carry the derivative`);
  }
  // Never document state, and never a store.
  if (/blob|objectUrl|ObjectURL/i.test(store)) {
    fail(`${CANONICAL_FILES.documentStore}: a blob or object URL reaches the working document`);
  }
  for (const forbidden of ['create(', 'zustand']) {
    if (media.includes(forbidden)) {
      fail(`${CANONICAL_FILES.mediaHook}: holds media in a global store ("${forbidden}")`);
    }
  }
}

/** One native SVG scene; the placeholder narrows rather than disappears. */
export function checkRenderer(rootDir, fail) {
  const element = code(rootDir, 'stageElement');
  const stage = code(rootDir, 'stage');
  const all = featureCode(rootDir);

  const canvases = all.split('<svg').length - 1;
  if (canvases !== 1) {
    fail(`the Studio opens ${String(canvases)} <svg> roots, expected exactly 1`);
  }
  if (all.includes('<canvas')) fail('the Studio renders a canvas');
  /*
   * No HTML overlay pretending to be artwork — asserted on the **stage**, not on
   * the feature.
   *
   * `studio-template-preview.tsx` renders a real `<img>` and always has: it is
   * `APP3-S01`'s Template *picker card*, a thumbnail beside a list, and nothing
   * to do with the design surface. Banning the tag feature-wide would refuse an
   * accepted component for using the right element in the right place. What must
   * stay impossible is an HTML image *in the scene*, where it would need its own
   * transform pipeline agreeing with `APP3-P02` frame by frame during a drag.
   */
  for (const key of ['stage', 'stageElement']) {
    if (/<img\s/.test(code(rootDir, key))) {
      fail(`${CANONICAL_FILES[key]}: draws artwork with an HTML <img>`);
    }
  }

  if (!/<image\b/.test(element)) {
    fail(`${CANONICAL_FILES.stageElement}: a placed image is not a native SVG <image>`);
  }
  // The placeholder is still there, and it is what a missing URL draws.
  if (!/ImagePlaceholder/.test(element)) {
    fail(`${CANONICAL_FILES.stageElement}: the honest placeholder was removed`);
  }
  if (!/mediaUrl === null \? \(\s*<ImagePlaceholder/.test(element)) {
    fail(`${CANONICAL_FILES.stageElement}: unavailable media does not draw the placeholder`);
  }
  // The box is the element's own local box, so `APP3-P02` still places it.
  if (!/width=\{width\}[\s\S]{0,60}height=\{height\}/.test(element)) {
    fail(`${CANONICAL_FILES.stageElement}: the image is not drawn in the element's local box`);
  }
  // The media map is threaded by derivative, so one Asset placed twice is
  // fetched once and a replacement addresses different bytes.
  if (!/media\.get\(renderable\.element\.derivativeId\)/.test(stage)) {
    fail(`${CANONICAL_FILES.stage}: media is not resolved by derivative`);
  }
}

/** The three compositions, and the surfaces that stay unbuilt. */
export function checkComposition(rootDir, fail) {
  const panel = code(rootDir, 'imagePanel');
  const drawer = code(rootDir, 'textDrawer');
  const screen = code(rootDir, 'stageScreen');
  const all = featureCode(rootDir);

  if (!/useStudioViewportTier\(\)/.test(panel)) {
    fail(`${CANONICAL_FILES.imagePanel}: the composition is not decided by viewport tier`);
  }
  /*
   * The 390 boundary, world-aware (`APP3-S11`).
   *
   * The rule was "this panel renders a notice at mobile and nothing that edits",
   * and the notice half was only ever true while no checkpoint owned a mobile
   * image surface. `APP3-S11` now does — inside `610:465` — so a sentence saying
   * the screen is too small would be false, and asserting its presence would be
   * asserting a lie.
   *
   * The half that mattered is unchanged and is what stays: this **panel** must
   * still render nothing editable at 390, decided by tier rather than by CSS,
   * because a hidden file input still opens a picker.
   */
  if (!/tier === 'mobile'/.test(panel)) {
    fail(`${CANONICAL_FILES.imagePanel}: the 390 boundary is not decided by tier`);
  }
  const mobileBranch = /tier === 'mobile'[\s\S]{0,200}/.exec(panel)?.[0] ?? '';
  const expected = isS11Delivered(rootDir)
    ? /return null/.test(mobileBranch)
    : /studio-image-mobile-notice/.test(panel);
  if (!expected) {
    fail(`${CANONICAL_FILES.imagePanel}: the 390 boundary is not a notice`);
  }
  if (/hidden=|display: none/.test(panel)) {
    fail(`${CANONICAL_FILES.imagePanel}: a mobile editing surface is hidden rather than absent`);
  }

  // One drawer system: the tablet section goes inside the accepted `APP3-S05-MI01`
  // drawer, behind its one topbar trigger. A second `studio-drawer` or a second
  // topbar would be the second right-drawer system §7 forbids.
  const topbars = all.split('studio-stage__topbar').length - 1;
  if (topbars !== 1) {
    fail(`the Studio declares ${String(topbars)} topbars, expected exactly 1`);
  }
  const drawers = all.split('className="studio-drawer"').length - 1;
  if (drawers !== 1) {
    fail(`the Studio declares ${String(drawers)} right drawers, expected exactly 1`);
  }
  if (!/\{children\}/.test(drawer)) {
    fail(`${CANONICAL_FILES.textDrawer}: the accepted drawer takes no further sections`);
  }
  if (!/<StudioImagePanel slot="drawer"/.test(screen + compositionCode(rootDir))) {
    fail(`${CANONICAL_FILES.stageScreen}: the tablet image controls are not in the one drawer`);
  }

  // Nothing pulled forward. Each of these is a capability with its own
  // checkpoint, and each is easy to add while "already in the panel".
  const inspector = code(rootDir, 'imageInspector');
  for (const forbidden of ['crop', 'flip', 'opacity', 'backgroundRemoval', 'filter(', 'onDelete']) {
    if (inspector.includes(forbidden)) {
      fail(`${CANONICAL_FILES.imageInspector}: carries "${forbidden}", which S06 does not own`);
    }
  }
  // World-aware from `APP3-S10`. What this protected is unchanged and is now
  // asserted where it belongs: the **image capability** saves nothing itself.
  if (!isS10Delivered(rootDir) && all.includes('publicDesignSessionAutosave')) {
    fail('the Studio autosaves, which is APP3-S10’s');
  }
  for (const owned of ['imageHook', 'service', 'imageInspector']) {
    if (code(rootDir, owned).includes('publicDesignSessionAutosave')) {
      fail(`${CANONICAL_FILES[owned]}: the image capability saves the document itself`);
    }
  }
  // No fabricated progress: a percentage is shown only when the transport
  // reported a real total.
  const service = code(rootDir, 'service');
  if (!/event\.total === undefined \|\| event\.total <= 0/.test(service)) {
    fail(`${CANONICAL_FILES.service}: upload progress is reported without a real total`);
  }
}

/**
 * The client affordance still mirrors the published contract.
 *
 * The three accepted types and the 10 MiB ceiling are restated in the Storefront
 * because the authority lives in the API application, which it must not import.
 * This is what stops the two drifting: the generated operation's own published
 * description is read, and a number that stops matching fails here.
 */
export function checkAffordanceMirror(rootDir, fail) {
  const file = code(rootDir, 'file');
  const generated = read(rootDir, 'generatedClient') ?? '';

  const match = /MAX_IMAGE_BYTES = ([\d_]+)/.exec(file);
  if (match === null) {
    fail(`${CANONICAL_FILES.file}: publishes no upload ceiling`);
    return;
  }
  const declared = match[1].replaceAll('_', '');
  if (!generated.includes(declared)) {
    fail(
      `${CANONICAL_FILES.file}: the ${declared}-byte ceiling is not the one the contract publishes`,
    );
  }
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    if (!file.includes(type)) fail(`${CANONICAL_FILES.file}: does not offer ${type}`);
  }
  for (const forbidden of ['image/svg', 'image/gif']) {
    if (file.includes(forbidden)) {
      fail(`${CANONICAL_FILES.file}: offers ${forbidden}, which intake always refuses`);
    }
  }
}
