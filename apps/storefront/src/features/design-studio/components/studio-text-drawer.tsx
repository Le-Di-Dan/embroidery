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
 * ## Where the trigger sits (`APP3-S05-MI01`)
 *
 * In the Studio topbar: a control region **above** the stage, which is what
 * `APP3-D01-C1` draws and what the operator has ruled the word to mean.
 *
 * `APP3-S05-C1` put it in `APP3-S07`'s persistent control strip instead, on the
 * reasoning that the strip was the Studio's only persistent control region and
 * that the authority was really about the toggle living *outside* the panel.
 * That reasoning was rejected: trigger placement is part of the approved
 * composition, and functional equivalence does not substitute for it. The strip
 * stays exactly where `APP3-S07` put it, with exactly the controls it had.
 *
 * The topbar is a real first child of the stage frame, so DOM order, visual
 * order and tab order all agree — no `order` trick placing the control above
 * the stage while leaving it late in the tab sequence.
 *
 * ## The shared drawer (`APP3-S06`)
 *
 * `APP3-S05` shipped this with text as its only content. `APP3-S06` adds the
 * image controls, and adds them *here* rather than in a drawer of their own:
 * `APP3-D01-C1` draws one right drawer at 1024 and anticipated exactly this
 * ("layers will later share this drawer"), and a second toggle opening a second
 * panel over the same stage edge would be a second drawer system — the thing the
 * tablet composition is shaped to avoid.
 *
 * So there is still one topbar, one trigger and one out-of-flow panel; what
 * changed is that the panel takes sections. The drawer's own name moved with it:
 * a trigger labelled after text cannot honestly open a panel containing an image
 * control, so it now names the inspector and each section keeps its own heading.
 *
 * There is still no tab strip, no layers list and no history here.
 */
import { useId, useRef, useState, type ReactNode } from 'react';

import { STUDIO_INSPECTOR_COPY } from '../model/studio-inspector-copy';
import { StudioTextInspector, type StudioTextInspectorProps } from './studio-text-inspector';

export interface StudioTextDrawerProps extends StudioTextInspectorProps {
  /** Further inspector sections, rendered inside the same panel. */
  readonly children?: ReactNode;
}

export function StudioTextDrawer({ children, ...props }: StudioTextDrawerProps) {
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
      {/*
        The trigger, rendered straight into the shared topbar this component is
        mounted inside (`APP3-S10`). It used to bring its own `.studio-stage__topbar`
        wrapper, because at `APP3-S05-MI01` it was the only thing in that region;
        the save chip now shares it at every tier, so the region is owned one
        level up and there is still exactly one of it. The button itself — its
        state, label, `aria-expanded` and `aria-controls` — is unchanged.
      */}
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
        {open ? STUDIO_INSPECTOR_COPY.drawerClose : STUDIO_INSPECTOR_COPY.drawerOpen}
      </button>

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
        aria-label={STUDIO_INSPECTOR_COPY.panelLabel}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      >
        <StudioTextInspector {...props} />
        {children}
        <button
          type="button"
          className="studio-stage__control"
          data-testid="studio-text-drawer-close"
          onClick={close}
        >
          {STUDIO_INSPECTOR_COPY.drawerClose}
        </button>
      </section>
    </>
  );
}
