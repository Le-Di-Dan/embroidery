import { CustomerAccessScreen } from '../../../../features/customer-access-support';

/**
 * `/support/customer-access` — the Admin customer-access support screen.
 *
 * A thin boundary. The segment takes no parameter: the Customer is resolved
 * inside the capability from a contact the operator submits in a request body,
 * so there is nothing in the URL to read here and — deliberately — nowhere for a
 * contact to appear in one.
 *
 * No prefetch, and not because it would be awkward. Every read on this screen
 * depends on a Customer id that does not exist until the operator has looked
 * one up, so there is nothing to dehydrate at render time; and the reads are
 * `no-store` support reads whose whole value is being current at the moment they
 * are asked.
 */
export default function CustomerAccessPage() {
  return <CustomerAccessScreen />;
}
