/**
 * The canonical Nét Thêu brand symbol geometry — the single vector-path source
 * for every surface in this repository.
 *
 * ## Provenance
 *
 * Exported from Figma `BQwqV8GdfUIELvsQDB1UQE`, section
 * `BRD0 · 09B — Approved Concept 03 Productionization · Nét Thêu` (`582:18`),
 * symbol master `FIG-BRD0-C3-SYMBOL-MASTER` (`582:9`,
 * `APPROVED_FOR_IMPLEMENTATION`). The two production variants live inside
 * §01 — Core Symbol Preservation:
 *
 * ```text
 * 583:43  SYMBOL · Original approved (C3, untouched)   reference
 * 583:52  SYMBOL · Production (ring 4→6)               ≥ 32px, ≥ 48px on light
 * 583:61  SYMBOL · Micro (gesture only, stroke 16.9→21) < 32px
 * ```
 *
 * `BRD0-F02` forbids altering `vectorPaths`, and nothing here does: the two
 * variants share **one** `d` string because in the design they are literally the
 * same gesture — the micro variant is the production symbol with the seal ring
 * removed and the gesture stroke thickened. That is why this file has one path
 * constant and two stroke widths rather than two paths, and it is what makes the
 * "one canonical vector-path source per symbol variant" requirement structural
 * rather than a rule someone has to remember.
 *
 * The path and every stroke attribute were diffed byte-for-byte against the node
 * exports before being written here.
 *
 * ## What this file is not
 *
 * It is not an icon set. The signature gesture is a **brand mark**: it may never
 * stand in for a menu, search, close, chevron, upload, status or provider icon,
 * all of which remain the design system's own iconography.
 *
 * ## One source, two consumers
 *
 * The raw numbers live in `brand-symbol.geometry.json` rather than here, because
 * they have a second consumer that cannot import TypeScript:
 * `tools/generate-brand-icons.mjs` writes every static icon file — the two
 * `icon.svg`s and the two `apple-icon.png`s — from the same JSON. This module
 * adds the types and the size/tone policy; it does not restate a number.
 */
import geometry from './brand-symbol.geometry.json';

/** The design's own coordinate space. Never rescale the path; scale the box. */
export const BRAND_SYMBOL_VIEWBOX = geometry.viewBox;

/** The signature gesture, identical in both variants. */
export const BRAND_SIGNATURE_GESTURE_PATH = geometry.signatureGesturePath;

/** The seal ring, present only in the production variant. */
export const BRAND_SEAL_RING = Object.freeze(geometry.sealRing);

/**
 * Gesture stroke weight per variant.
 *
 * `583:52` is thinner because the seal ring carries part of the weight;
 * `583:61` thickens it (`16.9 → 21`) to survive without the ring.
 */
export const BRAND_GESTURE_STROKE_WIDTH = Object.freeze(geometry.gestureStrokeWidth);

/**
 * The two approved variants.
 *
 * `production` keeps the seal ring; `micro` drops it. There is no third.
 */
export type BrandSymbolVariant = 'production' | 'micro';

/**
 * Measured size thresholds from the `BRD0-F02` specimen rows, not guessed
 * breakpoints.
 *
 * The two production numbers differ because the constraint is optical rather
 * than geometric: on a dark ground the ring's counter fills in and the mark
 * becomes marginal around 32px, while on a light ground the ring's hairline is
 * what fails first and 48px is the proven floor. The desktop application mockup
 * uses 48px on the light Storefront shell, which is the case this repository
 * actually has.
 *
 * An earlier responsive ladder in the same section says 40px for a desktop
 * header. The later minimum-size evidence supersedes it: the ring is not safe at
 * 40px on light, and shrinking it to match an older specimen row would publish a
 * mark the design proved is not readable.
 */
export const BRAND_SYMBOL_MIN_PX = Object.freeze({
  /** Below this the micro variant is required. */
  micro: 16,
  /** Production floor on a dark ground. */
  productionOnDark: 32,
  /** Production floor on a light ground — the Storefront and Admin case. */
  productionOnLight: 48,
});

/**
 * The sizes the approved application mockups use, named so a call site reads as
 * a design decision rather than as a number somebody picked.
 */
export const BRAND_SYMBOL_APPLICATION_PX = Object.freeze({
  /** `589:7` — Storefront desktop header, production symbol on the light shell. */
  storefrontDesktopHeader: 48,
  /** `589:23` — Storefront mobile header, micro symbol. */
  storefrontMobileHeader: 28,
  /** Compact navigation and other slots under 32px of usable height. */
  compactNav: 24,
  /** `589:36` — Admin login, production symbol. */
  adminLogin: 72,
  /** `589:52` — Design Editor topbar, micro symbol. */
  editorTopbar: 26,
});

/**
 * The mark's colour roles, bound to the locked design tokens.
 *
 * `accent` colours **only** the signature gesture. The seal ring and the
 * wordmark are never Brand/Primary — that is a `BRD0-F02` rule, and it is
 * enforced here by the ring simply not reading this value.
 */
export const BRAND_SYMBOL_TONE_COLOR = Object.freeze(geometry.toneColor);

export type BrandSymbolTone = keyof typeof BRAND_SYMBOL_TONE_COLOR;

/** `$color-background-primary`, the ground the icon files are drawn on. */
export const BRAND_CANVAS_COLOR = geometry.canvasColor;

/**
 * The brand *name* is deliberately not here.
 *
 * It used to be: `BRAND_NAME` read `brandName` out of the geometry JSON, which
 * put the store's name and the store's vector paths behind one import. The name
 * is human-facing copy, so `APP12-V02-C1` §2 moved it to the canonical
 * Vietnamese message repository — `common.brand.name`, read through
 * `@embroidery/i18n`'s `BRAND_NAME`. This module keeps what it is genuinely the
 * authority for: the approved `BRD0-F02` geometry, tones and application sizes.
 *
 * `BrandLockup` still renders the name as live text; it now receives it as a
 * `wordmark` prop from the shell, which already reads the message repository.
 */
