'use client';

import type { PublicProductPlacementResponse } from '@embroidery/api-client';

import { STUDIO_COPY } from '../model/studio-copy';
import { findSide, orderedAreas, orderedSides } from '../model/studio-placement';
import type { StudioSelection } from '../model/studio-selection';

export interface StudioPlacementPickerProps {
  readonly placement: PublicProductPlacementResponse;
  readonly selection: StudioSelection;
  readonly onSelectSide: (sideId: string) => void;
  readonly onSelectArea: (areaId: string) => void;
}

/**
 * Side and Embroidery Area choice (`IMP-D041`).
 *
 * Native `<select>` elements with real `<label>`s rather than custom listboxes:
 * they are keyboard-operable, screen-reader-announced and touch-friendly on
 * mobile without a line of code, and this checkpoint has no design reason to
 * rebuild any of that.
 *
 * A single Side or a single Area renders as a **statement**, not a control with
 * one option. It was already auto-selected, so offering a choice that cannot be
 * changed would be theatre.
 *
 * Areas come from the selected Side only. The list is not filtered from a
 * flattened set — it is read out of the Side, so an Area of another Side has no
 * path onto the screen.
 */
export function StudioPlacementPicker({
  placement,
  selection,
  onSelectSide,
  onSelectArea,
}: StudioPlacementPickerProps) {
  const sides = orderedSides(placement);
  const side = findSide(placement, selection.sideId);
  const areas = side === undefined ? [] : orderedAreas(side);

  return (
    <div className="studio-placement">
      <div className="studio-placement__field">
        <label className="studio-placement__label" htmlFor="studio-side">
          {STUDIO_COPY.sideLabel}
        </label>
        {sides.length > 1 ? (
          <select
            className="studio-placement__select"
            id="studio-side"
            value={selection.sideId ?? ''}
            onChange={(event) => {
              onSelectSide(event.target.value);
            }}
          >
            {sides.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="studio-placement__single" id="studio-side">
            {side?.name ?? ''}{' '}
            <span className="studio-placement__note">{STUDIO_COPY.singleSideNote}</span>
          </p>
        )}
      </div>

      <div className="studio-placement__field">
        <label className="studio-placement__label" htmlFor="studio-area">
          {STUDIO_COPY.areaLabel}
        </label>
        {areas.length > 1 ? (
          <select
            className="studio-placement__select"
            id="studio-area"
            value={selection.areaId ?? ''}
            onChange={(event) => {
              onSelectArea(event.target.value);
            }}
          >
            {areas.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="studio-placement__single" id="studio-area">
            {areas[0]?.name ?? ''}{' '}
            <span className="studio-placement__note">{STUDIO_COPY.singleAreaNote}</span>
          </p>
        )}
      </div>
    </div>
  );
}
