/**
 * Feature service over the three `APP10-B01` maintenance mutations.
 *
 * A second service file beside `customer-access.service.ts`, split by
 * responsibility rather than by size: that one holds `APP4`'s reads and the
 * grant revocation, this one holds the writes that maintain a Customer. The
 * split keeps the one function that carries a real contact — the resolver —
 * in a file whose whole header is about that fact, and it keeps the two
 * checkpoints' contracts reviewable apart.
 *
 * The same rules apply as next door: the browser Axios instance is injected
 * here so hooks and components never touch Axios, a URL or the generated tree
 * (`FRONTEND_CONVENTIONS` §8); no route is spelled anywhere in this feature; and
 * every failure leaves as a `CustomerAccessApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * ### All three answer 204, and none of them invents a body
 *
 * Nothing is published back by any of these operations, which is deliberate on
 * the server's side — a 204 has nowhere for a contact value to appear. So each
 * function resolves with `void`, and the caller re-reads
 * `adminCustomerSupportDetail` to learn the new state instead of assuming the
 * value it sent is now the truth.
 */
import {
  adminCustomerContactDeactivate,
  adminCustomerContactPromote,
  adminCustomerUpdate,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type { UpdateCustomerProfileBody } from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { CustomerAccessApiError } from '../model/customer-access-failure';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

async function guardedVoid(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error: unknown) {
    throw new CustomerAccessApiError(normalizeApiClientError(error));
  }
}

/**
 * Patches the two profile fields an operator maintains.
 *
 * The body is assembled by `validateProfileDraft`, which names only the fields
 * that actually changed. Nothing is added to it here — a service that helpfully
 * echoed the unchanged field back would rewrite a note the operator never
 * opened, and would make `APP10-B01`'s `changedFields` audit summary wrong.
 */
export function updateCustomerProfile(
  customerId: string,
  body: UpdateCustomerProfileBody,
  signal?: AbortSignal,
): Promise<void> {
  return guardedVoid(() => adminCustomerUpdate(customerId, body, requestOptions(signal)));
}

/** Moves the primary designation. Both ids travel in the path; there is no body. */
export function promoteContactToPrimary(
  customerId: string,
  contactId: string,
  signal?: AbortSignal,
): Promise<void> {
  return guardedVoid(() =>
    adminCustomerContactPromote(customerId, contactId, requestOptions(signal)),
  );
}

/**
 * Retires a contact. Soft and never destructive — the row, its value and its
 * verification instant all stay exactly as they are.
 */
export function deactivateContact(
  customerId: string,
  contactId: string,
  signal?: AbortSignal,
): Promise<void> {
  return guardedVoid(() =>
    adminCustomerContactDeactivate(customerId, contactId, requestOptions(signal)),
  );
}
