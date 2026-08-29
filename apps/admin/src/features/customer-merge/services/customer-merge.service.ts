/**
 * Feature service over the four merge operations — three from `APP10-B02`, one
 * from `APP10-B03`.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree (`FRONTEND_CONVENTIONS` §8). No route
 * is spelled anywhere in this feature: the generated client owns every URL, and
 * a copy of one in application code is how the two drift after a contract
 * change. Every failure leaves as a `CustomerAccessApiError` carrying only the
 * normalized envelope — the same error type the support capability publishes, so
 * one classifier shape serves both screens and no raw transport error reaches
 * React state.
 *
 * ### No contact value passes through this file
 *
 * `openMergeCase` takes two Customer ids and a reason. Both ids came from the
 * exact-contact resolver in `customer-access-support`, which is the only place in
 * this application where a real contact exists; by the time a merge is opened
 * the addresses are gone and what travels is opaque. The API would refuse them
 * anyway — `OpenCustomerMergeBody` has no contact field — but the point is that
 * there is no code path here that could carry one.
 *
 * ### Execute takes no body, and none is invented
 *
 * Survivor and loser come from the case. There is deliberately no parameter on
 * `executeMergeCase` through which a caller could name a different pair, swap
 * them or skip a step, and adding one would be adding a capability the API does
 * not have.
 */
import {
  adminCustomerMergeDetail,
  adminCustomerMergeExecute,
  adminCustomerMergeOpen,
  adminCustomerMergeReject,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminCustomerMergeCaseResponse,
  AdminCustomerMergeExecutedResponse,
  OpenCustomerMergeBody,
  RejectCustomerMergeBody,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { CustomerAccessApiError } from '../../customer-access-support';

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
 * Opens a REQUESTED case for one explicitly chosen pair.
 *
 * Returns the case id alone, because that is the address of everything that
 * follows and the only part of the response the workflow needs: the status is
 * always REQUESTED, and the screen navigates to the authoritative detail rather
 * than rendering anything from this answer.
 */
export function openMergeCase(
  survivorCustomerId: string,
  loserCustomerId: string,
  reason: string,
  signal?: AbortSignal,
): Promise<string> {
  const body: OpenCustomerMergeBody = { survivorCustomerId, loserCustomerId, reason };
  return guarded(() => adminCustomerMergeOpen(body, requestOptions(signal))).then(
    (opened) => opened.mergeCaseId,
  );
}

export function fetchMergeCase(
  mergeCaseId: string,
  signal?: AbortSignal,
): Promise<AdminCustomerMergeCaseResponse> {
  return guarded(() => adminCustomerMergeDetail(mergeCaseId, requestOptions(signal)));
}

/**
 * Performs the merge the case describes.
 *
 * The response's `outcome` is the authoritative EXECUTED / ALREADY_EXECUTED the
 * completion states are keyed on — it exists precisely so a client never has to
 * infer a replay from timing or a remembered id, and neither is inferred here.
 */
export function executeMergeCase(
  mergeCaseId: string,
  signal?: AbortSignal,
): Promise<AdminCustomerMergeExecutedResponse> {
  return guarded(() => adminCustomerMergeExecute(mergeCaseId, requestOptions(signal)));
}

/** Rejection answers 204, so there is no body to read and none is invented. */
export function rejectMergeCase(
  mergeCaseId: string,
  reason: string,
  signal?: AbortSignal,
): Promise<void> {
  const body: RejectCustomerMergeBody = { reason };
  return guarded(() =>
    adminCustomerMergeReject(mergeCaseId, body, requestOptions(signal)).then(() => ({
      data: undefined as void,
    })),
  );
}
