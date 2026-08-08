/**
 * Every transition the placement draft can make.
 *
 * A pure reducer rather than logic spread across handlers, because the rules
 * that matter here are cross-row: retiring a side has to retire what it
 * contains, adding a row has to land at the end of its parent's order, and
 * re-seeding after a save has to replace the whole tree at once. Written as
 * handlers, each of those becomes a rule some component must remember.
 *
 * The reducer never *deletes* a row that the server knows about. Removal marks
 * `removed`, and the body mapper turns that into omission, which the server
 * turns into retirement (`IMP-D041` PO-07). A row the server has never seen —
 * one with no `id` — is genuinely dropped, because retiring something that was
 * never persisted is not a thing the model can express.
 */
import {
  draftOf,
  emptyAreaDraft,
  emptySideDraft,
  type AreaDraft,
  type PlacementDraft,
  type SideDraft,
} from './placement-draft';
import type { PlacementModel } from './placement-model';
import { parseNumber } from './placement-validation';

export type PlacementAction =
  /** Replace the whole draft from an authoritative snapshot. */
  | { readonly type: 'seed'; readonly model: PlacementModel }
  | { readonly type: 'patch-side'; readonly sideKey: string; readonly patch: Partial<SideDraft> }
  | {
      readonly type: 'patch-area';
      readonly sideKey: string;
      readonly areaKey: string;
      readonly patch: Partial<AreaDraft>;
    }
  | { readonly type: 'add-side' }
  | { readonly type: 'add-area'; readonly sideKey: string }
  | { readonly type: 'toggle-side-removed'; readonly sideKey: string }
  | { readonly type: 'toggle-area-removed'; readonly sideKey: string; readonly areaKey: string };

/** The next free display order in a list, so a new row lands at the end. */
function nextOrder(rows: readonly { readonly displayOrder: string }[]): string {
  const highest = rows.reduce((max, row) => {
    const value = parseNumber(row.displayOrder);
    return value === null ? max : Math.max(max, value);
  }, -1);
  return String(highest + 1);
}

function mapSide(
  draft: PlacementDraft,
  sideKey: string,
  change: (side: SideDraft) => SideDraft,
): PlacementDraft {
  return {
    ...draft,
    sides: draft.sides.map((side) => (side.key === sideKey ? change(side) : side)),
  };
}

/**
 * A side and everything it contains.
 *
 * An area cannot outlive its side: the server retires the areas of a retired
 * side, and a draft that showed a live area under a retired side would be
 * describing a state the backend will never produce.
 */
function withRemoved(side: SideDraft, removed: boolean): SideDraft {
  return {
    ...side,
    removed,
    areas: side.areas.map((area) => (removed ? { ...area, removed: true } : area)),
  };
}

export function placementReducer(draft: PlacementDraft, action: PlacementAction): PlacementDraft {
  switch (action.type) {
    case 'seed':
      return draftOf(action.model);

    case 'patch-side':
      return mapSide(draft, action.sideKey, (side) => ({ ...side, ...action.patch }));

    case 'patch-area':
      return mapSide(draft, action.sideKey, (side) => ({
        ...side,
        areas: side.areas.map((area) =>
          area.key === action.areaKey ? { ...area, ...action.patch } : area,
        ),
      }));

    case 'add-side':
      return {
        ...draft,
        sides: [...draft.sides, { ...emptySideDraft(), displayOrder: nextOrder(draft.sides) }],
      };

    case 'add-area':
      return mapSide(draft, action.sideKey, (side) => ({
        ...side,
        areas: [...side.areas, { ...emptyAreaDraft(), displayOrder: nextOrder(side.areas) }],
      }));

    case 'toggle-side-removed': {
      const target = draft.sides.find((side) => side.key === action.sideKey);
      if (target === undefined) return draft;
      // A side the server has never seen is dropped outright: there is nothing
      // to retire, and leaving it behind as a removed row would keep an
      // unsaved, invalid row on screen forever.
      if (target.id === null && !target.removed) {
        return { ...draft, sides: draft.sides.filter((side) => side.key !== action.sideKey) };
      }
      return mapSide(draft, action.sideKey, (side) => withRemoved(side, !side.removed));
    }

    case 'toggle-area-removed': {
      const side = draft.sides.find((row) => row.key === action.sideKey);
      const target = side?.areas.find((area) => area.key === action.areaKey);
      if (side === undefined || target === undefined) return draft;
      if (target.id === null && !target.removed) {
        return mapSide(draft, action.sideKey, (row) => ({
          ...row,
          areas: row.areas.filter((area) => area.key !== action.areaKey),
        }));
      }
      return mapSide(draft, action.sideKey, (row) => ({
        ...row,
        areas: row.areas.map((area) =>
          area.key === action.areaKey ? { ...area, removed: !area.removed } : area,
        ),
      }));
    }

    default:
      return draft;
  }
}
