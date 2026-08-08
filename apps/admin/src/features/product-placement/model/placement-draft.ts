/**
 * The editable placement draft.
 *
 * Every numeric field is held as the **string the operator typed**, not as a
 * parsed number. `APP3-A01` §17 forbids silently clamping a value and persisting
 * something else, and a parse-on-keystroke draft does exactly that: `12.` and
 * `0.30` and an empty field all collapse to a number that is not what is on
 * screen. Parsing happens once, when the body is built, and what cannot be
 * parsed is reported as a field error instead of being rounded into something
 * plausible.
 *
 * `key` is a local React identity and never leaves the browser. `id` is the
 * server's identity: present means "retain and update this row", `null` means
 * "create". The two are deliberately separate values — reusing a generated
 * client id as a server id is how a new row silently claims an existing one.
 */
import type { PlacementArea, PlacementModel, PlacementSide } from './placement-model';

export interface AreaDraft {
  readonly key: string;
  readonly id: string | null;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: string;
  readonly boundXPx: string;
  readonly boundYPx: string;
  readonly boundWidthPx: string;
  readonly boundHeightPx: string;
  readonly maxWidthMm: string;
  readonly maxHeightMm: string;
  /** Server truth, not editable here: a retired row stays visible as history. */
  readonly retiredAt: string | null;
  readonly supersededById: string | null;
  /** The row this new row replaces, within the same side. */
  readonly supersedesId: string | null;
  /** Marked for retirement on the next save — omitted from the body. */
  readonly removed: boolean;
}

export interface SideDraft {
  readonly key: string;
  readonly id: string | null;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: string;
  readonly backgroundAssetId: string;
  readonly imageWidthPx: string;
  readonly imageHeightPx: string;
  readonly physicalWidthMm: string;
  readonly physicalHeightMm: string;
  readonly pxPerMm: string;
  readonly retiredAt: string | null;
  readonly supersededById: string | null;
  readonly supersedesId: string | null;
  readonly removed: boolean;
  readonly areas: readonly AreaDraft[];
}

export interface PlacementDraft {
  readonly productId: string;
  /** The token this draft was seeded from; echoed back on save. */
  readonly expectedUpdatedAt: string;
  readonly sides: readonly SideDraft[];
}

/**
 * A local row identity.
 *
 * Deliberately not a UUID. `crypto.randomUUID` is secure-context-only, and a
 * value that *looks* like a server id invites exactly the confusion `id` and
 * `key` exist to prevent. This shape can never be mistaken for one.
 */
let sequence = 0;
export function nextDraftKey(prefix: string): string {
  sequence += 1;
  return `draft-${prefix}-${String(sequence)}`;
}

/** Numbers reach the draft as text, in the operator's own notation. */
function text(value: number): string {
  return String(value);
}

function optionalText(value: number | null): string {
  return value === null ? '' : String(value);
}

export function areaDraftOf(area: PlacementArea): AreaDraft {
  return {
    key: nextDraftKey('area'),
    id: area.id,
    code: area.code,
    name: area.name,
    displayOrder: text(area.displayOrder),
    boundXPx: text(area.boundXPx),
    boundYPx: text(area.boundYPx),
    boundWidthPx: text(area.boundWidthPx),
    boundHeightPx: text(area.boundHeightPx),
    maxWidthMm: optionalText(area.maxWidthMm),
    maxHeightMm: optionalText(area.maxHeightMm),
    retiredAt: area.retiredAt,
    supersededById: area.supersededById,
    supersedesId: null,
    removed: false,
  };
}

export function sideDraftOf(side: PlacementSide): SideDraft {
  return {
    key: nextDraftKey('side'),
    id: side.id,
    code: side.code,
    name: side.name,
    displayOrder: text(side.displayOrder),
    backgroundAssetId: side.backgroundAssetId,
    imageWidthPx: text(side.imageWidthPx),
    imageHeightPx: text(side.imageHeightPx),
    physicalWidthMm: text(side.physicalWidthMm),
    physicalHeightMm: text(side.physicalHeightMm),
    pxPerMm: text(side.pxPerMm),
    retiredAt: side.retiredAt,
    supersededById: side.supersededById,
    supersedesId: null,
    removed: false,
    areas: side.areas.map(areaDraftOf),
  };
}

/** Seeds a draft from the authoritative server snapshot. */
export function draftOf(model: PlacementModel): PlacementDraft {
  return {
    productId: model.productId,
    expectedUpdatedAt: model.updatedAt,
    sides: model.sides.map(sideDraftOf),
  };
}

export function emptyAreaDraft(): AreaDraft {
  return {
    key: nextDraftKey('area'),
    id: null,
    code: '',
    name: '',
    displayOrder: '0',
    boundXPx: '0',
    boundYPx: '0',
    boundWidthPx: '',
    boundHeightPx: '',
    maxWidthMm: '',
    maxHeightMm: '',
    retiredAt: null,
    supersededById: null,
    supersedesId: null,
    removed: false,
  };
}

export function emptySideDraft(): SideDraft {
  return {
    key: nextDraftKey('side'),
    id: null,
    code: '',
    name: '',
    displayOrder: '0',
    backgroundAssetId: '',
    imageWidthPx: '',
    imageHeightPx: '',
    physicalWidthMm: '',
    physicalHeightMm: '',
    pxPerMm: '',
    retiredAt: null,
    supersededById: null,
    supersedesId: null,
    removed: false,
    areas: [],
  };
}

/**
 * Whether the draft still matches the snapshot it was seeded from.
 *
 * Compared against the draft the *server* answer produces, not against a flag
 * some handler remembers to set — a flag drifts the first time a change is made
 * anywhere but the one place that maintains it.
 */
export function isDirty(draft: PlacementDraft, model: PlacementModel): boolean {
  return !sameSides(draft.sides, draftOf(model).sides);
}

function sameSides(left: readonly SideDraft[], right: readonly SideDraft[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((side, index) => {
    const other = right[index];
    return other !== undefined && sameSide(side, other) && sameAreas(side.areas, other.areas);
  });
}

function sameAreas(left: readonly AreaDraft[], right: readonly AreaDraft[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((area, index) => {
    const other = right[index];
    return other !== undefined && sameArea(area, other);
  });
}

/** `key` is excluded on purpose: it is browser identity, not placement data. */
function sameSide(left: SideDraft, right: SideDraft): boolean {
  return (
    left.id === right.id &&
    left.code === right.code &&
    left.name === right.name &&
    left.displayOrder === right.displayOrder &&
    left.backgroundAssetId === right.backgroundAssetId &&
    left.imageWidthPx === right.imageWidthPx &&
    left.imageHeightPx === right.imageHeightPx &&
    left.physicalWidthMm === right.physicalWidthMm &&
    left.physicalHeightMm === right.physicalHeightMm &&
    left.pxPerMm === right.pxPerMm &&
    left.supersedesId === right.supersedesId &&
    left.removed === right.removed
  );
}

function sameArea(left: AreaDraft, right: AreaDraft): boolean {
  return (
    left.id === right.id &&
    left.code === right.code &&
    left.name === right.name &&
    left.displayOrder === right.displayOrder &&
    left.boundXPx === right.boundXPx &&
    left.boundYPx === right.boundYPx &&
    left.boundWidthPx === right.boundWidthPx &&
    left.boundHeightPx === right.boundHeightPx &&
    left.maxWidthMm === right.maxWidthMm &&
    left.maxHeightMm === right.maxHeightMm &&
    left.supersedesId === right.supersedesId &&
    left.removed === right.removed
  );
}
