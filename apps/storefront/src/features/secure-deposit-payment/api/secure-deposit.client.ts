/**
 * The five browser-side calls `/truy-cap/thanh-toan` makes (`APP7-S01` §3).
 *
 * One generated operation each, the repository's own Axios instance, and no URL
 * anywhere in this feature — a route rename arrives as a regenerated client
 * rather than as a 404 nobody notices. This is the `APP6-S01` precedent, kept.
 *
 * ### The credential's whole visible life, in this file
 *
 * It arrives as an argument, is placed in a request **body**, and is gone when
 * the promise settles. No module-level variable holds it, nothing logs it, and
 * none of the five responses echoes it, so there is nothing to strip on the way
 * back. Each body is built through its generated body type rather than an object
 * literal, so a token cannot land in the wrong field and still compile.
 *
 * Every one of the five is a `POST`, including the QR and the evidence list,
 * which write nothing at all. `ADR-APP4-001` §11 makes the URL fragment the only
 * browser carrier for a secure token and marks a path or query carrier
 * `FORBIDDEN` with no fallback: a `GET …/qr?token=…` would put a live credential
 * into the gateway access log, the application log, every proxy between and the
 * `Referer` of every link the page later renders. `APP7-B03` settled that for
 * the server; this file simply has no other shape available to it.
 *
 * ### Why nothing is chained onto `publicSecureLinkResolve`
 *
 * `APP7-B03` and `APP7-B05` perform the whole authorization chain themselves —
 * policy, the secure-link limiter, grant resolution, the order the grant names,
 * then the customer-safe projection. Resolving the link first and reading second
 * would authorize the same token twice, spend the same abuse budget twice, and
 * keep the raw credential alive across two flights for identifiers this feature
 * never needs and must never display. The same ruling `APP5-S02` and `APP6-S01`
 * made.
 *
 * ### The two keys that are not tokens
 *
 * `initiateDepositAttempt` and `uploadTransferEvidence` each carry an
 * `Idempotency-Key`, which Orval emits no parameter for, so it travels through
 * the operation's own per-call config exactly as `APP5-B02`'s upload does. It is
 * *supplied* by the caller and never minted here — a function that generated its
 * own key could not be idempotent by construction, since a transport retry would
 * mint a second one and the server's arbiter would see two distinct requests.
 */
import {
  publicOrderDepositCurrent,
  publicOrderDepositEvidenceStatus,
  publicOrderDepositEvidenceUpload,
  publicOrderDepositInitiate,
  publicOrderDepositQr,
  type CustomerDepositResponse,
  type DepositAttemptResponse,
  type DepositQrBody,
  type InitiateDepositAttemptBody,
  type PublicOrderDepositEvidenceUploadBody,
  type ReadDepositBody,
  type ReadTransferEvidenceBody,
  type TransferEvidenceListResponse,
  type TransferEvidenceUploadResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

/** The header `APP7-B03` and `APP7-B05` arbitrate a repeated write by. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * Exchanges a secure-link token for the deposit facts as they stand now.
 *
 * The read consumes nothing and writes nothing — no attempt is opened, no state
 * moves and the link keeps working — which is why it is safe to offer as a
 * manual retry after a transport failure and safe to repeat as the single
 * reconciliation re-read (§24, §29).
 *
 * It publishes **no attempt state**. That is a fact of the contract, recorded on
 * the approved handoff map (`754:3`), and it is why this feature holds a
 * separate notion of "the attempt this session opened" rather than reading one
 * back out of the deposit.
 */
export async function readCurrentDeposit(token: string): Promise<CustomerDepositResponse> {
  const requestBody: ReadDepositBody = { token };
  const body = await publicOrderDepositCurrent(requestBody, { instance: getBrowserApiClient() });
  return body.data;
}

/**
 * Opens one `BANK_TRANSFER` attempt against the deposit the link opens.
 *
 * The obligation, the amount, the currency, the method and the step-up evidence
 * are all resolved by the server; none of them is accepted from here, and there
 * is no field in {@link InitiateDepositAttemptBody} through which one could be.
 * This is **not** a payment: the maximum state it can produce is one attempt at
 * `PENDING`.
 *
 * Repeating the call with the same key replays the same attempt and answers
 * `replayed: true`; a deliberate retry sends a new key and gets a new attempt.
 */
export async function initiateDepositAttempt(
  token: string,
  idempotencyKey: string,
): Promise<DepositAttemptResponse> {
  const requestBody: InitiateDepositAttemptBody = { token };
  const body = await publicOrderDepositInitiate(requestBody, {
    instance: getBrowserApiClient(),
    config: { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } },
  });
  return body.data;
}

/**
 * The bank-transfer QR for this deposit, as PNG bytes.
 *
 * The image is generated on the server from immutable inputs and is never
 * stored, so there is no object, asset or storage key for it and no URL to
 * cache. It encodes the merchant account, the obligation's exact amount and the
 * derived transfer reference — and carries no application URL, no secure-link
 * token, no attempt id and no provider reference. Requesting it changes no
 * payment state whatsoever.
 */
export async function fetchDepositQr(token: string, signal?: AbortSignal): Promise<Blob> {
  const requestBody: DepositQrBody = { token };
  return publicOrderDepositQr(requestBody, {
    instance: getBrowserApiClient(),
    ...(signal === undefined ? {} : { config: { signal } }),
  });
}

export interface UploadTransferEvidenceInput {
  readonly token: string;
  /** The attempt the image belongs to. A locator, never an authorization. */
  readonly attemptId: string;
  readonly file: File;
  /**
   * One logical upload's identity, minted once per customer action and reused
   * only across a transport retry of that same action.
   */
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
  /**
   * Bytes sent so far, as a whole percentage, when the browser reports it.
   *
   * Progress is a courtesy the approved frame draws (`748:42`) and nothing
   * depends on it: a browser that reports no total simply never calls this, and
   * the panel says *đang tải lên* without a figure.
   */
  readonly onProgress?: (percent: number) => void;
}

const PERCENT = 100;

/**
 * Streams one transfer image into private storage and queues inspection.
 *
 * The generated operation builds the `FormData` itself and appends
 * `accessToken`, `attemptId` and then `file` — alphabetical, which happens to be
 * exactly the order `APP7-B05` requires: the credential and the locator are both
 * on the wire before the first byte of the image, so the server can refuse
 * before it reads one.
 *
 * `Content-Type` is deliberately left to Axios. The generated operation declares
 * a literal `multipart/form-data`, and the mutator spreads per-call config over
 * the generated config, so passing headers here replaces that literal — which is
 * the intent, because a hand-written `multipart/form-data` carries no boundary
 * and Axios derives one from the `FormData`.
 */
export async function uploadTransferEvidence(
  input: UploadTransferEvidenceInput,
): Promise<TransferEvidenceUploadResponse> {
  const requestBody: PublicOrderDepositEvidenceUploadBody = {
    accessToken: input.token,
    attemptId: input.attemptId,
    file: input.file,
  };
  const body = await publicOrderDepositEvidenceUpload(requestBody, {
    instance: getBrowserApiClient(),
    config: {
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      headers: { [IDEMPOTENCY_KEY_HEADER]: input.idempotencyKey },
      onUploadProgress: (event) => {
        const report = input.onProgress;
        if (report === undefined || event.total === undefined || event.total === 0) return;
        report(Math.round((event.loaded / event.total) * PERCENT));
      },
    },
  });
  return body.data;
}

/**
 * What has been submitted for one attempt, and how far inspection has got.
 *
 * Metadata and status only — never bytes, never a URL, never a storage
 * location, and there is no customer operation that serves an image back. The
 * list is bounded at five, so there is no cursor and an empty list is an
 * ordinary case rather than a failure.
 */
export async function readTransferEvidence(
  token: string,
  attemptId: string,
): Promise<TransferEvidenceListResponse> {
  const requestBody: ReadTransferEvidenceBody = { accessToken: token, attemptId };
  const body = await publicOrderDepositEvidenceStatus(requestBody, {
    instance: getBrowserApiClient(),
  });
  return body.data;
}
