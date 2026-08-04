/**
 * Per-element structural validation.
 *
 * Every branch builds a fresh normalized element rather than casting the input.
 * That is deliberate: casting would let an unknown key ride along into
 * canonicalization, and rebuilding guarantees the value that gets hashed is the
 * value that was validated. It also means validation never mutates its input.
 */
import {
  DESIGN_DOCUMENT_FREEHAND_LIMITS as FREEHAND,
  DESIGN_DOCUMENT_VALUE_RANGES as RANGES,
} from '../schema/constants';
import type {
  DesignElement,
  DesignElementTransform,
  FreehandPoint,
  FontStyle,
  ShapeKind,
  TextAlign,
} from '../schema/elements';
import {
  type FindingCollector,
  isPlainObject,
  rejectUnknownKeys,
  requireBoolean,
  requireEnum,
  requireFinite,
  requireNfc,
  requirePositive,
  requirePositiveInteger,
  requireString,
} from './primitives';

const BASE_KEYS = ['id', 'type', 'visible', 'locked', 'opacity', 'transform'];
const TRANSFORM_KEYS = ['x', 'y', 'width', 'height', 'rotationDeg', 'scaleX', 'scaleY'];
const ELEMENT_TYPES = ['text', 'image', 'shape', 'freehand', 'group'] as const;
const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right'];
const FONT_STYLES: readonly FontStyle[] = ['normal', 'italic'];
const SHAPE_KINDS: readonly ShapeKind[] = ['rectangle', 'ellipse', 'line'];

function readTransform(
  source: Record<string, unknown>,
  path: string,
  collector: FindingCollector,
): DesignElementTransform | undefined {
  const raw = source.transform;
  if (!isPlainObject(raw)) {
    collector.invalid(`${path}.transform`, '"transform" must be an object.');
    return undefined;
  }
  rejectUnknownKeys(raw, TRANSFORM_KEYS, `${path}.transform`, collector);

  const at = `${path}.transform`;
  const x = requireFinite(raw, 'x', at, collector);
  const y = requireFinite(raw, 'y', at, collector);
  const width = requirePositive(raw, 'width', at, collector);
  const height = requirePositive(raw, 'height', at, collector);
  const rotationDeg = requireFinite(raw, 'rotationDeg', at, collector);
  const scaleX = requireFinite(raw, 'scaleX', at, collector);
  const scaleY = requireFinite(raw, 'scaleY', at, collector);

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    rotationDeg === undefined ||
    scaleX === undefined ||
    scaleY === undefined
  ) {
    return undefined;
  }
  // Scale is persisted state, not geometry: zero would erase the element and
  // is unrecoverable, so it is a shape error rather than a P02 bounds question.
  if (scaleX === 0 || scaleY === 0) {
    collector.invalid(at, 'Scale factors must be non-zero.');
    return undefined;
  }
  return { x, y, width, height, rotationDeg, scaleX, scaleY };
}

interface ElementBaseFields {
  readonly id: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly transform: DesignElementTransform;
}

function readBase(
  source: Record<string, unknown>,
  path: string,
  collector: FindingCollector,
): ElementBaseFields | undefined {
  const id = requireString(source, 'id', path, collector);
  const visible = requireBoolean(source, 'visible', path, collector);
  const locked = requireBoolean(source, 'locked', path, collector);
  const opacity = requireFinite(source, 'opacity', path, collector);
  const transform = readTransform(source, path, collector);

  if (opacity !== undefined && (opacity < RANGES.minOpacity || opacity > RANGES.maxOpacity)) {
    collector.invalid(`${path}.opacity`, '"opacity" must be between 0 and 1.');
    return undefined;
  }
  if (
    id === undefined ||
    visible === undefined ||
    locked === undefined ||
    opacity === undefined ||
    transform === undefined
  ) {
    return undefined;
  }
  return { id, visible, locked, opacity, transform };
}

function readFreehandPoints(
  source: Record<string, unknown>,
  path: string,
  collector: FindingCollector,
): readonly FreehandPoint[] | undefined {
  const raw = source.points;
  if (!Array.isArray(raw)) {
    collector.invalid(`${path}.points`, '"points" must be an array.');
    return undefined;
  }
  if (raw.length < FREEHAND.minPoints || raw.length > FREEHAND.maxPoints) {
    collector.invalid(
      `${path}.points`,
      `"points" must hold between ${String(FREEHAND.minPoints)} and ${String(FREEHAND.maxPoints)} points.`,
    );
    return undefined;
  }
  const points: FreehandPoint[] = [];
  for (const [index, candidate] of raw.entries()) {
    const at = `${path}.points[${String(index)}]`;
    if (!isPlainObject(candidate)) {
      collector.invalid(at, 'Each point must be an object.');
      return undefined;
    }
    rejectUnknownKeys(candidate, ['x', 'y'], at, collector);
    const x = requireFinite(candidate, 'x', at, collector);
    const y = requireFinite(candidate, 'y', at, collector);
    if (x === undefined || y === undefined) return undefined;
    points.push({ x, y });
  }
  return points;
}

function readChildIds(
  source: Record<string, unknown>,
  path: string,
  collector: FindingCollector,
): readonly string[] | undefined {
  const raw = source.childIds;
  if (!Array.isArray(raw)) {
    collector.invalid(`${path}.childIds`, '"childIds" must be an array of element ids.');
    return undefined;
  }
  const ids: string[] = [];
  for (const [index, candidate] of raw.entries()) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      collector.invalid(`${path}.childIds[${String(index)}]`, 'Each child id must be a string.');
      return undefined;
    }
    ids.push(candidate);
  }
  return ids;
}

/** Builds one validated element, or records why it could not be built. */
export function readElement(
  candidate: unknown,
  path: string,
  collector: FindingCollector,
): DesignElement | undefined {
  if (!isPlainObject(candidate)) {
    collector.invalid(path, 'Each element must be an object.');
    return undefined;
  }
  const type = requireEnum(candidate, 'type', ELEMENT_TYPES, path, collector);
  if (type === undefined) return undefined;

  const base = readBase(candidate, path, collector);

  switch (type) {
    case 'text': {
      rejectUnknownKeys(
        candidate,
        [
          ...BASE_KEYS,
          'text',
          'fontId',
          'fontSizePx',
          'fontWeight',
          'fontStyle',
          'textAlign',
          'fill',
        ],
        path,
        collector,
      );
      // Empty text is legal (a customer may clear a text box); non-NFC is not.
      const text = candidate.text;
      if (typeof text !== 'string') {
        collector.invalid(`${path}.text`, '"text" must be a string.');
      } else if (!requireNfc(text, `${path}.text`, collector)) {
        return undefined;
      }
      const fontId = requireString(candidate, 'fontId', path, collector);
      const fontSizePx = requirePositive(candidate, 'fontSizePx', path, collector);
      const fontWeight = requireFinite(candidate, 'fontWeight', path, collector);
      const fontStyle = requireEnum(candidate, 'fontStyle', FONT_STYLES, path, collector);
      const textAlign = requireEnum(candidate, 'textAlign', TEXT_ALIGNS, path, collector);
      const fill = requireString(candidate, 'fill', path, collector);
      if (fontSizePx !== undefined) {
        if (fontSizePx < RANGES.minFontSizePx || fontSizePx > RANGES.maxFontSizePx) {
          collector.invalid(`${path}.fontSizePx`, '"fontSizePx" is outside the supported range.');
          return undefined;
        }
      }
      if (fontWeight !== undefined && !Number.isInteger(fontWeight)) {
        collector.invalid(`${path}.fontWeight`, '"fontWeight" must be a whole number.');
        return undefined;
      }
      if (
        base === undefined ||
        typeof text !== 'string' ||
        fontId === undefined ||
        fontSizePx === undefined ||
        fontWeight === undefined ||
        fontStyle === undefined ||
        textAlign === undefined ||
        fill === undefined
      ) {
        return undefined;
      }
      return { ...base, type, text, fontId, fontSizePx, fontWeight, fontStyle, textAlign, fill };
    }
    case 'image': {
      rejectUnknownKeys(
        candidate,
        [...BASE_KEYS, 'assetId', 'derivativeId', 'intrinsicWidthPx', 'intrinsicHeightPx'],
        path,
        collector,
      );
      const assetId = requireString(candidate, 'assetId', path, collector);
      const derivativeId = requireString(candidate, 'derivativeId', path, collector);
      const intrinsicWidthPx = requirePositiveInteger(
        candidate,
        'intrinsicWidthPx',
        path,
        collector,
      );
      const intrinsicHeightPx = requirePositiveInteger(
        candidate,
        'intrinsicHeightPx',
        path,
        collector,
      );
      if (
        base === undefined ||
        assetId === undefined ||
        derivativeId === undefined ||
        intrinsicWidthPx === undefined ||
        intrinsicHeightPx === undefined
      ) {
        return undefined;
      }
      return { ...base, type, assetId, derivativeId, intrinsicWidthPx, intrinsicHeightPx };
    }
    case 'shape': {
      rejectUnknownKeys(
        candidate,
        [...BASE_KEYS, 'shape', 'fill', 'stroke', 'strokeWidthPx'],
        path,
        collector,
      );
      const shape = requireEnum(candidate, 'shape', SHAPE_KINDS, path, collector);
      const fill = requireString(candidate, 'fill', path, collector);
      const stroke = requireString(candidate, 'stroke', path, collector);
      const strokeWidthPx = requireFinite(candidate, 'strokeWidthPx', path, collector);
      if (strokeWidthPx !== undefined && strokeWidthPx < 0) {
        collector.invalid(`${path}.strokeWidthPx`, '"strokeWidthPx" must not be negative.');
        return undefined;
      }
      if (
        base === undefined ||
        shape === undefined ||
        fill === undefined ||
        stroke === undefined ||
        strokeWidthPx === undefined
      ) {
        return undefined;
      }
      return { ...base, type, shape, fill, stroke, strokeWidthPx };
    }
    case 'freehand': {
      rejectUnknownKeys(
        candidate,
        [...BASE_KEYS, 'points', 'stroke', 'strokeWidthPx'],
        path,
        collector,
      );
      const points = readFreehandPoints(candidate, path, collector);
      const stroke = requireString(candidate, 'stroke', path, collector);
      const strokeWidthPx = requirePositive(candidate, 'strokeWidthPx', path, collector);
      if (
        base === undefined ||
        points === undefined ||
        stroke === undefined ||
        strokeWidthPx === undefined
      ) {
        return undefined;
      }
      return { ...base, type, points, stroke, strokeWidthPx };
    }
    default: {
      rejectUnknownKeys(candidate, [...BASE_KEYS, 'childIds'], path, collector);
      const childIds = readChildIds(candidate, path, collector);
      if (base === undefined || childIds === undefined) return undefined;
      return { ...base, type: 'group', childIds };
    }
  }
}
