import Link from 'next/link';

import { POLICY_IDS, POLICY_SLUG } from '../../content-pages';
import { STOREFRONT_FAQ_ROUTE, buildStorefrontPolicyPath } from '../model/storefront-navigation';
import { STOREFRONT_SHELL_COPY } from '../model/storefront-shell-copy';
import { StorefrontBrand } from './storefront-brand';

/**
 * The footer a transactional page gets (`V01-UX-022`, `APP12-V02` §10).
 *
 * `V01-UX-022` measured a four-column marketing footer occupying about a third
 * of the checkout and of the secure order surface, beneath the one control the
 * customer came to use, advertising a service the order is not for.
 *
 * So the marketing block is dropped on those two routes and this is what stays:
 * the brand, the policies a person paying might need to read, and the FAQ.
 * §10 is explicit that the security and support information a checkout needs
 * must **not** be removed, so the policy set is complete rather than curated —
 * a customer looking for the returns policy while paying should find it here
 * rather than have to leave — and it is one row of links rather than four
 * columns of navigation.
 *
 * The contact dock is unaffected: it is the product's only support channel and
 * it belongs to the shell, not to either footer.
 *
 * Not a second brand system (§10): the same approved lockup, the same rights
 * line, the same tagline the full footer carries.
 */
export function StorefrontTransactionalFooter() {
  const { footer } = STOREFRONT_SHELL_COPY;

  return (
    <footer className="storefront-shell__footer storefront-shell__footer--transactional">
      <div className="storefront-shell__footer-inner">
        <div className="storefront-shell__footer-brand">
          <StorefrontBrand symbol="micro" />
          <p className="storefront-shell__footer-tagline">{footer.tagline}</p>
        </div>

        <nav className="storefront-shell__footer-support" aria-label={footer.supportLabel}>
          <ul className="storefront-shell__footer-support-list">
            {POLICY_IDS.map((id) => (
              <li key={id}>
                <Link
                  className="storefront-shell__footer-support-link"
                  href={buildStorefrontPolicyPath(POLICY_SLUG[id])}
                >
                  {STOREFRONT_SHELL_COPY.footer.policyLabels[id]}
                </Link>
              </li>
            ))}
            <li>
              <Link className="storefront-shell__footer-support-link" href={STOREFRONT_FAQ_ROUTE}>
                {footer.faqLabel}
              </Link>
            </li>
          </ul>
        </nav>

        <p className="storefront-shell__footer-rights">{footer.rights}</p>
      </div>
    </footer>
  );
}
