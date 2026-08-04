/**
 * Turning a requested placement into the writes that realise it (`APP3-B01`).
 *
 * Pure: no repository, no transaction, no clock. Everything that decides *what*
 * a replace means lives here and is unit-testable without a database, which
 * matters because the interesting cases — a contested code, a row addressed
 * from the wrong parent, an area that leaves the canvas, a replacement pointing
 * across products — are all decisions, not persistence.
 *
 * Two shapes of rule, kept apart deliberately:
 *
 * - **Validation** refuses a request the store must not accept. It runs to
 *   completion before a single write is planned, so one bad side leaves the
 *   existing placement exactly as it was.
 * - **Reconciliation** works out which current rows are retained, which are new
 *   and which are gone. "Gone" never means deleted: IMP-D041 PO-07 makes
 *   retirement the removal path, so an omitted row is retired and stays
 *   readable for the Template or Session that already referenced it.
 */
import type {
  EmbroideryAreaId,
  ProductId,
  ProductSideId,
} from '../domain/repositories/placement-hierarchy.port';
import type {
  CreateAreaInput,
  CreateSideInput,
  PlacementAreaRow,
  PlacementSideRow,
  UpdateAreaFields,
  UpdateSideFields,
} from '../domain/repositories/product-placement.repository';
import { productPlacementError } from '../domain/product-placement.errors';
import { PLACEMENT_CODE } from '../domain/product-placement.policy';
import { assertAreaWithinCanvas, assertSideScaleConsistent } from './product-placement-geometry';

export interface AreaCommand {
  readonly id?: string | undefined;
  readonly supersedesId?: string | undefined;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly boundXPx: number;
  readonly boundYPx: number;
  readonly boundWidthPx: number;
  readonly boundHeightPx: number;
  readonly maxWidthMm?: number | undefined;
  readonly maxHeightMm?: number | undefined;
}

export interface SideCommand {
  readonly id?: string | undefined;
  readonly supersedesId?: string | undefined;
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
  readonly backgroundAssetId: string;
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly pxPerMm: number;
  readonly areas: readonly AreaCommand[];
}

/** One retirement, with the replacement row that supersedes it when there is one. */
export interface Retirement<Id> {
  readonly id: Id;
  readonly supersededById?: Id | undefined;
}

export interface SidePlan {
  readonly created: readonly (CreateSideInput & { readonly supersedesId?: string })[];
  readonly updated: readonly { readonly id: ProductSideId; readonly fields: UpdateSideFields }[];
  readonly retired: readonly Retirement<ProductSideId>[];
}

export interface AreaPlan {
  readonly created: readonly (CreateAreaInput & { readonly supersedesId?: string })[];
  readonly updated: readonly { readonly id: EmbroideryAreaId; readonly fields: UpdateAreaFields }[];
  readonly retired: readonly Retirement<EmbroideryAreaId>[];
}

const CODE_PATTERN = new RegExp(PLACEMENT_CODE);

/** The number a `numeric` column is written back as. */
const decimal = (value: number): string => String(value);

function requireUniqueCodes(commands: readonly { readonly code: string }[]): void {
  const seen = new Set<string>();
  for (const command of commands) {
    if (!CODE_PATTERN.test(command.code)) {
      throw productPlacementError('PLACEMENT_INVALID', ['CODE_FORMAT']);
    }
    if (seen.has(command.code)) {
      throw productPlacementError('PLACEMENT_CODE_DUPLICATE');
    }
    seen.add(command.code);
  }
}

/**
 * Every retained id must name a current row of the addressed parent.
 *
 * The path is the authority, never the body (IMP-D041 PO-01): a request that
 * named a side of another Product would otherwise re-parent it, and the FK would
 * be perfectly satisfied while the side moved between products.
 */
function requireOwnedIds(ids: readonly (string | undefined)[], owned: ReadonlySet<string>): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === undefined) continue;
    if (!owned.has(id) || seen.has(id)) {
      throw productPlacementError('PLACEMENT_ROW_NOT_IN_PARENT');
    }
    seen.add(id);
  }
}

/**
 * A replacement must name a live sibling that this request is retiring.
 *
 * Same parent, because a side may only be superseded within its Product and an
 * area within its Side — the database trigger says so too, but a request that
 * reached it would get a 23000 whose message names the table. And the target
 * must be **absent** from the payload: a row cannot be both retained and
 * replaced, and accepting that would leave two live rows claiming one identity.
 */
function requireReplacementTargets(
  commands: readonly {
    readonly supersedesId?: string | undefined;
    readonly id?: string | undefined;
  }[],
  owned: ReadonlySet<string>,
): void {
  const retained = new Set(commands.map((command) => command.id).filter(isString));
  for (const command of commands) {
    const target = command.supersedesId;
    if (target === undefined) continue;
    if (!owned.has(target) || retained.has(target) || target === command.id) {
      throw productPlacementError('PLACEMENT_REPLACEMENT_INVALID');
    }
  }
}

const isString = (value: string | undefined): value is string => value !== undefined;

/** Only the columns whose value actually differs from what is stored. */
function changedSideFields(command: SideCommand, current: PlacementSideRow): UpdateSideFields {
  const fields: Record<string, unknown> = {};
  if (command.code !== current.code) fields['code'] = command.code;
  if (command.name !== current.name) fields['name'] = command.name;
  if (command.displayOrder !== current.displayOrder) fields['displayOrder'] = command.displayOrder;
  if (command.backgroundAssetId !== current.backgroundAssetId) {
    fields['backgroundAssetId'] = command.backgroundAssetId;
  }
  if (command.imageWidthPx !== current.imageWidthPx) fields['imageWidthPx'] = command.imageWidthPx;
  if (command.imageHeightPx !== current.imageHeightPx) {
    fields['imageHeightPx'] = command.imageHeightPx;
  }
  // Numeric comparison is by value, not by text: `5.0` and `5` are the same
  // scale, and treating them as a change would make an untouched referenced
  // side fail the protection guard on every save.
  if (!sameDecimal(command.physicalWidthMm, current.physicalWidthMm)) {
    fields['physicalWidthMm'] = decimal(command.physicalWidthMm);
  }
  if (!sameDecimal(command.physicalHeightMm, current.physicalHeightMm)) {
    fields['physicalHeightMm'] = decimal(command.physicalHeightMm);
  }
  if (!sameDecimal(command.pxPerMm, current.pxPerMm)) {
    fields['pxPerMm'] = decimal(command.pxPerMm);
  }
  return fields;
}

function changedAreaFields(command: AreaCommand, current: PlacementAreaRow): UpdateAreaFields {
  const fields: Record<string, unknown> = {};
  if (command.code !== current.code) fields['code'] = command.code;
  if (command.name !== current.name) fields['name'] = command.name;
  if (command.displayOrder !== current.displayOrder) fields['displayOrder'] = command.displayOrder;
  for (const [key, next, stored] of [
    ['boundXPx', command.boundXPx, current.boundXPx],
    ['boundYPx', command.boundYPx, current.boundYPx],
    ['boundWidthPx', command.boundWidthPx, current.boundWidthPx],
    ['boundHeightPx', command.boundHeightPx, current.boundHeightPx],
  ] as const) {
    if (!sameDecimal(next, stored)) fields[key] = decimal(next);
  }
  for (const [key, next, stored] of [
    ['maxWidthMm', command.maxWidthMm, current.maxWidthMm],
    ['maxHeightMm', command.maxHeightMm, current.maxHeightMm],
  ] as const) {
    if (next === undefined && stored !== undefined) fields[key] = null;
    else if (next !== undefined && (stored === undefined || !sameDecimal(next, stored))) {
      fields[key] = decimal(next);
    }
  }
  return fields;
}

function sameDecimal(next: number, stored: string): boolean {
  return Number(stored) === next;
}

/**
 * The complete plan for one replace.
 *
 * Ids for new rows are supplied by the caller rather than generated here, so the
 * function stays pure and a test can assert the exact plan it produces.
 */
export function planPlacementReplace(input: {
  readonly productId: ProductId;
  readonly commands: readonly SideCommand[];
  readonly currentSides: readonly PlacementSideRow[];
  readonly currentAreas: readonly PlacementAreaRow[];
  readonly nextId: () => string;
}): { readonly sides: SidePlan; readonly areas: AreaPlan } {
  const { commands, currentSides, currentAreas } = input;

  requireUniqueCodes(commands);
  const ownedSideIds = new Set<string>(currentSides.map((side) => side.id));
  requireOwnedIds(
    commands.map((command) => command.id),
    ownedSideIds,
  );
  requireReplacementTargets(commands, ownedSideIds);

  const sideById = new Map(currentSides.map((side) => [side.id as string, side]));
  const areasBySide = new Map<string, PlacementAreaRow[]>();
  for (const area of currentAreas) {
    const list = areasBySide.get(area.productSideId) ?? [];
    list.push(area);
    areasBySide.set(area.productSideId, list);
  }

  const sidesCreated: (CreateSideInput & { supersedesId?: string })[] = [];
  const sidesUpdated: { id: ProductSideId; fields: UpdateSideFields }[] = [];
  const areasCreated: (CreateAreaInput & { supersedesId?: string })[] = [];
  const areasUpdated: { id: EmbroideryAreaId; fields: UpdateAreaFields }[] = [];
  const retainedSideIds = new Set<string>();
  const retainedAreaIds = new Set<string>();

  for (const command of commands) {
    assertSideScaleConsistent(command, command.id ?? 'new');
    const sideId = (command.id ?? input.nextId()) as ProductSideId;

    if (command.id === undefined) {
      sidesCreated.push({
        id: sideId,
        productId: input.productId,
        code: command.code,
        name: command.name,
        displayOrder: command.displayOrder,
        backgroundAssetId: command.backgroundAssetId,
        imageWidthPx: command.imageWidthPx,
        imageHeightPx: command.imageHeightPx,
        physicalWidthMm: decimal(command.physicalWidthMm),
        physicalHeightMm: decimal(command.physicalHeightMm),
        pxPerMm: decimal(command.pxPerMm),
        ...(command.supersedesId === undefined ? {} : { supersedesId: command.supersedesId }),
      });
    } else {
      retainedSideIds.add(command.id);
      const current = sideById.get(command.id);
      if (current === undefined) throw productPlacementError('PLACEMENT_ROW_NOT_IN_PARENT');
      const fields = changedSideFields(command, current);
      if (Object.keys(fields).length > 0) sidesUpdated.push({ id: sideId, fields });
    }

    planAreas(command, sideId, {
      currentAreas: areasBySide.get(sideId) ?? [],
      created: areasCreated,
      updated: areasUpdated,
      retained: retainedAreaIds,
      nextId: input.nextId,
    });
  }

  return {
    sides: {
      created: sidesCreated,
      updated: sidesUpdated,
      retired: retirements(currentSides, retainedSideIds, sidesCreated),
    },
    areas: {
      created: areasCreated,
      updated: areasUpdated,
      retired: retirements(currentAreas, retainedAreaIds, areasCreated),
    },
  };
}

function planAreas(
  command: SideCommand,
  sideId: ProductSideId,
  context: {
    readonly currentAreas: readonly PlacementAreaRow[];
    readonly created: (CreateAreaInput & { supersedesId?: string })[];
    readonly updated: { id: EmbroideryAreaId; fields: UpdateAreaFields }[];
    readonly retained: Set<string>;
    readonly nextId: () => string;
  },
): void {
  requireUniqueCodes(command.areas);
  const owned = new Set<string>(context.currentAreas.map((area) => area.id));
  requireOwnedIds(
    command.areas.map((area) => area.id),
    owned,
  );
  requireReplacementTargets(command.areas, owned);
  const areaById = new Map(context.currentAreas.map((area) => [area.id as string, area]));

  for (const area of command.areas) {
    assertAreaWithinCanvas(command, area);
    if (area.id === undefined) {
      context.created.push({
        id: context.nextId() as EmbroideryAreaId,
        productSideId: sideId,
        code: area.code,
        name: area.name,
        displayOrder: area.displayOrder,
        boundXPx: decimal(area.boundXPx),
        boundYPx: decimal(area.boundYPx),
        boundWidthPx: decimal(area.boundWidthPx),
        boundHeightPx: decimal(area.boundHeightPx),
        maxWidthMm: area.maxWidthMm === undefined ? undefined : decimal(area.maxWidthMm),
        maxHeightMm: area.maxHeightMm === undefined ? undefined : decimal(area.maxHeightMm),
        ...(area.supersedesId === undefined ? {} : { supersedesId: area.supersedesId }),
      });
      continue;
    }
    context.retained.add(area.id);
    const current = areaById.get(area.id);
    if (current === undefined) throw productPlacementError('PLACEMENT_ROW_NOT_IN_PARENT');
    const fields = changedAreaFields(area, current);
    if (Object.keys(fields).length > 0) {
      context.updated.push({ id: area.id as EmbroideryAreaId, fields });
    }
  }
}

/**
 * Which current rows this request removed, and by what.
 *
 * An already-retired row is left alone: retiring it again would move its
 * `retired_at` and rewrite history for no reason. A row named by a new row's
 * `supersedesId` is retired *with* the pointer, which is the only way the two
 * halves of a replacement stay attached.
 */
function retirements<
  Id extends string,
  Row extends { readonly id: Id; readonly retiredAt: Date | undefined },
>(
  current: readonly Row[],
  retained: ReadonlySet<string>,
  created: readonly { readonly id: string; readonly supersedesId?: string }[],
): Retirement<Id>[] {
  const replacementFor = new Map<string, string>();
  for (const row of created) {
    if (row.supersedesId !== undefined) replacementFor.set(row.supersedesId, row.id);
  }
  return current
    .filter((row) => !retained.has(row.id) && row.retiredAt === undefined)
    .map((row) => {
      const replacement = replacementFor.get(row.id);
      return replacement === undefined
        ? { id: row.id }
        : { id: row.id, supersededById: replacement as Id };
    });
}
