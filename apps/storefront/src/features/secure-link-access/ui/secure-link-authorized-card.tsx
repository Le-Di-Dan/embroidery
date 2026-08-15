import type { RefObject } from 'react';

import { SECURE_LINK_COPY } from '../model/secure-link-copy';
import { ResponsiveText } from './responsive-text';

/**
 * Valid grant — the authorized shell (`629:20` desktop, `629:70` mobile).
 *
 * ### What this card deliberately does not render
 *
 * The grant B06 returns carries three fields — `customRequestId`, `scopeKind`
 * and `expiresAt` — and none of them is drawn on either approved frame. So none
 * of them is printed here. Not the request id (an opaque identifier the
 * customer has no use for and which would invite a "look it up" surface), not
 * the expiry instant (a countdown APP4 was never asked to show), and certainly
 * not any request detail, quotation, design, payment or approval action: APP4
 * authenticates access and builds the frame, and everything the customer came
 * to see belongs to APP5 and later (§12).
 *
 * The dashed slot is that boundary made visible rather than papered over. It is
 * a labelled placeholder, not a fake protected-content panel, and it queries
 * nothing.
 *
 * The badge is not colour alone (`634:150`): it carries its own words, and the
 * heading beneath it says the same thing in prose.
 *
 * `headingRef` lets the screen move focus here once resolution settles, so a
 * keyboard or screen-reader user lands on the result instead of at the top of a
 * page that silently changed under them (§21).
 */
export function SecureLinkAuthorizedCard({
  headingRef,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const copy = SECURE_LINK_COPY.authorized;
  return (
    <div className="secure-link-access__card">
      <p className="secure-link-access__badge">
        <ResponsiveText copy={copy.badge} />
      </p>
      <h1 className="secure-link-access__title" ref={headingRef} tabIndex={-1}>
        <ResponsiveText copy={copy.title} />
      </h1>
      <p className="secure-link-access__body">
        <ResponsiveText copy={copy.body} />
      </p>
      <div className="secure-link-access__slot">
        <p className="secure-link-access__slot-title">
          <ResponsiveText copy={copy.slotTitle} />
        </p>
        <p className="secure-link-access__slot-note">
          <ResponsiveText copy={copy.slotNote} />
        </p>
      </div>
      <p className="secure-link-access__caption">
        <ResponsiveText copy={copy.caption} />
      </p>
    </div>
  );
}
