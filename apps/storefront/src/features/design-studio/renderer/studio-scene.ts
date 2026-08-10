/**
 * The renderer adapter (`APP3-S02`).
 *
 * One boundary, and it is the point of the checkpoint. On one side sit the two
 * authorities: `@embroidery/design-document` decides what a document *is*
 * (`APP3-P01`) and `@embroidery/design-engine` decides where everything *lands*
 * (`APP3-P02`, `IMP-D045`). On the other side sit React components that draw
 * SVG nodes. Nothing crosses except the plain data below.
 *
 * That separation is what `IMP-D026` and `ADR-APP0-001` describe as
 * "engine-neutral document + renderer adapter", and it is load-bearing rather
 * than tidy. A component that resolved its own matrix would be a second
 * geometry implementation the moment anyone touched it — and a second
 * implementation of a rule like "rotate about the untransformed local-box
 * centre, scale first" is indistinguishable from the first until a customer's
 * design is stitched in the wrong place. So this module composes no matrix,
 * expands no stroke, walks no parent chain and converts no unit. It asks, and
 * it serializes the answer.
 *
 * The whole module is pure: no React, no DOM, no fetch, no object URL, no
 * clock. It can therefore be tested by calling it, which is how the geometry
 * rules below are proved rather than eyeballed.
 */
import {
  findControlledFont,
  validateDesignDocumentStructure,
  type DesignDocument,
  type DesignElement,
} from '@embroidery/design-document';
import {
  buildElementGraph,
  getElementBounds,
  isGeometryFinding,
  resolveEffectiveTransform,
  structuralFinding,
  type Bounds2D,
  type Matrix2D,
} from '@embroidery/design-engine';

import { toSvgMatrix } from './studio-svg-matrix';

/**
 * Why a document could not be drawn.
 *
 * Three distinct causes, kept apart because they are three different truths
 * about the session and a customer support conversation turns on which one it
 * was. None of them carries the document, a path, an element id, an asset id or
 * a finding message: a stage that is refusing to render untrusted data must not
 * put that data on screen while it explains itself.
 */
export type StudioSceneFailure =
  /** `APP3-P01` refused the payload: wrong schema version, or malformed. */
  | 'unreadable-document'
  /** `APP3-P02` could not place something: an ambiguous graph, a cyclic group. */
  | 'unresolvable-geometry'
  /** A text element names a font outside the controlled registry (IMP-D044 PO-10). */
  | 'uncontrolled-font';

/** One element, already placed. Everything here came from P01 or P02. */
export interface RenderableElement {
  readonly id: string;
  /** The element exactly as the document holds it. Never a rewritten copy. */
  readonly element: DesignElement;
  /** `APP3-P02`'s effective transform, ancestors already composed in. */
  readonly matrix: Matrix2D;
  /** The same matrix in SVG syntax, so no component formats one. */
  readonly transform: string;
  /** `APP3-P02`'s transformed, stroke-aware AABB. The selection outline's geometry. */
  readonly bounds: Bounds2D;
  /**
   * The controlled font family for a text element, `null` for every other kind.
   *
   * Resolved here because the registry is document authority: a document stores
   * a `fontId` and never a CSS family, so turning one into the other is exactly
   * the kind of interpretation that belongs on this side of the boundary.
   */
  readonly fontFamily: string | null;
  /** Hidden elements are neither painted nor clickable (`APP3-S02` §15). */
  readonly visible: boolean;
}

export interface RenderableScene {
  /** The document's own placement canvas — the SVG coordinate system. */
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  /**
   * Drawable elements in canonical array order, bottom first.
   *
   * SVG has no `z-index`: document order **is** the stacking, and `APP3-P01`
   * defines the element array as z-order with the same convention. So this list
   * is never sorted, never reversed and never re-ranked — it is filtered, and
   * only of groups, which paint nothing of their own (PO-07).
   */
  readonly elements: readonly RenderableElement[];
}

export type StudioSceneResult =
  | { readonly ok: true; readonly scene: RenderableScene }
  | { readonly ok: false; readonly failure: StudioSceneFailure };

function failed(failure: StudioSceneFailure): StudioSceneResult {
  return { ok: false, failure };
}

/**
 * The controlled family for a text element, or `undefined` when there is none.
 *
 * `REJECT_IF_CONTROLLED_FONT_UNAVAILABLE` is the registry's own locked fallback
 * policy, so an unknown `fontId` is refused rather than substituted. A
 * substituted face has different metrics: the design would be shown — and later
 * stitched — at a shape the customer never approved, with nothing on screen
 * saying so.
 */
function controlledFamily(element: DesignElement): string | undefined {
  if (element.type !== 'text') return undefined;
  return findControlledFont(element.fontId)?.family;
}

/**
 * Builds the scene, or says why it could not.
 *
 * The document is validated by `APP3-P01` first and used only in the form P01
 * hands back. Nothing here repairs a field, supplies a default, drops an
 * offending element or coerces a value: a server-returned document that this
 * build cannot read is a fact to report, and a document silently "fixed" on
 * read is a document whose saved form no longer matches what the customer sees.
 *
 * A geometry finding fails the **whole** scene rather than skipping one
 * element. Skipping would draw a design missing a part, with nothing to
 * distinguish that from a design that never had one — which is precisely the
 * "malformed geometry must not look valid" rule. And an ambiguous parent graph
 * has no authoritative transform for *any* element, not merely the contested
 * one, because the contested child may be an ancestor of anything.
 */
export function buildRenderableScene(payload: unknown): StudioSceneResult {
  const validated = validateDesignDocumentStructure(payload);
  if (!validated.ok) return failed('unreadable-document');

  const document: DesignDocument = validated.value;
  const graph = buildElementGraph(document);
  if (structuralFinding(graph) !== undefined) return failed('unresolvable-geometry');

  const elements: RenderableElement[] = [];
  for (const element of document.elements) {
    // A group is structure, not paint: its transform is already composed into
    // every descendant's effective matrix, so drawing one would place its
    // children twice.
    if (element.type === 'group') continue;

    const resolved = resolveEffectiveTransform(graph, element.id);
    if (isGeometryFinding(resolved)) return failed('unresolvable-geometry');

    const bounds = getElementBounds(document, element.id, graph);
    if (isGeometryFinding(bounds as never)) return failed('unresolvable-geometry');

    const family = controlledFamily(element);
    if (element.type === 'text' && family === undefined) return failed('uncontrolled-font');

    elements.push({
      id: element.id,
      element,
      matrix: resolved.matrix,
      transform: toSvgMatrix(resolved.matrix),
      bounds: bounds as Bounds2D,
      fontFamily: family ?? null,
      visible: element.visible,
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
 * One placed element by id, or `undefined`.
 *
 * The selection outline's only way to reach geometry. Returning `undefined` for
 * an id that is no longer in the scene is what makes a stale selection resolve
 * to nothing instead of to a stale rectangle.
 */
export function resolveRenderableElement(
  scene: RenderableScene,
  elementId: string | null,
): RenderableElement | undefined {
  if (elementId === null) return undefined;
  return scene.elements.find((candidate) => candidate.id === elementId);
}

/** The bounds of the selected element, or `null`. Never a DOM measurement. */
export function resolveElementBounds(
  scene: RenderableScene,
  elementId: string | null,
): Bounds2D | null {
  return resolveRenderableElement(scene, elementId)?.bounds ?? null;
}

/** Whether an element may be clicked. Hidden elements are not (`APP3-S02` §15). */
export function isSelectable(renderable: RenderableElement): boolean {
  return renderable.visible;
}
