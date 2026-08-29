import { MergeSelectionScreen } from '../../../../../features/customer-merge';

/**
 * `/support/customer-access/merge` — choosing the two Customers to merge
 * (`APP10-A02`).
 *
 * A thin boundary, and a **sub-route** of the existing customer-access support
 * entry rather than a section of its own: the shell's `resolveNavItemState`
 * already answers `'section'` for anything under `…/customer-access/`, so the
 * approved sidenav keeps the support entry lit and APP10 adds no item to it.
 *
 * The segment takes no parameter and publishes no query string. Both
 * participants are resolved inside the screen from contacts submitted in request
 * bodies, so there is nothing in the URL to read here and — deliberately —
 * nowhere for a contact to appear in one.
 *
 * No prefetch: every read on this screen depends on a Customer id that does not
 * exist until the operator has looked one up.
 */
export default function CustomerMergeSelectionPage() {
  return <MergeSelectionScreen />;
}
