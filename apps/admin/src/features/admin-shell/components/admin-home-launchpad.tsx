import Link from 'next/link';

import { ADMIN_SHELL_COPY } from '../model/admin-shell-copy';
import { ADMIN_HOME_DESTINATIONS } from '../model/admin-home-destinations';

/**
 * The operator's landing screen (`V01-UX-015`, `APP12-V02` §19).
 *
 * ## What it replaced
 *
 * `APP1-A02` shipped a placeholder that said Admin access was active and that
 * "sản phẩm, đơn hàng, thiết kế và yêu cầu đặt thêu — sẽ xuất hiện trong các
 * giai đoạn tiếp theo". That was true when it was written. Eleven phases later
 * products, orders, categories, the gallery and customer support are all
 * delivered and working two clicks away, and the first thing an operator saw
 * after signing in was the product telling them none of it existed.
 *
 * ## What it is not
 *
 * Not a dashboard. §19 forbids new dashboard APIs and counters, and
 * `V01-UX-015`'s own suggestion — three counts linking into the filtered
 * queue — would need a read this page does not have. A count is also the
 * easiest thing on an operator screen to get wrong: a stale or wrongly-scoped
 * number is worse than no number, because the operator plans around it.
 *
 * So it is a launchpad: the destinations that exist, in the order an operator
 * needs them, each saying what it is for. It issues no request, holds no state
 * and renders identically for every operator.
 *
 * The set is `ADMIN_HOME_DESTINATIONS`, which is derived from the same route
 * constants and the same feature copy the sidebar reads — so a destination
 * cannot appear here under a name the navigation does not use, and a withheld
 * Wave-2 queue cannot appear at all.
 */
export function AdminHomeLaunchpad() {
  const { home } = ADMIN_SHELL_COPY;

  return (
    <section className="admin-home" aria-labelledby="admin-home-heading">
      <h1 className="admin-home__heading" id="admin-home-heading">
        {home.heading}
      </h1>
      <p className="admin-home__lead">{home.lead}</p>

      <ul className="admin-home__destinations">
        {ADMIN_HOME_DESTINATIONS.map((destination) => (
          <li key={destination.id}>
            <Link className="admin-home__destination" href={destination.href}>
              <span className="admin-home__destination-label">{destination.label}</span>
              <span className="admin-home__destination-hint">{destination.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
