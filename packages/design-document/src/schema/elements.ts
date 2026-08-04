/**
 * The v1 element model: plain data, one discriminated union, no renderer.
 *
 * Two properties are structural rather than stylistic. First, an element is
 * addressed by a stable opaque `id` and never by its array index — the array is
 * z-order, so an index changes the moment anything is restacked, and a group
 * that referenced indices would silently re-parent itself. Second, nothing here
 * can hold a renderer node, a DOM element, a function or an object URL: the
 * types are closed over JSON scalars, so the impossible state is unrepresentable
 * rather than merely rejected.
 *
 * Geometry is deliberately absent. `transform` stores persisted numbers;
 * composing them, rotating a box or asking whether it lands inside the
 * embroidery area is `packages/design-engine` (`APP3-P02`).
 */

/** Element kinds v1 supports. `svg` is not one: sanitized SVG arrives as an Asset. */
export type DesignElementType = 'text' | 'image' | 'shape' | 'freehand' | 'group';

export type TextAlign = 'left' | 'center' | 'right';
export type FontStyle = 'normal' | 'italic';
export type ShapeKind = 'rectangle' | 'ellipse' | 'line';

/** Persisted transform values. Finite numbers only; no matrix, no derived bounds. */
export interface DesignElementTransform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/** Fields every element carries, whatever its kind. */
export interface DesignElementBase {
  readonly id: string;
  readonly type: DesignElementType;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly transform: DesignElementTransform;
}

/**
 * Text references a server-owned `fontId` (IMP-D044 PO-10) — never a CSS
 * family, a font URL or font bytes, so a document can never ask a browser to
 * fetch something the server did not approve.
 */
export interface TextElement extends DesignElementBase {
  readonly type: 'text';
  readonly text: string;
  readonly fontId: string;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  readonly fontStyle: FontStyle;
  readonly textAlign: TextAlign;
  readonly fill: string;
}

/**
 * Image references an Asset **and** the exact approved derivative it was
 * measured against. `intrinsic*` is what the document believes; contextual
 * validation proves it equals the canonical derivative metadata, which is why
 * no storage key or source URL is needed or permitted here.
 */
export interface ImageElement extends DesignElementBase {
  readonly type: 'image';
  readonly assetId: string;
  readonly derivativeId: string;
  readonly intrinsicWidthPx: number;
  readonly intrinsicHeightPx: number;
}

export interface ShapeElement extends DesignElementBase {
  readonly type: 'shape';
  readonly shape: ShapeKind;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidthPx: number;
}

export interface FreehandPoint {
  readonly x: number;
  readonly y: number;
}

/** A bounded point sequence. No smoothing, simplification or path generation. */
export interface FreehandElement extends DesignElementBase {
  readonly type: 'freehand';
  readonly points: readonly FreehandPoint[];
  readonly stroke: string;
  readonly strokeWidthPx: number;
}

/**
 * A group names its children by id and does not contain them. Membership is a
 * relationship, so grouping never rewrites top-level z-order — which is what
 * lets a customer group two elements without anything moving on screen.
 */
export interface GroupElement extends DesignElementBase {
  readonly type: 'group';
  readonly childIds: readonly string[];
}

export type DesignElement =
  TextElement | ImageElement | ShapeElement | FreehandElement | GroupElement;
