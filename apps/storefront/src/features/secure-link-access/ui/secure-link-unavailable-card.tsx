import Link from 'next/link';
import type { RefObject } from 'react';

import { SECURE_LINK_COPY } from '../model/secure-link-copy';

/**
 * Unavailable — one state for six causes (`629:37` desktop, `629:87` mobile).
 *
 * ### The non-enumeration contract, as code
 *
 * This component takes **no props describing why**. There is no `cause`, no
 * `reason`, no `code` — not because the values are unused, but because they do
 * not exist: B06 answers unknown, expired, revoked, superseded, wrong target
 * and wrong purpose with one byte-identical `404` (`APP4-G01` PO-04, annotation
 * `634:59`). A prop here would be an invitation to invent the distinction the
 * server spent a checkpoint collapsing.
 *
 * The same card also renders for a **missing or malformed fragment** (§14),
 * which never reached the server at all. That is the point: if a syntactically
 * bad token looked different from a revoked one, fragment syntax would become a
 * probe. One screen, one meaning — "this link does not open, here is what to do
 * next" — and no second diagnostic request is made to find out more.
 *
 * The alert is not colour alone (`634:150`): the warning border is accompanied
 * by its own title and body text.
 */
export function SecureLinkUnavailableCard({
  headingRef,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const copy = SECURE_LINK_COPY.unavailable;
  return (
    <div className="secure-link-access__card">
      <h1 className="secure-link-access__title" ref={headingRef} tabIndex={-1}>
        {copy.title}
      </h1>
      <div className="secure-link-access__alert secure-link-access__alert--warn">
        <p className="secure-link-access__alert-title">{copy.alertTitle}</p>
        <p className="secure-link-access__alert-body">{copy.alertBody}</p>
      </div>
      <p className="secure-link-access__body">{copy.body}</p>
      {/*
        `prefetch={false}`: this route must issue no request it did not have to.
        The link only ever renders after the fragment is stripped, so a prefetch
        could not observe a token — but a route whose security argument is
        "nothing else here talks to the network" is easier to keep true than to
        re-verify every time Next changes its prefetch heuristics.
      */}
      <Link className="secure-link-access__button" href="/" prefetch={false}>
        {SECURE_LINK_COPY.home}
      </Link>
    </div>
  );
}
