/**
 * Draft → `ReplaceProductPlacementBody`.
 *
 * The replace is a whole-model replacement, so what the body *omits* carries as
 * much meaning as what it contains:
 *
 * - a row with `id` is retained and updated;
 * - a row without `id` is created — the local `key` is never sent, because a
 *   fabricated identity is how a new row silently claims an existing one;
 * - a row that is omitted is **retired**, never deleted (`IMP-D041` PO-07).
 *
 * Already-retired rows are omitted too. The server leaves a row it has already
 * retired alone, so omitting one is a no-op — whereas resending it with its id
 * would ask to *retain* it, which is the opposite of what the screen shows.
 * They stay visible in the hierarchy as history; visibility is a UI concern and
 * the body is not where it is expressed.
 *
 * Nothing here sends a storage key, a URL, a parent id, session identity or a
 * server-only lifecycle field: the shape below is the complete set.
 */
import type { ReplacePlacementAreaBody, ReplacePlacementSideBody } from '@embroidery/api-client';
import type { ReplaceProductPlacementBody } from '@embroidery/api-client';

import type { AreaDraft, PlacementDraft, SideDraft } from './placement-draft';
import { parseNumber } from './placement-validation';

/** A parsed measurement; validation has already refused anything unparsable. */
function measurement(text: string): number {
  return parseNumber(text) ?? 0;
}

/**
 * Canonical order: `displayOrder`, then `code`, then `id` (`APP3-A01` §19).
 *
 * The same comparator the server orders by, so the list the operator sees and
 * the list that comes back after a save are the same list. Drag position is
 * never a field — reordering rewrites `displayOrder`, which is the only
 * ordering authority.
 */
export function compareRows(
  left: { readonly displayOrder: string; readonly code: string; readonly id: string | null },
  right: { readonly displayOrder: string; readonly code: string; readonly id: string | null },
): number {
  const byOrder = measurement(left.displayOrder) - measurement(right.displayOrder);
  if (byOrder !== 0) return byOrder;
  const byCode = left.code.localeCompare(right.code);
  if (byCode !== 0) return byCode;
  return (left.id ?? '').localeCompare(right.id ?? '');
}

/** Rows that will actually be written: live, and not marked for retirement. */
function sendable<Row extends { readonly removed: boolean; readonly retiredAt: string | null }>(
  rows: readonly Row[],
): readonly Row[] {
  return rows.filter((row) => !row.removed && row.retiredAt === null);
}

function areaBody(area: AreaDraft): ReplacePlacementAreaBody {
  const maxWidthMm = parseNumber(area.maxWidthMm);
  const maxHeightMm = parseNumber(area.maxHeightMm);
  return {
    code: area.code.trim(),
    name: area.name.trim(),
    displayOrder: measurement(area.displayOrder),
    boundXPx: measurement(area.boundXPx),
    boundYPx: measurement(area.boundYPx),
    boundWidthPx: measurement(area.boundWidthPx),
    boundHeightPx: measurement(area.boundHeightPx),
    // Each optional member is omitted rather than set to `undefined`: the
    // request body is `.strict()` on the server and the workspace compiles with
    // `exactOptionalPropertyTypes`.
    ...(area.id === null ? {} : { id: area.id }),
    ...(area.supersedesId === null ? {} : { supersedesId: area.supersedesId }),
    ...(maxWidthMm === null ? {} : { maxWidthMm }),
    ...(maxHeightMm === null ? {} : { maxHeightMm }),
  };
}

function sideBody(side: SideDraft): ReplacePlacementSideBody {
  return {
    code: side.code.trim(),
    name: side.name.trim(),
    displayOrder: measurement(side.displayOrder),
    backgroundAssetId: side.backgroundAssetId,
    imageWidthPx: measurement(side.imageWidthPx),
    imageHeightPx: measurement(side.imageHeightPx),
    physicalWidthMm: measurement(side.physicalWidthMm),
    physicalHeightMm: measurement(side.physicalHeightMm),
    pxPerMm: measurement(side.pxPerMm),
    areas: [...sendable(side.areas)].sort(compareRows).map(areaBody),
    ...(side.id === null ? {} : { id: side.id }),
    ...(side.supersedesId === null ? {} : { supersedesId: side.supersedesId }),
  };
}

/**
 * The complete replace body.
 *
 * `expectedUpdatedAt` is taken from the draft, which was seeded from the last
 * accepted server answer — never from a component's own memory of it, and never
 * from a token that a previous conflict already rejected.
 */
export function toReplaceBody(draft: PlacementDraft): ReplaceProductPlacementBody {
  return {
    expectedUpdatedAt: draft.expectedUpdatedAt,
    sides: [...sendable(draft.sides)].sort(compareRows).map(sideBody),
  };
}
