'use client';

/**
 * The 1024 text inspector, as a right drawer (`APP3-S05-C1`).
 *
 * `FIG-STUDIO-EDITING-TABLET-1024` (`618:140`, owned by `APP3-D01-C1`) is
 * explicit about the tablet composition: the tool rail stays, stage width is
 * prioritized, and the inspector becomes a right drawer toggled from the topbar.
 * `APP3-S05` shipped it as a column stacked under the stage instead, which is a
 * different composition, not a narrower one — the stage stops being dominant the
 * moment a panel of the same weight is pushed under it.
 *
 * ## What "does not push the stage" means mechanically
 *
 * The panel is absolutely positioned inside the stage frame. Opening and closing
 * it therefore changes no in-flow box: the SVG's width, its `viewBox` and every
 * geometry the overlay derives from it are byte-identical open or closed. A
 * drawer implemented as a flex sibling would silently re-lay-out the stage on
 * every toggle, and every millimetre read-out with it.
 *
 * ## Why it is one component and not a framework
 *
 * `APP3-D01-C1` says layers will later share this drawer, and that is `APP3-S04`
 * to deliver. Building a generic shell now would be an abstraction for a
 * requirement nobody has reviewed. The class names are drawer-shaped rather than
 * text-shaped so S04 can extend the same accepted presentation through its own
 * reviewed slice.
 *
 * ## Where the trigger sits
 *
 * `APP3-D01-C1` says the drawer is toggled "from the topbar". The accepted
 * implementation has no topbar: `APP3-S07` put the Studio's one persistent
 * control strip — zoom, fit, safe area — *below* the stage, and that placement
 * is accepted. So the trigger joins that strip rather than inventing a second
 * bar above the stage, which would have restructured `APP3-S07`'s markup for a
 * composition no frame draws. What the authority is actually about is satisfied
 * exactly: the toggle is a persistent, always-reachable control outside the
 * panel, never a handle inside the thing it opens. DOM order and visual order
 * agree, so tab order does too.
 *
 * Text is the only content, and there is no tab strip, no layers list, no upload
 * and no history here.
 */
import { useId, useRef, useState } from 'react';

import { STUDIO_TEXT_COPY } from '../model/studio-text-copy';
import { StudioTextInspector, type StudioTextInspectorProps } from './studio-text-inspector';

export function StudioTextDrawer(props: StudioTextInspectorProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);

  const close = () => {
    setOpen(false);
    // Focus goes back where it came from. Closing the panel hides the subtree
    // the customer was inside, and focus left on a hidden element lands on the
    // document body — a keyboard user would restart from the top of the page.
    trigger.current?.focus();
  };

  return (
    <>
      <div className="studio-stage__drawer-bar">
        <button
          type="button"
          ref={trigger}
          className="studio-stage__control"
          data-testid="studio-text-drawer-trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          {open ? STUDIO_TEXT_COPY.drawerClose : STUDIO_TEXT_COPY.drawerOpen}
        </button>
      </div>

      {/*
        Always in the document, `hidden` when closed. `aria-controls` has to
        resolve to something for the trigger to mean anything, and `hidden`
        takes the whole subtree out of the accessibility tree and out of the tab
        order — so a closed drawer has no reachable text field, while an open
        one keeps the draft the customer was in the middle of typing.

        A `<section>` rather than a `div`: a named region is announced and
        navigable, and an `aria-label` on a plain `div` labels nothing, because
        a generic element is not in the accessibility tree to carry it.
      */}
      <section
        id={panelId}
        className="studio-drawer"
        data-testid="studio-text-drawer"
        hidden={!open}
        aria-label={STUDIO_TEXT_COPY.panelLabel}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      >
        <StudioTextInspector {...props} />
        <button
          type="button"
          className="studio-stage__control"
          data-testid="studio-text-drawer-close"
          onClick={close}
        >
          {STUDIO_TEXT_COPY.drawerClose}
        </button>
      </section>
    </>
  );
}
