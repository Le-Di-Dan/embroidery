/**
 * `APP3-S03-C1` — the rules that keep the render-reuse optimization safe.
 *
 * A performance fix is the easiest kind of change to get quietly wrong, because
 * the thing it removes — work — is invisible when it is removed correctly and
 * invisible when it is removed incorrectly. Three specific forms of "faster and
 * wrong" are what these rules exist to refuse:
 *
 * 1. **Reuse by element id.** An element inside a group the customer just
 *    dragged has an unchanged record and a changed position. Reusing its
 *    previous placement paints the children where the group used to be, and
 *    every ungrouped scene in every test still looks perfect.
 * 2. **A hand-written memo comparator.** `memo(Component, areEqual)` invites a
 *    list of "the fields that matter", and a field left off it is a stale
 *    element on the stage that nothing reports. Stable input identity has no
 *    such list.
 * 3. **A branch that only makes the benchmark fast.** A scene-size threshold, a
 *    user-agent test or a skipped validation would move the number without
 *    moving what a customer experiences.
 *
 * Split into its own module by responsibility, and because the runtime rules it
 * belongs beside are already near the repository's 400-line source limit.
 *
 * Read-only, cross-platform pure Node.
 */
import { CANONICAL_FILES, FEATURE, code, featureCode } from './check-app3-s03.sources.mjs';

/** Cheap-to-write, impossible-to-justify shortcuts for a benchmark number. */
const BENCHMARK_BRANCHES = Object.freeze([
  /navigator\.userAgent/,
  /isWebkit|isSafari|isChromium/i,
  /process\.env\.[A-Z_]*BENCH/,
  /elements\.length\s*[><]=?\s*\d{2,}/,
  /skipValidation|fastPath|approximate/i,
]);

/**
 * The optimization is present, ancestor-aware, and unforgeable by id alone.
 */
export function checkRenderReuse(rootDir, fail) {
  const identity = code(rootDir, 'renderIdentity');
  if (identity === '') {
    fail(`${CANONICAL_FILES.renderIdentity}: the structural-reuse module is missing`);
    return;
  }

  for (const required of ['shareDocumentIdentity', 'unchangedElementIds']) {
    if (!identity.includes(`export function ${required}`)) {
      fail(`${CANONICAL_FILES.renderIdentity}: publishes no ${required}`);
    }
  }

  /*
   * The rule that actually matters. `APP3-P02` composes ancestors
   * outermost-first, so an element is only reusable when its whole parent chain
   * is — and the only way to know that is to walk the chain.
   */
  if (!identity.includes('graph.parentOf')) {
    fail(`${CANONICAL_FILES.renderIdentity}: reuse does not consult the ancestor chain`);
  }
  if (!/stable\(parent\)/.test(identity)) {
    fail(`${CANONICAL_FILES.renderIdentity}: an ancestor's own reusability is never asked for`);
  }

  // The reused value must be the previous instance of an element whose value is
  // unchanged — an equality test, not a bet that ids imply sameness.
  if (!identity.includes('jsonEqual')) {
    fail(`${CANONICAL_FILES.renderIdentity}: elements are reused without comparing their values`);
  }

  const scene = code(rootDir, 'scene');
  for (const required of ['shareDocumentIdentity', 'unchangedElementIds']) {
    if (!scene.includes(required)) {
      fail(`${CANONICAL_FILES.scene}: the adapter does not use ${required}`);
    }
  }
  // Validation still runs on every build. Reuse may skip re-measuring; it may
  // never skip asking `APP3-P01` whether the document can be read at all.
  if (!scene.includes('validateDesignDocumentStructure(payload)')) {
    fail(`${CANONICAL_FILES.scene}: the adapter no longer validates the payload it was given`);
  }
  if (!/unchanged\.has\(element\.id\)/.test(scene)) {
    fail(`${CANONICAL_FILES.scene}: a placed element is reused without the unchanged set`);
  }

  const screen = code(rootDir, 'stageScreen');
  if (!/buildRenderableScene\(stageDocument,\s*sceneMemo\.current\)/.test(screen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the previous build is not offered back to the adapter`);
  }
}

/**
 * The element component is memoized on identity, with no comparator.
 */
export function checkElementMemo(rootDir, fail) {
  const element = code(rootDir, 'stageElement');
  if (!/export const StudioStageElement = memo\(/.test(element)) {
    fail(`${CANONICAL_FILES.stageElement}: the element component is not memoized`);
  }
  // `memo(Component, areEqual)` — the second argument is the failure mode.
  if (/^\}\s*,\s*\(?[A-Za-z(]/m.test(element.slice(element.indexOf('memo(')))) {
    fail(`${CANONICAL_FILES.stageElement}: memoized behind a hand-written comparator`);
  }
  if (/memo\([\s\S]*?,\s*(areEqual|propsAreEqual|isEqual|shallow)/.test(element)) {
    fail(`${CANONICAL_FILES.stageElement}: memoized behind a hand-written comparator`);
  }
}

/** No production branch exists only to make a measurement look better. */
export function checkNoBenchmarkBranch(rootDir, fail) {
  const all = featureCode(rootDir);
  for (const pattern of BENCHMARK_BRANCHES) {
    if (pattern.test(all)) {
      fail(`${FEATURE}: a benchmark-shaped branch reached production (${String(pattern)})`);
    }
  }
}
