/**
 * `APP3-S05-C1` — the correction rules: where the text inspector goes on each
 * viewport, and which exact controlled face the browser was asked about.
 *
 * Split out of `check-app3-s05-runtime.mjs` by responsibility, and because one
 * file carrying both the original runtime rules and these would cross the
 * repository soft limit for a checker.
 *
 * Both rules here exist because human review found the delivered checkpoint
 * wrong in ways that leave a **working** editor. A family-only readiness probe
 * answers `ready` truthfully about a question nobody asked, and the design is
 * then shown — and later stitched — in a synthesised face. An in-flow tablet
 * drawer edits perfectly and silently re-lays-out the stage on every toggle. A
 * CSS-hidden phone inspector is an `APP3-S11` surface that merely looks absent.
 *
 * Read-only, cross-platform pure Node.
 */
import { CANONICAL_FILES, code, read } from './check-app3-s05.sources.mjs';

/**
 * Readiness is asked per *variant*, never per family (`APP3-S05-C1`).
 *
 * This is the rule that stays green while being wrong in the most expensive
 * way. A family probe answers `ready` as soon as any Inter face arrives, so a
 * missing italic binary reads as success, the browser synthesises a slant, and
 * the customer approves — and later has stitched — outlines `APP3-F01` never
 * audited. The registry's policy is written per variant
 * (`REJECT_IF_CONTROLLED_FONT_UNAVAILABLE`, `styles`, `minWeight`/`maxWeight`),
 * so the runtime question has to be too.
 */
export function checkVariantReadiness(rootDir, fail) {
  const variant = code(rootDir, 'variant');
  if (variant === '') {
    fail(`${CANONICAL_FILES.variant}: the controlled-variant authority is missing`);
    return;
  }
  if (!variant.includes('findControlledFont')) {
    fail(`${CANONICAL_FILES.variant}: the readiness probe does not resolve the controlled family`);
  }

  /*
   * The probe *string*, not the module around it.
   *
   * Asking whether the file mentions `variant.fontStyle` anywhere is the rule
   * that stays green while being wrong: the registry check a few lines above
   * names both fields, so a shorthand stripped down to `16px "Inter"` would
   * still satisfy it — a family probe wearing the variant module's clothes.
   * What is read here is the template the browser is actually handed.
   */
  const shorthand = /return `([^`]*)`/.exec(
    variant.slice(variant.indexOf('export function variantShorthand')),
  )?.[1];
  if (shorthand === undefined) {
    fail(`${CANONICAL_FILES.variant}: no readiness probe is built`);
    return;
  }
  for (const required of ['${variant.fontStyle}', 'variant.fontWeight', 'font.family']) {
    if (!shorthand.includes(required)) {
      fail(`${CANONICAL_FILES.variant}: the readiness probe does not carry ${required}`);
    }
  }
  // A fallback in the probe makes every request succeed by matching the
  // fallback — the precise failure this module exists to detect.
  for (const fallback of [',', 'sans-serif', 'serif', 'monospace', 'system-ui']) {
    if (shorthand.includes(fallback)) {
      fail(`${CANONICAL_FILES.variant}: the readiness probe names a fallback family (${fallback})`);
    }
  }
  if (!variant.includes('document.fonts')) {
    fail(`${CANONICAL_FILES.variant}: never asks the browser to resolve the face`);
  }

  // The displayed state follows the requested variant, not the family: all
  // three fields are effect dependencies, so changing style or weight asks
  // again instead of reusing the previous answer.
  const font = code(rootDir, 'controlledFont');
  if (!/\[fontId,\s*fontStyle,\s*fontWeight\]/.test(font)) {
    fail(`${CANONICAL_FILES.controlledFont}: readiness does not depend on the exact variant`);
  }
  if (!font.includes('loadControlledVariant')) {
    fail(`${CANONICAL_FILES.controlledFont}: does not request the controlled variant`);
  }

  /*
   * A requested variant becomes document truth only after the browser proved it
   * can paint that face. The order is the rule: the refusal has to be reachable
   * *before* the commit, or a failed italic would commit anyway and merely warn.
   */
  const controller = code(rootDir, 'controller');
  const refusalAt = controller.indexOf("setRefusal('controlled-font-unavailable')");
  const commitAt = controller.indexOf('ruleRef.current(patch)');
  if (!controller.includes('loadControlledVariant')) {
    fail(`${CANONICAL_FILES.controller}: a font variant is committed without being loaded`);
  }
  if (refusalAt === -1 || commitAt === -1 || refusalAt > commitAt) {
    fail(`${CANONICAL_FILES.controller}: a failed controlled variant does not block the commit`);
  }
  // A late answer from a superseded request must not land. The counter is the
  // bounded mechanism; what matters is that the result is compared before use.
  if (!/started !== request\.current/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: a stale variant result is not discarded`);
  }
}

/**
 * The inspector is placed by tier, and the phone gets no editing surface
 * (`APP3-S05-C1`).
 *
 * `APP3-D01-C1` draws three compositions. Two of the ways to get this wrong are
 * invisible in a screenshot: a tablet drawer that is really an in-flow panel
 * re-lays-out the stage on every toggle, and a mobile inspector that is merely
 * CSS-hidden is still focusable, still submittable, and is `APP3-S11`'s
 * capability delivered without review.
 */
export function checkResponsiveComposition(rootDir, fail) {
  const panel = code(rootDir, 'panel');
  if (panel === '') {
    fail(`${CANONICAL_FILES.panel}: the tier placement authority is missing`);
    return;
  }
  for (const tier of ['mobile', 'tablet']) {
    if (!panel.includes(`tier === '${tier}'`)) {
      fail(`${CANONICAL_FILES.panel}: does not decide the ${tier} composition`);
    }
  }
  // The mobile branch, read as the file actually orders it. Nothing editable
  // may be reachable from it — not the inspector, not the drawer, not a field.
  const mobile = panel.slice(
    panel.indexOf("tier === 'mobile'"),
    panel.indexOf("tier === 'tablet'"),
  );
  for (const editable of ['StudioTextInspector', 'StudioTextDrawer', 'StudioTextControls']) {
    if (mobile.includes(editable)) {
      fail(`${CANONICAL_FILES.panel}: an editing surface is rendered at the mobile tier`);
    }
  }
  // The stage screen mounts the placement authority, not the inspector direct —
  // a direct mount would restore the single composition on every viewport.
  const screen = code(rootDir, 'stageScreen');
  if (!screen.includes('StudioTextPanel')) {
    fail(`${CANONICAL_FILES.stageScreen}: the tier placement authority is not mounted`);
  }
  if (/<StudioTextInspector/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the inspector is mounted past the tier authority`);
  }

  // The drawer is a real toggle with a real relationship to the panel it opens.
  const drawer = code(rootDir, 'drawer');
  for (const required of ['aria-expanded', 'aria-controls', 'aria-label']) {
    if (!drawer.includes(required)) {
      fail(`${CANONICAL_FILES.drawer}: the drawer trigger publishes no ${required}`);
    }
  }
  if (!/trigger\.current\?\.focus\(\)/.test(drawer)) {
    fail(`${CANONICAL_FILES.drawer}: closing the drawer does not return focus to its trigger`);
  }

  // Out of flow, or it is not a drawer: an in-flow panel resizes the stage, and
  // every millimetre the overlay derives from the SVG moves with it.
  const styles = read(rootDir, 'styles') ?? '';
  const rule = styles.slice(styles.indexOf('.studio-drawer {'));
  if (!rule.startsWith('.studio-drawer {') || !/position:\s*absolute/.test(rule.slice(0, 400))) {
    fail(`${CANONICAL_FILES.styles}: the tablet drawer is in flow and pushes the stage`);
  }

  /*
   * The tier is measured where a viewport changes, never during render.
   *
   * `getSnapshot` runs on every render of the panel, and the panel re-renders on
   * every frame of an `APP3-S03` gesture. A `window.innerWidth` read there makes
   * the engine flush a hundred elements' worth of pending layout to answer, and
   * it measured WebKit resize p95 at 28 ms against the 20 ms budget of
   * `ADR-APP0-001` §6 — a real regression that no test and no screenshot shows,
   * because the composition it produces is entirely correct.
   */
  const tier = code(rootDir, 'tier');
  if (!tier.includes('observed ??=')) {
    fail(`${CANONICAL_FILES.tier}: the tier is measured during render, flushing layout per frame`);
  }

  // One breakpoint, two files. A stylesheet and a renderer disagreeing about
  // where desktop begins would style a drawer as a column.
  const responsive = code(rootDir, 'responsive');
  const declared = /desktopMinPx:\s*(\d+)/.exec(responsive)?.[1];
  const styled = /\$bp-studio-split:\s*(\d+)px/.exec(styles)?.[1];
  if (declared === undefined || styled === undefined || declared !== styled) {
    fail(
      `${CANONICAL_FILES.responsive}: the desktop breakpoint (${String(declared)}) and the stylesheet (${String(styled)}) disagree`,
    );
  }
}
