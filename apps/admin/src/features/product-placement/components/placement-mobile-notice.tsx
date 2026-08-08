'use client';

import { PLACEMENT_COPY } from '../model/placement-copy';
import { isRetired, type PlacementModel } from '../model/placement-model';

interface PlacementMobileNoticeProps {
  readonly model: PlacementModel;
}

/**
 * The approved mobile state (`596:7` mobile notice; `APP3-A01` §11).
 *
 * Admin authoring is desktop-oriented by design ruling, so this is a deliberate
 * read-only notice rather than a cramped editor. It renders *instead of* the
 * authoring layout, not on top of it — a hidden desktop layout would still hold
 * focusable numeric fields a phone operator could tab into and change.
 *
 * The structure stays visible because "not supported here" and "not knowable
 * here" are different claims. An operator checking which sides a product has,
 * from a phone, is a reasonable thing to do and needs no editing surface.
 * Retired rows keep their badge for the same reason they do on desktop.
 */
export function PlacementMobileNotice({ model }: PlacementMobileNoticeProps) {
  return (
    <section className="placement-mobile" data-testid="placement-mobile-notice">
      <div className="placement-mobile__notice" role="status">
        <p className="placement-mobile__badge">{PLACEMENT_COPY.mobile.readOnlyBadge}</p>
        <h2 className="placement-mobile__title">{PLACEMENT_COPY.mobile.title}</h2>
        <p className="placement-mobile__body">{PLACEMENT_COPY.mobile.body}</p>
      </div>

      <ul className="placement-mobile__sides">
        {model.sides.map((side) => (
          <li key={side.id} className="placement-mobile__side">
            <p className="placement-mobile__side-name">
              {side.name}
              {isRetired(side) ? (
                <span className="placement-mobile__retired">
                  {PLACEMENT_COPY.hierarchy.retiredBadge}
                </span>
              ) : null}
            </p>
            <ul className="placement-mobile__areas">
              {side.areas.map((area) => (
                <li key={area.id} className="placement-mobile__area">
                  {area.name}
                  {isRetired(area) ? (
                    <span className="placement-mobile__retired">
                      {PLACEMENT_COPY.hierarchy.retiredBadge}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
