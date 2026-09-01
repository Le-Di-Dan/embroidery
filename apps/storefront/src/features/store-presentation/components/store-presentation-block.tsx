import Link from 'next/link';

import { resolveStoreFacts } from '../../content-pages';
import { isCustomerRouteWithheld } from '../../release-isolation';
import {
  STORE_PRESENTATION_COPY,
  STORE_PRESENTATION_POLICY_LINKS,
} from '../model/store-presentation-copy';
import { StorePresentationColumn } from './store-presentation-column';

/**
 * The APP11-owned footer store-presentation block (`APP11-S05`, closing
 * `FU-APP10-D01-05`).
 *
 * Design authority: `872:1029` (Desktop 1440, four 260px columns in one row,
 * 64 gap, side padding 80), `888:1006` (Tablet 1024, 2 × 2, row gap 32, column
 * gap 48, side padding 48), `888:1058` (Mobile 390, single stack, gap 28, side
 * padding 24, 100px dock reserve) and the responsive authority `889:1030`.
 *
 * ## It sits above the shell footer, and does not become one
 *
 * `889:1030` composes this block **above** the approved DS `Footer` at every
 * width, and neither replaces nor edits it. So this is a `<section>` with an
 * accessible name, not a second `<footer>`: the document already has exactly one
 * `contentinfo` landmark, and a second would leave a screen-reader user choosing
 * between two things both called "footer".
 *
 * ## The store facts are resolved, never written
 *
 * `resolveStoreFacts()` is the same call the Local page makes, so the address a
 * customer reads in the footer and the one on `/cua-hang` cannot disagree — and
 * when none is canonical, as today, both omit the rows entirely and fall back to
 * prose. No placeholder, no `TBD`, no invented value reaches either surface.
 *
 * ## No Zalo or Messenger action
 *
 * The two external channels stay in the floating dock and appear nowhere here
 * (`889:1030`; `APP10-E01` moved them out of the footer precisely so one URL is
 * not published twice on every page). The contact column names them in prose and
 * links to neither, so there is nothing to fall out of sync with the dock and
 * nothing to render when the dock is unconfigured.
 *
 * ## The contact column's request action follows the release (`APP12-G02-C1`)
 *
 * This block is composed by the shell, so it renders on **every** released
 * page — which made its `Gửi yêu cầu thêu` link the single widest-reaching
 * advertisement of `/yeu-cau/moi`, an address `src/proxy.ts` answers with a
 * `404` while Wave 2 is withheld. The link is therefore omitted then.
 *
 * The column's prose stays exactly as written. Unlike the Homepage and gallery
 * CTAs, this column is not an ask: it is the contact column, its sentence also
 * names the dock channels, and those channels are Wave-1 and still there — so
 * removing the one anchor leaves a column that still tells the visitor how to
 * reach the workshop. Rewriting the sentence would be the copy change §18
 * permits only when structurally unavoidable, and it is not.
 *
 * The other three columns are untouched: `Ghé xưởng`, the three service routes
 * and the four policies are all Wave-1 and all released.
 */
export function StorePresentationBlock() {
  const facts = resolveStoreFacts();
  const { identity, contact, service, policies, regionLabel } = STORE_PRESENTATION_COPY;
  const contactActionWithheld = isCustomerRouteWithheld(contact.actionHref);

  return (
    <section className="store-presentation" aria-label={regionLabel}>
      <div className="store-presentation__columns">
        {/* 1 — Store identity. First in source and first on screen at every width. */}
        <StorePresentationColumn heading={identity.heading}>
          <p className="store-presentation__text">{identity.descriptor}</p>
          {facts.length === 0 ? (
            <p className="store-presentation__text">{identity.fallback}</p>
          ) : (
            <dl className="store-presentation__facts">
              {facts.map((fact) => (
                <div className="store-presentation__fact" key={fact.id}>
                  <dt className="store-presentation__fact-label">{fact.label}</dt>
                  <dd className="store-presentation__fact-value">
                    {fact.href === undefined ? (
                      fact.value
                    ) : (
                      <a className="store-presentation__fact-link" href={fact.href}>
                        {fact.value}
                      </a>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <Link className="store-presentation__link" href={identity.actionHref}>
            {identity.action}
          </Link>
        </StorePresentationColumn>

        {/* 2 — Contact. Prose plus the request route; the dock keeps the externals. */}
        <StorePresentationColumn heading={contact.heading}>
          <p className="store-presentation__text">{contact.fallback}</p>
          {contactActionWithheld ? null : (
            <Link className="store-presentation__link" href={contact.actionHref}>
              {contact.action}
            </Link>
          )}
        </StorePresentationColumn>

        {/* 3 — Service & support. Three delivered public routes. */}
        <StorePresentationColumn heading={service.heading}>
          <ul className="store-presentation__list">
            {service.links.map((link) => (
              <li key={link.id}>
                <Link className="store-presentation__link" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </StorePresentationColumn>

        {/* 4 — Policies. All four, in one column, at every width (`889:1030`). */}
        <StorePresentationColumn heading={policies.heading}>
          <ul className="store-presentation__list">
            {STORE_PRESENTATION_POLICY_LINKS.map((link) => (
              <li key={link.id}>
                <Link className="store-presentation__link" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </StorePresentationColumn>
      </div>
    </section>
  );
}
