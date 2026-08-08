/**
 * Local feedback on placement geometry, in the operator's own units.
 *
 * The server is the final authority — `APP3-B01` re-validates everything inside
 * its transaction and may still refuse. This exists so the obvious mistakes
 * (a bound past the canvas edge, three numbers that imply two different scales)
 * are visible while typing instead of after a round trip.
 *
 * The two geometric rules are stated to match `@embroidery/design-engine`
 * exactly, including the parts that are easy to get subtly wrong:
 *
 * - containment is **boundary-inclusive** (`PO-09`), so an area flush with the
 *   right edge passes and one unit past it does not;
 * - scale agreement is compared **on the quantization grid**, not with an
 *   epsilon — `quantize(px / mm) === quantize(pxPerMm)` on both axes.
 *
 * The engine is not imported. It is a `dist`-built workspace package the Admin
 * app does not currently depend on, and `APP3-A01` §14 pre-authorizes that link
 * only when it is actually needed; two lines of arithmetic pinned by tests do
 * not need it. Should this feature ever require real transform maths, the link
 * is the right answer and this module is the seam to replace.
 */
import type { AreaDraft, PlacementDraft, SideDraft } from './placement-draft';

/** `DESIGN_DOCUMENT_QUANTIZATION_SCALE`, mirrored (`IMP-D045`; APP0-R01 §4). */
const QUANTIZATION_SCALE = 10_000;

/** The generated contract's shared numeric ceiling. */
const MAX_MEASUREMENT = 1_000_000;
const MAX_DISPLAY_ORDER = 10_000;
const MAX_CODE_LENGTH = 64;
const MAX_NAME_LENGTH = 200;
const CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export type FieldErrors = Readonly<Record<string, string>>;

export interface DraftValidation {
  /** Keyed by draft `key`, then by field name. */
  readonly sides: Readonly<Record<string, FieldErrors>>;
  readonly areas: Readonly<Record<string, FieldErrors>>;
  /** True when nothing may be sent. */
  readonly invalid: boolean;
}

function quantize(value: number): number {
  return Math.round(value * QUANTIZATION_SCALE) / QUANTIZATION_SCALE;
}

/**
 * The typed text as a number, or `null` when it is not one.
 *
 * `Number('')` is `0` and `Number(' ')` is `0`, so an empty field would silently
 * become a real zero measurement. Both are rejected here instead.
 */
export function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

interface Copy {
  readonly required: string;
  readonly notNumber: string;
  readonly notPositive: string;
  readonly negative: string;
  readonly tooLarge: string;
  readonly codeFormat: string;
  readonly nameLength: string;
  readonly orderRange: string;
  readonly outsideCanvas: string;
  readonly scaleMismatch: string;
  readonly duplicateCode: string;
}

function checkCode(code: string, copy: Copy, seen: Set<string>): string | undefined {
  if (code.trim() === '') return copy.required;
  if (!CODE_PATTERN.test(code) || code.length > MAX_CODE_LENGTH) return copy.codeFormat;
  if (seen.has(code)) return copy.duplicateCode;
  seen.add(code);
  return undefined;
}

function checkName(name: string, copy: Copy): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return copy.required;
  return trimmed.length > MAX_NAME_LENGTH ? copy.nameLength : undefined;
}

function checkOrder(text: string, copy: Copy): string | undefined {
  const value = parseNumber(text);
  if (value === null) return text.trim() === '' ? copy.required : copy.notNumber;
  if (!Number.isInteger(value) || value < 0 || value > MAX_DISPLAY_ORDER) return copy.orderRange;
  return undefined;
}

/** A measurement that must be present and strictly greater than zero. */
function checkPositive(text: string, copy: Copy): string | undefined {
  const value = parseNumber(text);
  if (value === null) return text.trim() === '' ? copy.required : copy.notNumber;
  if (value <= 0) return copy.notPositive;
  return value > MAX_MEASUREMENT ? copy.tooLarge : undefined;
}

/** An origin, which may legitimately be zero. */
function checkOrigin(text: string, copy: Copy): string | undefined {
  const value = parseNumber(text);
  if (value === null) return text.trim() === '' ? copy.required : copy.notNumber;
  if (value < 0) return copy.negative;
  return value > MAX_MEASUREMENT ? copy.tooLarge : undefined;
}

/** An optional physical maximum: absent means "the side is the only limit". */
function checkOptionalPositive(text: string, copy: Copy): string | undefined {
  if (text.trim() === '') return undefined;
  const value = parseNumber(text);
  if (value === null) return copy.notNumber;
  if (value <= 0) return copy.notPositive;
  return value > MAX_MEASUREMENT ? copy.tooLarge : undefined;
}

/**
 * Both axes must imply the recorded scale.
 *
 * Reported on `pxPerMm` because that is the one value the operator can correct
 * without changing what the side physically is.
 */
export function scaleAgrees(side: SideDraft): boolean {
  const imageWidth = parseNumber(side.imageWidthPx);
  const imageHeight = parseNumber(side.imageHeightPx);
  const physicalWidth = parseNumber(side.physicalWidthMm);
  const physicalHeight = parseNumber(side.physicalHeightMm);
  const scale = parseNumber(side.pxPerMm);
  if (
    imageWidth === null ||
    imageHeight === null ||
    physicalWidth === null ||
    physicalHeight === null ||
    scale === null ||
    physicalWidth <= 0 ||
    physicalHeight <= 0 ||
    scale <= 0
  ) {
    return true; // A missing or unparsable number is already its own error.
  }
  return (
    quantize(imageWidth / physicalWidth) === quantize(scale) &&
    quantize(imageHeight / physicalHeight) === quantize(scale)
  );
}

/**
 * Whether the area lies wholly inside its side's canvas, boundary included.
 *
 * Returns `true` when any input is missing: an incomplete row has a field error
 * already, and adding a containment error on top would report the same mistake
 * twice.
 */
export function areaWithinCanvas(side: SideDraft, area: AreaDraft): boolean {
  const canvasWidth = parseNumber(side.imageWidthPx);
  const canvasHeight = parseNumber(side.imageHeightPx);
  const x = parseNumber(area.boundXPx);
  const y = parseNumber(area.boundYPx);
  const width = parseNumber(area.boundWidthPx);
  const height = parseNumber(area.boundHeightPx);
  if (
    canvasWidth === null ||
    canvasHeight === null ||
    x === null ||
    y === null ||
    width === null ||
    height === null
  ) {
    return true;
  }
  return (
    quantize(x) >= 0 &&
    quantize(y) >= 0 &&
    quantize(x + width) <= quantize(canvasWidth) &&
    quantize(y + height) <= quantize(canvasHeight)
  );
}

function validateArea(
  side: SideDraft,
  area: AreaDraft,
  copy: Copy,
  codes: Set<string>,
): FieldErrors {
  const errors: Record<string, string> = {};
  const set = (field: string, message: string | undefined) => {
    if (message !== undefined) errors[field] = message;
  };

  set('code', checkCode(area.code, copy, codes));
  set('name', checkName(area.name, copy));
  set('displayOrder', checkOrder(area.displayOrder, copy));
  set('boundXPx', checkOrigin(area.boundXPx, copy));
  set('boundYPx', checkOrigin(area.boundYPx, copy));
  set('boundWidthPx', checkPositive(area.boundWidthPx, copy));
  set('boundHeightPx', checkPositive(area.boundHeightPx, copy));
  set('maxWidthMm', checkOptionalPositive(area.maxWidthMm, copy));
  set('maxHeightMm', checkOptionalPositive(area.maxHeightMm, copy));

  if (Object.keys(errors).length === 0 && !areaWithinCanvas(side, area)) {
    errors['boundWidthPx'] = copy.outsideCanvas;
  }
  return errors;
}

function validateSide(side: SideDraft, copy: Copy, codes: Set<string>): FieldErrors {
  const errors: Record<string, string> = {};
  const set = (field: string, message: string | undefined) => {
    if (message !== undefined) errors[field] = message;
  };

  set('code', checkCode(side.code, copy, codes));
  set('name', checkName(side.name, copy));
  set('displayOrder', checkOrder(side.displayOrder, copy));
  set('backgroundAssetId', side.backgroundAssetId.trim() === '' ? copy.required : undefined);
  set('imageWidthPx', checkPositive(side.imageWidthPx, copy));
  set('imageHeightPx', checkPositive(side.imageHeightPx, copy));
  set('physicalWidthMm', checkPositive(side.physicalWidthMm, copy));
  set('physicalHeightMm', checkPositive(side.physicalHeightMm, copy));
  set('pxPerMm', checkPositive(side.pxPerMm, copy));

  if (errors['pxPerMm'] === undefined && !scaleAgrees(side)) {
    errors['pxPerMm'] = copy.scaleMismatch;
  }
  return errors;
}

/**
 * Validates every row that will actually be sent.
 *
 * A row marked `removed` is skipped: it is about to be omitted from the body
 * and retired, so refusing to save because a row nobody is keeping has a bad
 * code would block the very edit that fixes it. Retired rows are skipped for
 * the same reason — they are history, not input.
 */
export function validateDraft(draft: PlacementDraft, copy: Copy): DraftValidation {
  const sides: Record<string, FieldErrors> = {};
  const areas: Record<string, FieldErrors> = {};
  const sideCodes = new Set<string>();
  let invalid = false;

  for (const side of draft.sides) {
    if (side.removed || side.retiredAt !== null) continue;
    const sideErrors = validateSide(side, copy, sideCodes);
    if (Object.keys(sideErrors).length > 0) {
      sides[side.key] = sideErrors;
      invalid = true;
    }
    const areaCodes = new Set<string>();
    for (const area of side.areas) {
      if (area.removed || area.retiredAt !== null) continue;
      const areaErrors = validateArea(side, area, copy, areaCodes);
      if (Object.keys(areaErrors).length > 0) {
        areas[area.key] = areaErrors;
        invalid = true;
      }
    }
  }

  return { sides, areas, invalid };
}
