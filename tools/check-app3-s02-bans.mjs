/**
 * What the Studio feature may not contain, and why each list exists.
 *
 * Split out of `check-app3-s02-runtime.mjs` by responsibility, and because that
 * module crossed the repository's 400-line source limit once `APP3-S07` split
 * the pointer and measurement bans into world-aware halves. The rules that
 * *apply* these lists stay there; what lives here is the answer to "which
 * strings, and on whose authority".
 *
 * Read-only, cross-platform pure Node.
 */

/**
 * Geometry a renderer must never do for itself (`APP3-S02` §11).
 *
 * `IMP-D045` locks rotation about the untransformed local-box centre with scale
 * applied first, column-vector matrices composed parent-outermost, and
 * `px_per_mm` as the sole conversion authority. A second implementation of any
 * of that is indistinguishable from the first until a design is stitched in the
 * wrong place — so the rule is on the *shape* of the code, not on an outcome a
 * fixture might happen to agree with.
 */
export const LOCAL_GEOMETRY = Object.freeze([
  /Math\.(cos|sin|tan)\(/,
  /rotationDeg\s*\*/,
  /pxPerMm\s*\*/,
  /\/\s*pxPerMm/,
  /multiplyMatrices\(/,
]);

/**
 * Geometry only an **interaction** may reach for, and only in its own files.
 *
 * Three of these sat on the list above as a proxy for "build no second geometry
 * engine", and the proxy expired the way `APP3-B06B` recorded proxies do.
 * `composeMatrices` is `APP3-P02`'s own export — composing a frame *with* the
 * engine is using it, not replacing it — and `Math.atan2` with the degree
 * conversion turns a **pointer** into an angle, which the engine publishes no
 * helper for because a document never needs one.
 *
 * `Math.cos`, `Math.sin` and `Math.tan` stay on the list above, in every world.
 * Those three build a rotation matrix, and a second matrix builder is exactly
 * the thing that agrees with `IMP-D045` on every fixture anyone wrote.
 */
export const INTERACTION_GEOMETRY = Object.freeze([
  /Math\.atan2\(/,
  /Math\.PI/,
  /\*\s*180\s*\/\s*Math/,
  /composeMatrices\(/,
]);

/**
 * Measurements of the browser's layout, which are not the document.
 *
 * Banned across the whole feature in every world, with no checkpoint that may
 * open one. Each answers "where did the browser put this after CSS", and a
 * geometry taken from that is correct at one zoom level and wrong at every
 * other — the failure the adapter boundary exists to make impossible.
 */
export const DOM_MEASUREMENT = Object.freeze([
  'getBoundingClientRect',
  'DOMRect',
  'DOMMatrix',
  'getBBox',
  'getScreenCTM',
  'offsetWidth',
  'getComputedStyle',
]);

/**
 * The one measurement a viewport may take, and only where `APP3-S07` takes it.
 *
 * Converting a pointer drag into a pan needs the size of the element dragged
 * on, and nothing else can supply it: read during the gesture, never stored, so
 * it cannot become geometry. Everywhere else the original ban is untouched —
 * before S07 across the whole feature, after it everywhere but S07's five files.
 */
export const VIEWPORT_MEASUREMENT = Object.freeze(['clientWidth', 'clientHeight']);

/**
 * Pointer gestures, which decide who owns dragging on the stage.
 *
 * S02 refused all of these: a stage that could follow a pointer could move an
 * element, and `APP3-S03` owns that. `APP3-S07` needs exactly one — a drag on
 * empty stage that moves the *view* — so they are legal in its files and
 * refused in every other, which is what stops the pan becoming an element drag.
 *
 * `onWheel` is deliberately **not** here. It stays banned in both worlds:
 * continuous wheel zoom is the arbitrary-scale path `ADR-APP0-001` measured at
 * 41 ms p95 on WebKit, and the approved design draws discrete controls.
 */
export const POINTER_GESTURE = Object.freeze([
  'onPointerDown',
  'onPointerMove',
  'onPointerUp',
  'onPointerCancel',
  'setPointerCapture',
]);
