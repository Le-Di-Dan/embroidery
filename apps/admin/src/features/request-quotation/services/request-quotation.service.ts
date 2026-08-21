/**
 * Feature service seam over the six operations the quotation workbench consumes:
 * `APP5-B04`'s request detail, `APP6-B01`'s two drafting writes, `APP6-B02`'s two
 * reads and `APP6-B03`'s send.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (FRONTEND_CONVENTIONS §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves this
 * module as a `RequestQuotationApiError` carrying only the normalized envelope,
 * so no raw transport error reaches React state.
 *
 * ### The send takes no body, and this seam has nowhere to put one
 *
 * `APP6-B03` names the version entirely in the path. {@link sendQuotationVersion}
 * therefore has two parameters and no third: there is no shape in which a caller
 * could send one version while naming another, and the generated operation is
 * invoked with no payload argument at all.
 *
 * ### No amount is touched on the way through
 *
 * Requests carry the operator's exact strings and responses are returned
 * unmodified. Nothing here parses, rounds, sums or reformats a figure — the
 * screen renders what the server computed.
 */
import {
  adminCustomRequestDetail,
  adminQuotationAddVersion,
  adminQuotationCreate,
  adminQuotationSendVersion,
  adminQuotationVersionDetail,
  adminQuotationVersionHistory,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AddQuotationVersionBody,
  AdminCustomRequestDetailResponse,
  AdminQuotationSentResponse,
  AdminQuotationVersionDetailResponse,
  AdminQuotationVersionHistoryResponse,
  CreateQuotationDraftBody,
  QuotationDraftedResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { RequestQuotationApiError } from '../model/request-quotation-failure';

interface SignalInput {
  readonly signal?: AbortSignal | undefined;
}

function transportOptions(signal: AbortSignal | undefined) {
  return {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  };
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw new RequestQuotationApiError(normalizeApiClientError(error));
  }
}

/**
 * The request context, and the quotation locator with it.
 *
 * The same operation `APP5-A02` reads. This screen needs it for two things: the
 * subject branch that decides which authoring form is offered, and `quotationId`
 * — the only durable way back to an unsent DRAFT after a reload.
 */
export async function fetchRequestContext({
  requestId,
  signal,
}: SignalInput & { readonly requestId: string }): Promise<AdminCustomRequestDetailResponse> {
  return call(async () => {
    const body = await adminCustomRequestDetail(requestId, transportOptions(signal));
    return body.data;
  });
}

/** Creates the quotation and its first DRAFT version in one call. */
export async function createQuotation(
  body: CreateQuotationDraftBody,
): Promise<QuotationDraftedResponse> {
  return call(async () => {
    const response = await adminQuotationCreate(body, transportOptions(undefined));
    return response.data;
  });
}

/**
 * Appends a new immutable DRAFT version to an existing quotation.
 *
 * There is no update-version operation and this seam publishes none: an earlier
 * version is never rewritten, and a re-price is always a new row.
 */
export async function addQuotationVersion(
  quotationId: string,
  body: AddQuotationVersionBody,
): Promise<QuotationDraftedResponse> {
  return call(async () => {
    const response = await adminQuotationAddVersion(quotationId, body, transportOptions(undefined));
    return response.data;
  });
}

export async function fetchVersionHistory({
  quotationId,
  signal,
}: SignalInput & { readonly quotationId: string }): Promise<AdminQuotationVersionHistoryResponse> {
  return call(async () => {
    const body = await adminQuotationVersionHistory(quotationId, transportOptions(signal));
    return body.data;
  });
}

/** One exact version's frozen lines. Never substituted with the current one. */
export async function fetchVersionDetail({
  quotationId,
  versionId,
  signal,
}: SignalInput & {
  readonly quotationId: string;
  readonly versionId: string;
}): Promise<AdminQuotationVersionDetailResponse> {
  return call(async () => {
    const body = await adminQuotationVersionDetail(
      quotationId,
      versionId,
      transportOptions(signal),
    );
    return body.data;
  });
}

/**
 * Sends the exact version named by both ids.
 *
 * No body, by contract. A replayed send returns the committed result with
 * `replayed: true` and writes nothing — the caller reports that as a replay and
 * never as a second send.
 */
export async function sendQuotationVersion(
  quotationId: string,
  versionId: string,
): Promise<AdminQuotationSentResponse> {
  return call(async () => {
    const response = await adminQuotationSendVersion(
      quotationId,
      versionId,
      transportOptions(undefined),
    );
    return response.data;
  });
}
