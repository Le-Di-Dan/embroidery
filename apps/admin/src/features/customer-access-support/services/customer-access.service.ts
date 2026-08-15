/**
 * Feature service over the five operations `APP4-A01` consumes — three from
 * `APP4-B07`, two from `APP4-B08`.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree (`FRONTEND_CONVENTIONS` §8). No route
 * is spelled anywhere in this feature: the generated client owns every URL, and
 * a copy of one in application code is how the two drift after a contract
 * change. Every failure leaves as a `CustomerAccessApiError` carrying only the
 * normalized envelope, so no raw transport error reaches React state.
 *
 * ### The contact appears in exactly one function
 *
 * `resolveCustomerByContact` is the only place a raw contact exists in this
 * application at all. It arrives as an argument, goes into the request **body**
 * — never a query parameter, because the generated operation has none — and is
 * gone when the promise settles. It is not returned, not stored, not logged and
 * not put in a query key. Everything downstream of it works from the resolved
 * `customerId`, which is an opaque identifier and not a person's address.
 */
import {
  adminCustomerSupportDetail,
  adminCustomerSupportGrants,
  adminCustomerSupportResolve,
  adminNotificationIntentList,
  adminNotificationIntentReplay,
  adminSecureGrantRevoke,
  normalizeApiClientError,
  AdminNotificationIntentListStatus,
} from '@embroidery/api-client';
import type {
  AdminCustomerDetailResponse,
  AdminCustomerGrantsResponse,
  AdminNotificationIntentListResponse,
  NotificationReplayResponse,
  ResolveCustomerByContactBody,
  ResolveCustomerByContactBodyContactKind,
  RevokeSecureGrantBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { CustomerAccessApiError } from '../model/customer-access-failure';

function requestOptions(signal?: AbortSignal) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

async function guarded<T>(work: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await work()).data;
  } catch (error: unknown) {
    throw new CustomerAccessApiError(normalizeApiClientError(error));
  }
}

/**
 * Turns one exact contact into the Customer id the rest of the screen uses.
 *
 * Returns the id alone, because that is all the contract publishes. There is
 * deliberately no variant of this that returns the contact back for display: the
 * screen renders the masked contacts from the *detail* read, which is the
 * server's own mask, rather than anything derived from what was typed.
 */
export function resolveCustomerByContact(
  contactKind: ResolveCustomerByContactBodyContactKind,
  contact: string,
  signal?: AbortSignal,
): Promise<string> {
  const body: ResolveCustomerByContactBody = { contactKind, contact };
  return guarded(() => adminCustomerSupportResolve(body, requestOptions(signal))).then(
    (resolution) => resolution.customerId,
  );
}

export function fetchCustomerDetail(
  customerId: string,
  signal?: AbortSignal,
): Promise<AdminCustomerDetailResponse> {
  return guarded(() => adminCustomerSupportDetail(customerId, requestOptions(signal)));
}

export function fetchCustomerGrants(
  customerId: string,
  signal?: AbortSignal,
): Promise<AdminCustomerGrantsResponse> {
  return guarded(() => adminCustomerSupportGrants(customerId, requestOptions(signal)));
}

/**
 * The Customer's terminal delivery failures.
 *
 * Both filters are sent to the **server**. `status=FAILED` because the approved
 * card is about failures and downloading every notification to discard most of
 * them client-side would put other customers' delivery records in this browser;
 * `customerId` because that is the only authoritative Customer binding there is
 * — it resolves through the persisted contact-point reference server-side, and
 * nothing in this feature compares a mask, a template or a timestamp to decide
 * whose a notification is.
 */
export function fetchCustomerNotifications(
  customerId: string,
  signal?: AbortSignal,
): Promise<AdminNotificationIntentListResponse> {
  return guarded(() =>
    adminNotificationIntentList(
      { status: AdminNotificationIntentListStatus.FAILED, customerId },
      requestOptions(signal),
    ),
  );
}

/** Revocation answers 204, so there is no body to read and none is invented. */
export function revokeSecureGrant(
  grantId: string,
  reason: string,
  signal?: AbortSignal,
): Promise<void> {
  const body: RevokeSecureGrantBody = { reason };
  return guarded(() =>
    adminSecureGrantRevoke(grantId, body, requestOptions(signal)).then(() => ({
      data: undefined as void,
    })),
  );
}

/**
 * Replays one terminally failed delivery.
 *
 * The path id is the whole input. There is no body: everything the replay needs
 * — the template, the channel, the masked recipient, the sealed envelope — is
 * read from the persisted records, so there is no field through which this
 * screen could point a customer's credential somewhere else, and nothing here
 * constructs one.
 */
export function replayNotification(
  intentId: string,
  signal?: AbortSignal,
): Promise<NotificationReplayResponse> {
  return guarded(() => adminNotificationIntentReplay(intentId, requestOptions(signal)));
}
