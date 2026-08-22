/**
 * The read-only render adapter for `/truy-cap/duyet-thiet-ke` (`APP6-S02` §10,
 * §12).
 *
 * ## Why this exists rather than a reuse of the Studio's adapter
 *
 * `APP3` owns the only other renderer in this app, and it could not be reused
 * as it stands:
 *
 * - **A — reuse a public read-only renderer.** There is none. `design-studio`
 *   exports a bootstrap island and its copy, and nothing renderer-shaped; its
 *   only element painter is an interactive `<g role="button">` with selection,
 *   focus and click semantics, which is the opposite of what a review surface
 *   may offer.
 * - **B — extract the reusable part.** The Studio's adapter *is* pure and would
 *   move cleanly, but it is governed rather than merely located: the APP3
 *   acceptance control `test/boundary/design-studio-source.test.ts` enumerates
 *   the feature directory and rules that it contains *exactly one production
 *   renderer*, exactly one `<svg>`, no local geometry, and a watermark built in
 *   exactly the four files `APP3-S09` owns. Moving files out of the feature
 *   changes what that control measures, which reopens a closed APP3 acceptance
 *   artifact — a larger refactor than this checkpoint owns.
 * - **C — a small read-only adapter over the same authorities.** Taken, and it
 *   is genuinely smaller than the Studio's: this surface has no selection, no
 *   gesture, no per-frame document replacement and therefore no structural
 *   sharing, and it needs no stroke-aware bounds because it draws no outline.
 *
 * The guardrails C is allowed under are all structural here. There is no second
 * schema and no second validator — `validateDesignDocumentStructure` from
 * `@embroidery/design-document` is the only thing that decides what a document
 * is. There is no second geometry authority — every matrix comes from
 * `@embroidery/design-engine` and this module composes, inverts, rotates and
 * scales nothing. There is no second rendering engine — the output is plain
 * data that React draws as native SVG (`IMP-D026`, `ADR-APP0-001`).
 *
 * ## What it will not do
 *
 * Nothing here repairs a field, supplies a default, drops an offending element,
 * migrates a schema version or coerces a value. A stored document this build
 * cannot read is a fact to report, not a document to fix: `documentHash` was
 * computed over the bytes as stored, and a browser that "corrected" them would
 * be showing the customer artwork whose hash no longer describes what they see.
 *
 * A geometry finding fails the **whole** scene rather than skipping one
 * element. Skipping would draw a design missing a part, with nothing to
 * distinguish that from a design that never had one.
 *
 * The module is pure: no React, no DOM, no fetch, no object URL, no clock, no
 * hashing. It can therefore be tested by calling it.
 */
import {
  findControlledFont,
  validateDesignDocumentStructure,
  type DesignElement,
} from '@embroidery/design-document';
import {
  buildElementGraph,
  isGeometryFinding,
  resolveEffectiveTransform,
  structuralFinding,
  type Matrix2D,
} from '@embroidery/design-engine';

/**
 * Why a stored document could not be drawn.
 *
 * None of the three carries the document, a path, an element id, an asset id or
 * a finding message: a surface that is refusing to render data must not put
 * that data on screen while it explains itself. The screen shows one sentence
 * for all three, and this distinction exists for tests and support, not copy.
 */
export type ReviewSceneFailure =
  /** `APP3-P01` refused the payload: unsupported schema version, or malformed. */
  | 'UNREADABLE_DOCUMENT'
  /** `APP3-P02` could not place something: an ambiguous graph, a cyclic group. */
  | 'UNRESOLVABLE_GEOMETRY'
  /** A text element names a font outside the controlled registry (IMP-D044 PO-10). */
  | 'UNCONTROLLED_FONT';

/** One element, already placed. Everything here came from P01 or P02. */
export interface PlacedElement {
  readonly id: string;
  /** The element exactly as the stored document holds it. Never a rewritten copy. */
  readonly element: DesignElement;
  /** `APP3-P02`'s effective transform in SVG syntax, so no component formats one. */
  readonly transform: string;
}

export interface ReviewScene {
  /** The document's own placement canvas — the SVG coordinate system. */
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  /**
   * Drawable elements in canonical array order, bottom first.
   *
   * SVG has no `z-index`: document order **is** the stacking, and `APP3-P01`
   * defines the element array as z-order with the same convention. So this list
   * is never sorted, never reversed and never re-ranked — it is filtered, and
   * only of groups, which paint nothing of their own.
   */
  readonly elements: readonly PlacedElement[];
}

export type ReviewSceneResult =
  | { readonly ok: true; readonly scene: ReviewScene }
  | { readonly ok: false; readonly failure: ReviewSceneFailure };

/**
 * The one place a matrix becomes SVG syntax.
 *
 * `Matrix2D`'s field names are already SVG's `a b c d e f` for column-vector
 * composition, so this is a spelling rather than a translation. It does not
 * multiply, invert, round, clamp or reorder: if it ever needed to, the answer
 * would belong in `@embroidery/design-engine`.
 */
function svgMatrix(matrix: Matrix2D): string {
  const { a, b, c, d, e, f } = matrix;
  return `matrix(${String(a)} ${String(b)} ${String(c)} ${String(d)} ${String(e)} ${String(f)})`;
}

/**
 * The controlled family for a text element, or `undefined` when there is none.
 *
 * `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE` is the registry's own locked fallback
 * policy, so an unknown `fontId` is refused rather than substituted. A
 * substituted face has different metrics: the design would be shown — and, once
 * approved, stitched — at a shape the customer never saw, with nothing on
 * screen saying so.
 */
function controlledFamily(element: DesignElement): string | undefined {
  if (element.type !== 'text') return undefined;
  return findControlledFont(element.fontId)?.family;
}

/**
 * Builds the read-only scene from a stored Design Document, or says why it
 * could not.
 *
 * Accepts `unknown` deliberately. The document arrives over the wire as a
 * generated transport type that no runtime check has been through, and this
 * function's first act is to hand it to the one validator that decides whether
 * it is a document at all. A signature that already claimed `DesignDocument`
 * would be asserting the very thing being checked.
 *
 * Both delivered schema versions travel this path unchanged — `1` for the
 * Catalog branch, `2` for the customer-owned-product branch, where the catalog
 * placement pair is `null`. Neither is converted to the other; the difference
 * lives entirely in `@embroidery/design-document`, and this adapter never reads
 * `productSideId` or `embroideryAreaId` at all.
 */
export function buildReviewScene(payload: unknown): ReviewSceneResult {
  const validated = validateDesignDocumentStructure(payload);
  if (!validated.ok) return { ok: false, failure: 'UNREADABLE_DOCUMENT' };

  const document = validated.value;
  const graph = buildElementGraph(document);
  if (structuralFinding(graph) !== undefined) {
    return { ok: false, failure: 'UNRESOLVABLE_GEOMETRY' };
  }

  const elements: PlacedElement[] = [];
  for (const element of document.elements) {
    // A group is structure, not paint: its transform is already composed into
    // every descendant's effective matrix, so drawing one would place its
    // children twice.
    if (element.type === 'group') continue;

    const resolved = resolveEffectiveTransform(graph, element.id);
    if (isGeometryFinding(resolved)) return { ok: false, failure: 'UNRESOLVABLE_GEOMETRY' };

    if (element.type === 'text' && controlledFamily(element) === undefined) {
      return { ok: false, failure: 'UNCONTROLLED_FONT' };
    }

    elements.push({
      id: element.id,
      element,
      transform: svgMatrix(resolved.matrix),
    });
  }

  return {
    ok: true,
    scene: {
      canvasWidthPx: document.placement.canvasWidthPx,
      canvasHeightPx: document.placement.canvasHeightPx,
      elements,
    },
  };
}

/**
 * The controlled CSS family for a placed text element, `null` otherwise.
 *
 * Resolved on the way out rather than stored on {@link PlacedElement} so the
 * placed element stays exactly "the document's element plus where it lands".
 */
export function placedFontFamily(placed: PlacedElement): string | null {
  return controlledFamily(placed.element) ?? null;
}
