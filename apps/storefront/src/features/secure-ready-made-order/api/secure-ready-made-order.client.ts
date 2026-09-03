/**
 * The six browser-side calls `/truy-cap/don-hang` makes (`APP12-S03` §5, §6,
 * §7, §17, §19, §21).
 *
 * One generated operation each, the repository's own Axios instance, and no URL
 * anywhere in this feature — a route rename arrives as a regenerated client
 * rather than as a 404 nobody notices. This is the `APP7-S01` / `APP9-S01`
 * precedent, kept.
 *
 * ### Four are Ready-Made's own; two are borrowed, and deliberately so
 *
 * `publicReadyMadeOrder_current` is `APP12-B04`'s order projection;
 * `publicOrderFullPayment_current`, `_qr` and `_initiate` are its FULL
 * obligation. The two evidence calls are `APP7-B05`'s, unchanged: `APP12-B04`
 * widened the evidence authorizer to accept a Ready-Made `FULL` attempt rather
 * than publishing a second endpoint, so a `FULL` attempt resolves through the
 * delivered route. §21 forbids adding an evidence API and this file adds none.
 * The operations' names still read `Deposit` because the path does; that is
 * transport vocabulary and `model/order-access-copy.ts` is where the customer's
 * words live instead.
 *
 * `HTTP_OPERATION_DELTA = 0`: every one of the six was delivered before this
 * checkpoint opened.
 *
 * ### Why nothing is chained onto `publicSecureLinkResolve` (§7)
 *
 * `PublicReadyMadeOrderAccessController.current` performs the whole
 * authorization chain itself — policy, the secure-link limiter, grant
 * resolution, the order the grant names, then the customer-safe projection —
 * and answers one identical `404` for every token that does not open a live
 * order grant. Resolving the link first and reading second would authorize the
 * same token twice, spend the same abuse budget twice, and keep the raw
 * credential alive across two flights for identifiers this feature never needs
 * and must never display. `publicSecureLinkResolve` therefore appears nowhere
 * in this feature, and the boundary suite asserts that it does not.
 *
 * ### The credential's whole visible life, in this file
 *
 * It arrives as an argument, is placed in a request **body**, and is gone when
 * the promise settles. No module-level variable holds it, nothing logs it, and
 * none of the six responses echoes it, so there is nothing to strip on the way
 * back. Each body is built through its generated body type rather than an
 * object literal, so a token cannot land in the wrong field and still compile.
 *
 * Every one of the six is a `POST`, including the two reads, the QR and the
 * evidence list, which write nothing at all. `ADR-APP4-001` §11 makes the URL
 * fragment the only browser carrier for a secure token and marks a path or
 * query carrier `FORBIDDEN` with no fallback: a `GET …/qr?token=…` would put a
 * live credential into the gateway access log, the application log, every proxy
 * between and the `Referer` of every link the page later renders.
 *
 * ### The keys that are not tokens
 *
 * `initiateFullPaymentAttempt` and `uploadTransferEvidence` each carry an
 * `Idempotency-Key`, which Orval emits no parameter for, so it travels through
 * the operation's own per-call config. It is *supplied* by the caller and never
 * minted here — a function that generated its own key could not be idempotent
 * by construction, since a transport retry would mint a second one and the
 * server's arbiter would see two distinct requests. §19 forbids a second
 * idempotency scheme, and there is none: this is `APP7-S01`'s, unchanged.
 *
 * Note that the *checkout* lane deliberately has no such header — `APP12-S02`
 * found that `publicReadyMadeOrder_create` arbitrates on the verified challenge
 * id instead. These two are different operations with different arbiters, and
 * this file uses the one each actually publishes.
 */
import {
  publicOrderDepositEvidenceStatus,
  publicOrderDepositEvidenceUpload,
  publicOrderFullPaymentCurrent,
  publicOrderFullPaymentInitiate,
  publicOrderFullPaymentQr,
  publicReadyMadeOrderCurrent,
  type CustomerFullPaymentResponse,
  type FullPaymentAttemptResponse,
  type FullPaymentQrBody,
  type InitiateFullPaymentAttemptBody,
  type PublicOrderDepositEvidenceUploadBody,
  type ReadFullPaymentBody,
  type ReadReadyMadeOrderBody,
  type ReadTransferEvidenceBody,
  type ReadyMadeOrderAccessResponse,
  type TransferEvidenceListResponse,
  type TransferEvidenceUploadResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';

/** The header `APP12-B04` and `APP7-B05` arbitrate a repeated write by. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * Exchanges a secure-link token for the Ready-Made order as it stands now.
 *
 * The **one** authority for every order fact this screen renders (§11): the
 * status, the frozen item, the merchandise subtotal, the delivery record, the
 * shipping fee, the live payment summary, the reservation deadline, the access
 * expiry and `terminationReason`. Nothing on this route derives an order state
 * from an attempt, a QR, an evidence row or a clock.
 *
 * The read consumes nothing and writes nothing — no attempt is opened, no state
 * moves, no reservation is extended and the link keeps working — which is why
 * it is safe to offer as a manual retry after a transport failure and safe to
 * repeat as a reconciliation re-read.
 *
 * It answers in **every** state the order can reach, which is what makes one
 * route serve the whole customer tail. Before an operator sets the shipping fee
 * it carries no `payment` object and no `delivery.feeAmount` at all — absent,
 * not zero — because no amount is owed yet.
 */
export async function readCurrentOrder(token: string): Promise<ReadyMadeOrderAccessResponse> {
  const requestBody: ReadReadyMadeOrderBody = { token };
  const body = await publicReadyMadeOrderCurrent(requestBody, {
    instance: getBrowserApiClient(),
  });
  return body.data;
}

/**
 * The live FULL obligation for the order this link opens.
 *
 * The authority for the **payable total** (§15). The order projection carries
 * `payment.payableTotal` too and the two are the same obligation's figure, but
 * §15 names this operation as the amount's source and this feature reads it
 * here: it is the call whose `payable` flag the QR and the initiation are
 * actually gated on, so taking the amount from anywhere else would let the
 * highlighted figure and the enabled controls come from two different reads.
 *
 * Called only while the order is `AWAITING_PAYMENT` (§14). Before the fee there
 * is no obligation, so this would answer `404` — and a predictable 404 is not a
 * page-control mechanism.
 *
 * It stays available after the payment window closes; `payable` is what
 * distinguishes "you may pay now" from "this is already settled", and both are
 * `200`. It publishes **no attempt state**, so this feature holds a separate
 * notion of "the attempt this session opened" rather than reading one back.
 */
export async function readCurrentFullPayment(token: string): Promise<CustomerFullPaymentResponse> {
  const requestBody: ReadFullPaymentBody = { token };
  const body = await publicOrderFullPaymentCurrent(requestBody, {
    instance: getBrowserApiClient(),
  });
  return body.data;
}

/**
 * Opens one `BANK_TRANSFER` attempt against the obligation the link opens.
 *
 * The order, the obligation, the amount, the currency, the method and the
 * step-up evidence are all resolved by the server; none of them is accepted
 * from here, and there is no field in {@link InitiateFullPaymentAttemptBody}
 * through which one could be (§19, §25). That is also why the `DEPOSIT` and
 * `REMAINING` obligations are unreachable through this call and this route is
 * `FULL`-only by construction rather than by discipline.
 *
 * This is **not** a payment: the maximum state it can produce is one attempt at
 * `PENDING`. Repeating the call with the same key replays the same attempt and
 * creates no second one.
 */
export async function initiateFullPaymentAttempt(
  token: string,
  idempotencyKey: string,
): Promise<FullPaymentAttemptResponse> {
  const requestBody: InitiateFullPaymentAttemptBody = { token };
  const body = await publicOrderFullPaymentInitiate(requestBody, {
    instance: getBrowserApiClient(),
    config: { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } },
  });
  return body.data;
}

/**
 * The bank-transfer QR for this obligation, as PNG bytes.
 *
 * The image is generated on the server from immutable inputs and is never
 * stored, so there is no object, asset or storage key for it and no URL to
 * cache. It encodes the merchant account, the obligation's exact amount and the
 * derived `FL` transfer reference — and carries no application URL, no
 * secure-link token, no attempt id and no provider reference. Requesting it
 * changes no payment state whatsoever.
 *
 * Unlike the reads it is refused when the obligation is not currently payable,
 * because a QR is an instruction to send money and one served outside that
 * window would invite a transfer nobody owes. The caller therefore enables it
 * from `payable`, never from the order status (§17, §21).
 */
export async function fetchFullPaymentQr(token: string, signal?: AbortSignal): Promise<Blob> {
  const requestBody: FullPaymentQrBody = { token };
  return publicOrderFullPaymentQr(requestBody, {
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
  /** Bytes sent so far, as a whole percentage, when the browser reports it. */
  readonly onProgress?: (percent: number) => void;
}

const PERCENT = 100;

/**
 * Streams one transfer image into private storage and queues inspection.
 *
 * The generated operation builds the `FormData` itself and appends
 * `accessToken`, `attemptId` and then `file` — alphabetical, which happens to
 * be exactly the order `APP7-B05` requires: the credential and the locator are
 * both on the wire before the first byte of the image, so the server can refuse
 * before it reads one.
 *
 * `Content-Type` is deliberately left to Axios. The generated operation
 * declares a literal `multipart/form-data`, and the mutator spreads per-call
 * config over the generated config, so passing headers here replaces that
 * literal — which is the intent, because a hand-written `multipart/form-data`
 * carries no boundary and Axios derives one from the `FormData`.
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
