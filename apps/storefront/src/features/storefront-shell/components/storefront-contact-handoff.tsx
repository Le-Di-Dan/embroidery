import { readContactHandoffConfig, resolveContactHandoffChannels } from '../model/contact-handoff';
import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';

/** Ties the group heading to the section landmark without inventing a second nav. */
const CONTACT_HANDOFF_TITLE_ID = 'storefront-contact-handoff-title';

/**
 * The `Kết nối` footer group: one external CTA per configured contact channel
 * (APP10-I01, `FIG-APP10-I01-FOOTER-DESKTOP` 842:3 / `-MOBILE` 842:48 /
 * `-CTA-STATES` 843:3, approved under `FIG-APPROVAL-APP10-D01-PO-001`).
 *
 * Each CTA is a plain anchor to a configured provider URL. It is deliberately
 * *not* a launcher: nothing here opens a panel, mounts a widget, loads a
 * provider script or holds conversation state (BR-018, D-015). The whole
 * component is a list of links, and a reader can confirm that by its length.
 *
 * The channel is named in visible text and every CTA carries the visible
 * "leaves the site" caption inside the link, so the accessible name states both
 * the channel and the handoff without an `aria-label` replacing what is on
 * screen. The `↗` glyph is decorative and hidden from assistive technology; it
 * repeats the caption rather than carrying it, so no CTA is icon-only.
 *
 * With neither channel configured this renders nothing at all — no heading, no
 * empty group — and the footer is exactly its pre-I01 composition.
 */
export function StorefrontContactHandoff() {
  const channels = resolveContactHandoffChannels(readContactHandoffConfig());
  if (channels.length === 0) {
    return null;
  }

  const { contactHandoff } = STOREFRONT_SHELL_COPY;
  return (
    <section
      className="storefront-shell__footer-handoff"
      aria-labelledby={CONTACT_HANDOFF_TITLE_ID}
    >
      <h2 id={CONTACT_HANDOFF_TITLE_ID} className="storefront-shell__footer-handoff-title">
        {contactHandoff.title}
      </h2>
      <ul className="storefront-shell__footer-handoff-list">
        {channels.map((channel) => (
          <li key={channel.id} className="storefront-shell__footer-handoff-item">
            <a
              className="storefront-shell__footer-handoff-cta"
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="storefront-shell__footer-handoff-channel">
                {contactHandoff.channels[channel.id]}
                <span className="storefront-shell__footer-handoff-glyph" aria-hidden="true">
                  ↗
                </span>
              </span>
              <span className="storefront-shell__footer-handoff-caption">
                {contactHandoff.externalCaption}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
