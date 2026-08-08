'use client';

import { PLACEMENT_COPY } from '../model/placement-copy';
import type { AreaDraft, SideDraft } from '../model/placement-draft';
import type { DraftValidation } from '../model/placement-validation';
import type { PlacementSelection } from '../model/placement-selection';
import { PlacementAreaInspector } from './placement-area-inspector';
import { PlacementSideInspector } from './placement-side-inspector';

interface PlacementInspectorProps {
  readonly selection: PlacementSelection;
  readonly side: SideDraft | null;
  readonly area: AreaDraft | null;
  readonly validation: DraftValidation;
  readonly onPatchSide: (patch: Partial<SideDraft>) => void;
  readonly onPatchArea: (patch: Partial<AreaDraft>) => void;
  readonly onChooseBackground: () => void;
}

const NO_ERRORS = {} as const;

/**
 * The context-sensitive inspector (`596:7`, right column).
 *
 * One panel, two contents, chosen by what is selected. Rendering both at once
 * and hiding one would leave a second set of numeric fields in the tab order,
 * editable by keyboard, writing to a row the operator is not looking at.
 */
export function PlacementInspector({
  selection,
  side,
  area,
  validation,
  onPatchSide,
  onPatchArea,
  onChooseBackground,
}: PlacementInspectorProps) {
  return (
    <section className="placement-inspector" aria-label={PLACEMENT_COPY.inspector.title}>
      <h2 className="placement-inspector__title">{PLACEMENT_COPY.inspector.title}</h2>

      {selection.kind === 'area' && area !== null ? (
        <PlacementAreaInspector
          area={area}
          errors={validation.areas[area.key] ?? NO_ERRORS}
          onPatch={onPatchArea}
        />
      ) : selection.kind === 'side' && side !== null ? (
        <PlacementSideInspector
          side={side}
          errors={validation.sides[side.key] ?? NO_ERRORS}
          onPatch={onPatchSide}
          onChooseBackground={onChooseBackground}
        />
      ) : (
        <p className="placement-inspector__empty">{PLACEMENT_COPY.inspector.empty}</p>
      )}
    </section>
  );
}
