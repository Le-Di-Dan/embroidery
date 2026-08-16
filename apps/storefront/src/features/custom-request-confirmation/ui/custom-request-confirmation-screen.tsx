import { ConfirmationCard } from './confirmation-card';
import { ConfirmationNextStepsCard } from './confirmation-next-steps-card';
import { ConfirmationNotIncludedCard } from './confirmation-not-included-card';

/**
 * `/yeu-cau/da-gui` — the confirmation (`660:3` desktop, `660:53` mobile).
 *
 * ### A Server Component that talks to nothing
 *
 * There is no `'use client'` here, no hook, no query client and no API call —
 * not as an optimisation, but because there is nothing to ask. `APP5-B03` is
 * grant-scoped and takes a secure-link token; no endpoint accepts a request
 * code, and adding one would make the code an authorization input, which
 * `G01 §5` forbids outright. The page therefore renders from one query
 * parameter it only ever *prints*, plus copy the design fixed.
 *
 * That is also why the request's own contents are absent. The approved desktop
 * frame carries a "Bạn đã gửi gì" panel — item name, dimensions, quantities,
 * attachment counts, submitted-at — and every field in it is data this route
 * has no authorized way to obtain. The customer reaches exactly that panel
 * through the secure link the notice above points at, where it is grant-scoped
 * and B03 returns it; reproducing it here would require the lookup-by-code
 * surface this checkpoint exists to avoid. Recorded as
 * `FU-APP5-S02-CONFIRMATION-SUMMARY-01`.
 *
 * A `section`, not a `main`: the Storefront shell already owns the single
 * `main`, header and footer.
 */
const HEADING_ID = 'confirmation-title';

export function CustomRequestConfirmationScreen({ code }: { code: string | undefined }) {
  return (
    <section className="request-confirmation" aria-labelledby={HEADING_ID}>
      <div className="request-confirmation__main">
        <ConfirmationCard code={code} headingId={HEADING_ID} />
        <ConfirmationNextStepsCard />
      </div>
      <aside className="request-confirmation__aside">
        <ConfirmationNotIncludedCard />
      </aside>
    </section>
  );
}
