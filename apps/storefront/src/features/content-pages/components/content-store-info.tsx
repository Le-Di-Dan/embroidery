import type { ContentStoreInfoSection } from '../model/content-page';
import { resolveStoreFacts } from '../model/store-facts';

/**
 * The template's `[OPTIONAL]` store-information block (`864:881`), rendered as
 * text — never as an image, and never as a map embed.
 *
 * ## It renders what is canonical, and nothing else
 *
 * `resolveStoreFacts()` returns only facts the Product Owner has made canonical.
 * A fact with no canonical value produces **no row at all**: the block does not
 * emit a label with an empty value, a `TBD`, a `—`, or the bracketed D01
 * placeholder. When every fact is absent — which is the state today — the block
 * renders its truthful fallback sentence instead of an empty definition list, so
 * the page never shows a heading over nothing.
 *
 * ## `tel:` and `mailto:` never rewrite the value
 *
 * The visible text is the exact canonical string; the `href` is a separate field
 * on the fact. Deriving the `href` by stripping spaces out of the displayed
 * number would be a formatting change that silently alters what the customer
 * dials if the canonical value ever contains something the strip did not expect.
 *
 * A `<dl>` because these are label/value pairs and the pairing is the meaning: a
 * screen reader announces "Địa chỉ" with its value rather than reading four
 * unlabelled lines. Values wrap freely — the stylesheet truncates and ellipsises
 * nothing, because half an address is worse than a wrapped one.
 */
export function ContentStoreInfo({ section }: { section: ContentStoreInfoSection }) {
  const facts = resolveStoreFacts();
  const headingId = `content-${section.id}-heading`;

  return (
    <section className="content-page__block content-page__store" aria-labelledby={headingId}>
      <h2 className="content-page__block-heading" id={headingId}>
        {section.heading}
      </h2>
      {facts.length === 0 ? (
        <p className="content-page__paragraph">{section.fallback}</p>
      ) : (
        <dl className="content-page__store-facts">
          {facts.map((fact) => (
            <div className="content-page__store-fact" key={fact.id}>
              <dt className="content-page__store-fact-label">{fact.label}</dt>
              <dd className="content-page__store-fact-value">
                {fact.href === undefined ? (
                  fact.value
                ) : (
                  <a className="content-page__store-fact-link" href={fact.href}>
                    {fact.value}
                  </a>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
