'use client';

import { PLACEMENT_COPY } from '../model/placement-copy';
import { compareRows } from '../model/placement-body';
import type { AreaDraft, PlacementDraft, SideDraft } from '../model/placement-draft';
import type { PlacementSelection } from '../model/placement-selection';

interface PlacementHierarchyPanelProps {
  readonly draft: PlacementDraft;
  readonly productName: string;
  readonly selection: PlacementSelection;
  readonly invalidSideKeys: ReadonlySet<string>;
  readonly invalidAreaKeys: ReadonlySet<string>;
  readonly onSelect: (selection: PlacementSelection) => void;
  readonly onAddSide: () => void;
  readonly onAddArea: (sideKey: string) => void;
  readonly onToggleSideRemoved: (sideKey: string) => void;
  readonly onToggleAreaRemoved: (sideKey: string, areaKey: string) => void;
}

/**
 * The Product → Side → Embroidery Area tree (`596:7`, left column).
 *
 * Three levels are rendered as three levels — a product heading, a list of
 * sides, and each side's own nested list — rather than as a flat list with
 * indentation. Nesting is what makes "this area belongs to that side"
 * unmistakable, and it is what a screen reader announces.
 *
 * Retired rows stay. `IMP-D041` PO-07 retires without deleting because a
 * Template or a live Design Session may still reference the row, and an
 * operator who could not see it would not understand why its code is
 * unavailable. A retired row is badged, not hidden, and is not selectable for
 * editing — its geometry is frozen server-side, so offering fields that cannot
 * be saved would be a lie.
 *
 * Order is the backend's own: `displayOrder`, then `code`, then `id`. The list
 * the operator sees is therefore the list that comes back after a save.
 */
export function PlacementHierarchyPanel({
  draft,
  productName,
  selection,
  invalidSideKeys,
  invalidAreaKeys,
  onSelect,
  onAddSide,
  onAddArea,
  onToggleSideRemoved,
  onToggleAreaRemoved,
}: PlacementHierarchyPanelProps) {
  const sides = [...draft.sides].sort(compareRows);

  return (
    <section className="placement-hierarchy" aria-label={PLACEMENT_COPY.hierarchy.title}>
      <header className="placement-hierarchy__header">
        <p className="placement-hierarchy__product-label">
          {PLACEMENT_COPY.hierarchy.productLabel}
        </p>
        <h2 className="placement-hierarchy__product">{productName}</h2>
      </header>

      <div className="placement-hierarchy__section-head">
        <h3 className="placement-hierarchy__section-title">
          {PLACEMENT_COPY.hierarchy.sidesLabel}
        </h3>
        <button type="button" className="placement-hierarchy__add" onClick={onAddSide}>
          {PLACEMENT_COPY.hierarchy.addSide}
        </button>
      </div>

      {sides.length === 0 ? (
        <p className="placement-hierarchy__empty">{PLACEMENT_COPY.states.emptyBody}</p>
      ) : (
        <ul className="placement-hierarchy__sides">
          {sides.map((side) => (
            <SideBranch
              key={side.key}
              side={side}
              selection={selection}
              invalidSideKeys={invalidSideKeys}
              invalidAreaKeys={invalidAreaKeys}
              onSelect={onSelect}
              onAddArea={onAddArea}
              onToggleSideRemoved={onToggleSideRemoved}
              onToggleAreaRemoved={onToggleAreaRemoved}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface SideBranchProps {
  readonly side: SideDraft;
  readonly selection: PlacementSelection;
  readonly invalidSideKeys: ReadonlySet<string>;
  readonly invalidAreaKeys: ReadonlySet<string>;
  readonly onSelect: (selection: PlacementSelection) => void;
  readonly onAddArea: (sideKey: string) => void;
  readonly onToggleSideRemoved: (sideKey: string) => void;
  readonly onToggleAreaRemoved: (sideKey: string, areaKey: string) => void;
}

function SideBranch({
  side,
  selection,
  invalidSideKeys,
  invalidAreaKeys,
  onSelect,
  onAddArea,
  onToggleSideRemoved,
  onToggleAreaRemoved,
}: SideBranchProps) {
  const retired = side.retiredAt !== null;
  const selected = selection.kind === 'side' && selection.sideKey === side.key;
  const areas = [...side.areas].sort(compareRows);

  return (
    <li className="placement-hierarchy__side">
      <div className="placement-hierarchy__row">
        <button
          type="button"
          className={rowClass('placement-hierarchy__side-button', {
            selected,
            retired,
            removed: side.removed,
            invalid: invalidSideKeys.has(side.key),
          })}
          aria-current={selected}
          disabled={retired}
          data-testid={`placement-side-${side.key}`}
          onClick={() => {
            onSelect({ kind: 'side', sideKey: side.key });
          }}
        >
          <span className="placement-hierarchy__name">
            {side.name.trim() === '' ? PLACEMENT_COPY.hierarchy.unnamedSide : side.name}
          </span>
          <RowBadges row={side} />
        </button>

        {/*
          An already-retired row has nothing to retire, so it carries no
          control at all rather than a permanently disabled one — a dead button
          is noise in a 296px column and tells the operator nothing the badge
          has not already said.
        */}
        {retired ? null : (
          <button
            type="button"
            className="placement-hierarchy__retire"
            onClick={() => {
              onToggleSideRemoved(side.key);
            }}
          >
            {side.removed
              ? PLACEMENT_COPY.hierarchy.undoRetire
              : PLACEMENT_COPY.hierarchy.retireSide}
          </button>
        )}
      </div>

      <div className="placement-hierarchy__areas-head">
        <p className="placement-hierarchy__areas-label">{PLACEMENT_COPY.hierarchy.areasLabel}</p>
        <button
          type="button"
          className="placement-hierarchy__add"
          disabled={retired || side.removed}
          onClick={() => {
            onAddArea(side.key);
          }}
        >
          {PLACEMENT_COPY.hierarchy.addArea}
        </button>
      </div>

      {areas.length === 0 ? (
        <p className="placement-hierarchy__no-areas">{PLACEMENT_COPY.hierarchy.noAreas}</p>
      ) : (
        <ul className="placement-hierarchy__areas">
          {areas.map((area) => {
            const areaRetired = area.retiredAt !== null;
            const areaSelected = selection.kind === 'area' && selection.areaKey === area.key;
            return (
              <li key={area.key} className="placement-hierarchy__area">
                <button
                  type="button"
                  className={rowClass('placement-hierarchy__area-button', {
                    selected: areaSelected,
                    retired: areaRetired,
                    removed: area.removed,
                    invalid: invalidAreaKeys.has(area.key),
                  })}
                  aria-current={areaSelected}
                  disabled={areaRetired}
                  data-testid={`placement-area-${area.key}`}
                  onClick={() => {
                    onSelect({ kind: 'area', sideKey: side.key, areaKey: area.key });
                  }}
                >
                  <span className="placement-hierarchy__name">
                    {area.name.trim() === '' ? PLACEMENT_COPY.hierarchy.unnamedArea : area.name}
                  </span>
                  <RowBadges row={area} />
                </button>
                {areaRetired ? null : (
                  <button
                    type="button"
                    className="placement-hierarchy__retire"
                    onClick={() => {
                      onToggleAreaRemoved(side.key, area.key);
                    }}
                  >
                    {area.removed
                      ? PLACEMENT_COPY.hierarchy.undoRetire
                      : PLACEMENT_COPY.hierarchy.retireArea}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function rowClass(
  base: string,
  state: {
    readonly selected: boolean;
    readonly retired: boolean;
    readonly removed: boolean;
    readonly invalid: boolean;
  },
): string {
  const classes = [base];
  if (state.selected) classes.push(`${base}--selected`);
  if (state.retired) classes.push(`${base}--retired`);
  if (state.removed) classes.push(`${base}--removed`);
  if (state.invalid) classes.push(`${base}--invalid`);
  return classes.join(' ');
}

/** History is stated, never inferred from a missing row. */
function RowBadges({ row }: { readonly row: AreaDraft | SideDraft }) {
  return (
    <>
      {row.retiredAt === null ? null : (
        <span className="placement-hierarchy__badge placement-hierarchy__badge--retired">
          {PLACEMENT_COPY.hierarchy.retiredBadge}
        </span>
      )}
      {row.supersededById === null ? null : (
        <span className="placement-hierarchy__badge">
          {PLACEMENT_COPY.hierarchy.supersededBadge}
        </span>
      )}
      {row.removed && row.retiredAt === null ? (
        <span className="placement-hierarchy__badge placement-hierarchy__badge--pending">
          {PLACEMENT_COPY.hierarchy.pendingRetireBadge}
        </span>
      ) : null}
      {row.id === null ? (
        <span className="placement-hierarchy__badge placement-hierarchy__badge--new">
          {PLACEMENT_COPY.hierarchy.newBadge}
        </span>
      ) : null}
    </>
  );
}
