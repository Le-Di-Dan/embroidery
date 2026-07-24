/**
 * APP0-R01 spike-only engine-neutral design document.
 *
 * This is NOT the production schema. `packages/design-document` owns the real
 * types, validation, canonical serialization and migrations (ADR-DB1-012). This
 * file exists only to prove that a renderer can be driven from, and serialized
 * back to, a document that knows nothing about any rendering engine.
 *
 * Hard rules proven by the adapters and tests:
 *  - no engine-native node, DOM element, function or object URL is representable;
 *  - selection / hover / handles / viewport are NOT part of the document;
 *  - the watermark is NOT part of the document (preview policy, see harness);
 *  - assets are referenced by id + derivative kind, never inlined;
 *  - array order is z-order and is significant (JCS does not reorder arrays).
 */

export const SPIKE_SCHEMA_VERSION = 1;

export type ElementType = 'text' | 'image' | 'svg' | 'shape' | 'group';

export type ProductSideId = 'front' | 'back';

/** Fields shared by every element. Order-independent; array index is z-order. */
export interface BaseElement {
  readonly id: string;
  readonly type: ElementType;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly rotationDeg: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly opacity: number;
  readonly visible: boolean;
  readonly locked: boolean;
  /** Parent group id, or null for a top-level element. */
  readonly groupId: string | null;
}

export interface TextCurve {
  readonly radiusPx: number;
  readonly direction: 'up' | 'down';
}

export interface TextElement extends BaseElement {
  readonly type: 'text';
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSizePx: number;
  readonly align: 'left' | 'center' | 'right';
  readonly lineHeight: number;
  readonly letterSpacingPx: number;
  /** Thread colour reference (catalogue code), not a free-form colour. */
  readonly threadColorCode: string;
  readonly threadColorHex: string;
  readonly curve: TextCurve | null;
}

/** Raster and SVG elements reference an approved derivative, never an original. */
export interface AssetRef {
  readonly assetId: string;
  readonly derivative: 'editor-preview';
  readonly url: string;
}

export interface ImageElement extends BaseElement {
  readonly type: 'image';
  readonly asset: AssetRef;
  readonly cropPct: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
}

export interface SvgElement extends BaseElement {
  readonly type: 'svg';
  readonly asset: AssetRef;
  readonly recolorHex: string | null;
}

export interface ShapeElement extends BaseElement {
  readonly type: 'shape';
  readonly shape: 'rect' | 'ellipse';
  readonly fillHex: string;
  readonly strokeHex: string;
  readonly strokeWidthPx: number;
  readonly cornerRadiusPx: number;
}

export interface GroupElement extends BaseElement {
  readonly type: 'group';
  readonly childIds: readonly string[];
}

export type DesignElement = TextElement | ImageElement | SvgElement | ShapeElement | GroupElement;

export interface EmbroideryArea {
  readonly id: string;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface ProductSide {
  readonly sideId: ProductSideId;
  readonly label: string;
  readonly backgroundAsset: AssetRef;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly area: EmbroideryArea;
}

export interface SpikeDesignDocument {
  readonly schemaVersion: number;
  readonly documentId: string;
  readonly productSide: ProductSide;
  /** Array order is z-order, bottom first. */
  readonly elements: readonly DesignElement[];
}

/**
 * Runtime-only state. Deliberately a separate type so it is structurally
 * impossible to hand it to the serializer.
 */
export interface Viewport {
  readonly zoom: number;
  readonly panXPx: number;
  readonly panYPx: number;
}

export interface TransformPatch {
  readonly dxPx?: number;
  readonly dyPx?: number;
  readonly dWidthPx?: number;
  readonly dHeightPx?: number;
  readonly dRotationDeg?: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
  readonly opacity?: number;
}
