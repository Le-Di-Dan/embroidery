import { readContactHandoffConfig, resolveContactHandoffChannels } from '../model/contact-handoff';
import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';

/** Ties the dock's accessible name to its landmark without inventing a second nav. */
const CONTACT_HANDOFF_TITLE_ID = 'storefront-contact-handoff-title';

/**
 * The floating `Kết nối` dock: one circular external CTA per configured contact
 * channel, stacked at the bottom-right of every page (APP10-I01, relocated from
 * the footer by PO direction — see the note below).
 *
 * ### Why it no longer sits in the footer
 *
 * I01 shipped these two CTAs as flat rectangles at the end of the footer, which
 * is where `FIG-APP10-I01-FOOTER-DESKTOP` (842:3) and `-FOOTER-MOBILE` (842:48)
 * draw them. Live review rejected that placement: a customer has to scroll the
 * whole page before the contact affordance exists at all, and the market pattern
 * for these two channels is a persistent floating dock. The four I01 frames are
 * therefore **stale** against this component and are re-registered for redraw
 * (`FU-APP10-E01-01`); the registry rows carry the same note.
 *
 * ### What did not change, and must not
 *
 * Each CTA is still a plain anchor to a configured provider URL. It is still
 * deliberately *not* a launcher: nothing here opens a panel, mounts a widget,
 * loads a provider script or holds conversation state (BR-018, D-015). The whole
 * component is a list of links, and a reader can confirm that by its length. The
 * dock changes where the links sit, not what they are — a floating position is
 * not a chat surface, and this one has no open/close state to have.
 *
 * The URL is used exactly as configured: no query, no fragment, no opening text,
 * and nothing about the current page is appended (`843:44`).
 *
 * ### Naming a circular CTA
 *
 * A circle carries no room for the channel name and the "leaves the site"
 * caption the rectangles showed, so the visible mark is the channel's initial
 * and the full name plus caption live in a visually-hidden span **inside** the
 * link. The accessible name is therefore still "Zalo — Mở ứng dụng bên ngoài",
 * as it was, and no `aria-label` overrides visible text: there is none to
 * override. `title` repeats it for a pointer user hovering the glyph.
 *
 * With neither channel configured this renders nothing at all — no dock, no
 * empty landmark — and the page is exactly its pre-I01 composition.
 */
export function StorefrontContactHandoff() {
  const channels = resolveContactHandoffChannels(readContactHandoffConfig());
  if (channels.length === 0) {
    return null;
  }

  const { contactHandoff } = STOREFRONT_SHELL_COPY;
  return (
    <section className="storefront-shell__handoff-dock" aria-labelledby={CONTACT_HANDOFF_TITLE_ID}>
      <h2 id={CONTACT_HANDOFF_TITLE_ID} className="storefront-shell__handoff-dock-title">
        {contactHandoff.title}
      </h2>
      <ul className="storefront-shell__handoff-dock-list">
        {channels.map((channel) => {
          const name = contactHandoff.channels[channel.id];
          const accessibleName = `${name} — ${contactHandoff.externalCaption}`;
          return (
            <li key={channel.id} className="storefront-shell__handoff-dock-item">
              <a
                className="storefront-shell__handoff-dock-cta"
                href={channel.href}
                target="_blank"
                rel="noopener noreferrer"
                title={accessibleName}
              >
                <span className="storefront-shell__handoff-dock-mark" aria-hidden="true">
                  {contactHandoff.marks[channel.id]}
                </span>
                <span className="storefront-shell__handoff-dock-name">{accessibleName}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
