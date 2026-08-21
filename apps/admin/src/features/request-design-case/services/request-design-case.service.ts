/**
 * Feature service seam over the five Admin operations this screen consumes:
 * `adminCustomRequest_detail`, `adminCustomRequestSubmittedDesign_get`,
 * `adminCustomRequestDesignVersion_list`, `_detail`, `_create` and `_send`, plus
 * `adminCustomRequestAsset_get` for customer-owned evidence bytes.
 *
 * The browser Axios instance is injected here so hooks and components never
 * touch Axios, a URL or the generated tree directly (`FRONTEND_CONVENTIONS` §8),
 * and the Admin session cookie rides the same client every other Admin screen
 * uses — this feature creates no auth path of its own. Every failure leaves this
 * module as a `RequestDesignCaseApiError` carrying only the normalized envelope,
 * so no raw transport error reaches React state.
 *
 * ### Everything is addressed by the request
 *
 * No function here takes a design case id, a design session id or a version id
 * on its own. `requestId` is a parameter of every call, because it is what the
 * server binds ownership to: the design case is resolved from the request's own
 * pointer, and `versionId` is a locator inside that case rather than an address
 * of its own. There is no bucket, storage key, presign or asset token anywhere
 * on this path.
 *
 * ### The send takes no body
 *
 * `sendDesignVersion` names the version entirely by the path. There is
 * deliberately no shape a caller could use to send one version while naming
 * another, and no field for the request status the server may project as a
 * consequence.
 *
 * ### Nothing here logs a document
 *
 * The submitted source and the exact-version detail both carry a customer's
 * artwork. It is returned to the caller and never printed, never stored and
 * never attached to an error.
 */
import {
  adminCustomRequestAssetGet,
  adminCustomRequestDesignVersionCreate,
  adminCustomRequestDesignVersionDetail,
  adminCustomRequestDesignVersionList,
  adminCustomRequestDesignVersionSend,
  adminCustomRequestDetail,
  adminCustomRequestSubmittedDesignGet,
  normalizeApiClientError,
} from '@embroidery/api-client';
import type {
  AdminCustomRequestDetailResponse,
  AdminSubmittedDesignResponse,
  AuthorDesignVersionBody,
  DesignVersionCreatedResponse,
  DesignVersionDetailResponse,
  DesignVersionListResponse,
  DesignVersionSentResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { RequestDesignCaseApiError } from '../model/request-design-case-failure';

interface RequestScopedInput {
  readonly requestId: string;
  readonly signal?: AbortSignal | undefined;
}

function signalConfig(signal: AbortSignal | undefined) {
  return signal === undefined ? {} : { config: { signal } };
}

/** The request context: the gate's status, the subject branch, the evidence list. */
export async function fetchRequestContext({
  requestId,
  signal,
}: RequestScopedInput): Promise<AdminCustomRequestDetailResponse> {
  try {
    const body = await adminCustomRequestDetail(requestId, {
      instance: getBrowserApiClient(),
      ...signalConfig(signal),
    });
    return body.data;
  } catch (error: unknown) {
    throw new RequestDesignCaseApiError(normalizeApiClientError(error));
  }
}

/**
 * The submitted Design Session document, or its explicit absence.
 *
 * `submittedDesign: null` is a **successful** read, not a failure: a
 * customer-owned-product request has no Design Session by design, and a Catalog
 * request whose session was swept has none any more. It is returned as-is so the
 * screen can render the approved honest-absence state rather than an error.
 */
export async function fetchSubmittedSource({
  requestId,
  signal,
}: RequestScopedInput): Promise<AdminSubmittedDesignResponse> {
  try {
    const body = await adminCustomRequestSubmittedDesignGet(requestId, {
      instance: getBrowserApiClient(),
      ...signalConfig(signal),
    });
    return body.data;
  } catch (error: unknown) {
    throw new RequestDesignCaseApiError(normalizeApiClientError(error));
  }
}

/** The version history. The design case is resolved server-side. */
export async function fetchDesignVersions({
  requestId,
  signal,
}: RequestScopedInput): Promise<DesignVersionListResponse> {
  try {
    const body = await adminCustomRequestDesignVersionList(requestId, {
      instance: getBrowserApiClient(),
      ...signalConfig(signal),
    });
    return body.data;
  } catch (error: unknown) {
    throw new RequestDesignCaseApiError(normalizeApiClientError(error));
  }
}

export interface VersionScopedInput extends RequestScopedInput {
  readonly versionId: string;
}

/**
 * One exact version, with its document, its decisions and its approval evidence.
 *
 * Both ids are parameters because both are matched server-side: a version on
 * another request's design case answers exactly as one that does not exist.
 */
export async function fetchDesignVersionDetail({
  requestId,
  versionId,
  signal,
}: VersionScopedInput): Promise<DesignVersionDetailResponse> {
  try {
    const body = await adminCustomRequestDesignVersionDetail(requestId, versionId, {
      instance: getBrowserApiClient(),
      ...signalConfig(signal),
    });
    return body.data;
  } catch (error: unknown) {
    throw new RequestDesignCaseApiError(normalizeApiClientError(error));
  }
}

export interface CreateDesignVersionInput extends RequestScopedInput {
  readonly body: AuthorDesignVersionBody;
}

/**
 * Appends one new DRAFT version.
 *
 * The body carries the document and — on the customer-owned branch only — the
 * two agreed placement labels and the positive placement envelope. It carries no
 * request id, no case id, no branch, no Catalog identity, no status, no version
 * number, no parent and no hash: `APP6-B08`'s schema is `.strict()` and every
 * one of those is server-owned, so sending one is a refusal rather than a
 * silently ignored field.
 */
export async function createDesignVersion({
  requestId,
  body,
  signal,
}: CreateDesignVersionInput): Promise<DesignVersionCreatedResponse> {
  try {
    const response = await adminCustomRequestDesignVersionCreate(requestId, body, {
      instance: getBrowserApiClient(),
      ...signalConfig(signal),
    });
    return response.data;
  } catch (error: unknown) {
    throw new RequestDesignCaseApiError(normalizeApiClientError(error));
  }
}

/** Sends the exact version named by the path. Bodyless. */
export async function sendDesignVersion({
  requestId,
  versionId,
  signal,
}: VersionScopedInput): Promise<DesignVersionSentResponse> {
  try {
    // Three arguments, and the third is transport options. The generated
    // operation has no body parameter at all, which is the contract making the
    // §18 rule unrepresentable rather than merely documented.
    const response = await adminCustomRequestDesignVersionSend(requestId, versionId, {
      instance: getBrowserApiClient(),
      ...signalConfig(signal),
    });
    return response.data;
  } catch (error: unknown) {
    throw new RequestDesignCaseApiError(normalizeApiClientError(error));
  }
}

export interface FetchEvidenceInput extends RequestScopedInput {
  readonly assetId: string;
}

/**
 * One private evidence image, as a `Blob`.
 *
 * The generated operation already sets `responseType: 'blob'`; this seam adds
 * only the instance and the cancellation signal. The bytes are never persisted,
 * never logged and never turned into a URL here — the browser resource is the
 * caller's to own and, more importantly, to revoke.
 */
export async function fetchRequestEvidence({
  requestId,
  assetId,
  signal,
}: FetchEvidenceInput): Promise<Blob> {
  try {
    return await adminCustomRequestAssetGet(requestId, assetId, {
      instance: getBrowserApiClient(),
      ...signalConfig(signal),
    });
  } catch (error: unknown) {
    throw new RequestDesignCaseApiError(normalizeApiClientError(error));
  }
}
