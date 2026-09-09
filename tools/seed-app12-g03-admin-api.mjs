/**
 * The delivered Admin HTTP surface, as the `APP12-G03` seeder uses it.
 *
 * `APP12-G03` §1 is explicit: *"Do not direct-write a table when a delivered
 * runtime/Admin operation can create the same business object."* Every business
 * object in the UAT baseline therefore arrives through the same operations an
 * operator's browser calls — same envelope, same optimistic-concurrency tokens,
 * same publication gate, same audited stock ledger. That is what makes the
 * dataset semantically equivalent to production persistence rather than a set of
 * rows that merely look like it.
 *
 * ## The credential is never read out
 *
 * `CLAUDE.md` §8a and `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §9a: a
 * secret-bearing variable is not read out of `.env`, echoed, logged or passed as
 * an argument. `STAFF_BOOTSTRAP_PASSWORD` reaches this module the allowed way —
 * file → process — by running the seeder as `node --env-file=.env`. It is read
 * from `process.env` once, sent in one JSON body over the loopback gateway, and
 * never stored, printed or written to the manifest. `redact()` below is the
 * backstop for anything that might carry it into a log line.
 *
 * ## Why no Origin header
 *
 * `RequestOriginPolicy` treats a request with neither `Origin` nor `Referer` as
 * non-browser and allows it; a *present but foreign* origin is refused. A CLI
 * that invented an origin header would be asserting something untrue about
 * itself, so this sends none.
 *
 * ## The envelope is the contract
 *
 * Every internal API response is the standard envelope
 * (`BACKEND_CONVENTIONS`): `{ success, code, message, data, meta }`. `request()`
 * refuses anything else rather than reaching into an unknown shape, and lifts
 * `code`/`message` into the thrown error so a refusal reads as the refusal the
 * application actually issued.
 */
import { randomUUID } from 'node:crypto';

/** How long any single Admin call may take before the seeder gives up. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Strips anything that looks like the operator's password out of a string.
 *
 * Cheap and deliberately blunt: the seeder never intends to print a credential,
 * and this exists so that an unintended path cannot.
 */
export function redact(text, secret) {
  if (typeof secret !== 'string' || secret.length < 4) {
    return text;
  }
  return text.replaceAll(secret, '«redacted»');
}

/** Thrown when the application refuses. Carries the envelope's own vocabulary. */
export class AdminApiError extends Error {
  constructor({ status, code, message, operation }) {
    super(
      `${operation} → HTTP ${String(status)} ${code ?? 'UNKNOWN'}: ${message ?? '(no message)'}`,
    );
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
    this.operation = operation;
  }
}

/**
 * An authenticated Admin session.
 *
 * The session token lives in a `Set-Cookie` and never in a body, so the client
 * keeps the raw cookie pair and echoes it. It does not parse the cookie name:
 * the name is `CookiePolicyService`'s to choose, and a client that hard-coded it
 * would break silently the day it changed.
 */
export class AdminApiSession {
  #baseUrl;
  #cookie = undefined;
  #secret;

  /**
   * `baseUrl` is the Admin's own origin (`http://admin.embroidery.local`), not
   * `localhost` with a `Host` header: the gateway routes by `server_name`, and
   * `fetch` silently drops `Host` because it is a forbidden header name — a
   * request built that way reaches the catch-all server and answers
   * `404 unknown host` while looking like an application refusal.
   */
  constructor({ baseUrl, secret }) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#secret = secret;
  }

  /** Establishes the session. The password is sent once and kept nowhere. */
  async login(email) {
    const response = await this.#fetch('/api/staff/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: this.#secret }),
    });
    if (response.status !== 204 && response.status !== 200) {
      const detail = await this.#readEnvelopeSafely(response);
      throw new AdminApiError({
        status: response.status,
        code: detail.code,
        message: detail.message,
        operation: 'staffSession_create',
      });
    }
    const setCookie = response.headers.getSetCookie?.() ?? [];
    const first = setCookie[0];
    if (first === undefined) {
      throw new Error('staffSession_create returned no Set-Cookie; cannot continue.');
    }
    this.#cookie = first.split(';', 1)[0];
  }

  /** Revokes the session. Best effort — a failure here must not fail the run. */
  async logout() {
    if (this.#cookie === undefined) {
      return;
    }
    try {
      await this.#fetch('/api/staff/session', { method: 'DELETE' });
    } catch {
      // The session expires on its own; a failed revoke is not a seeding fault.
    }
    this.#cookie = undefined;
  }

  /**
   * One JSON Admin operation.
   *
   * `operation` is the OpenAPI `operationId`, so a failure names the delivered
   * operation that refused rather than a URL the report's reader has to map back.
   */
  async request(operation, { method, path, body, idempotencyKey }) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (idempotencyKey !== undefined) {
      headers['idempotency-key'] = idempotencyKey;
    }
    const response = await this.#fetch(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return this.#envelope(response, operation);
  }

  /**
   * `adminAsset_upload`: one image, multipart, with the metadata parts ahead of
   * the file exactly as the contract requires ("Must arrive before the file
   * part") — the server streams and would refuse a file it met first.
   */
  async uploadAsset({ body, mediaType, fileName, idempotencyKey }) {
    const form = new FormData();
    form.append('assetKind', 'CATALOG_MEDIA');
    form.append('classification', 'PRODUCTION_SENSITIVE');
    form.append('file', new Blob([body], { type: mediaType }), fileName);
    const response = await this.#fetch('/api/admin/assets/upload', {
      method: 'POST',
      headers: { accept: 'application/json', 'idempotency-key': idempotencyKey },
      body: form,
    });
    return this.#envelope(response, 'adminAsset_upload');
  }

  /**
   * Whether `adminAsset_preview` serves this rendition yet.
   *
   * A `200` with an `image/*` content type is the only affirmative answer: the
   * bytes exist and the delivery path can hand them to a browser. `404` means
   * the derivative is not there yet, and a `503` means storage is momentarily
   * unavailable — both are "not yet", not a fault, because the caller is
   * polling. Anything else is a real refusal and is raised.
   */
  async renditionAvailable({ assetId, rendition }) {
    const response = await this.#fetch(`/api/admin/assets/${assetId}/${rendition}`, {
      method: 'GET',
      headers: { accept: 'image/*' },
    });
    if (response.status === 200) {
      // The body is bytes, not an envelope. Drain it so the socket is reusable.
      await response.arrayBuffer();
      return (response.headers.get('content-type') ?? '').startsWith('image/');
    }
    if (response.status === 404 || response.status === 503) {
      await response.arrayBuffer();
      return false;
    }
    const detail = await this.#readEnvelopeSafely(response);
    throw new AdminApiError({
      status: response.status,
      code: detail.code,
      message: detail.message,
      operation: 'adminAsset_preview',
    });
  }

  async #envelope(response, operation) {
    const payload = await this.#readEnvelopeSafely(response);
    if (!response.ok) {
      throw new AdminApiError({
        status: response.status,
        code: payload.code,
        message: payload.message,
        operation,
      });
    }
    if (payload.success !== true) {
      throw new AdminApiError({
        status: response.status,
        code: payload.code,
        message: payload.message ?? 'response was not the standard success envelope',
        operation,
      });
    }
    return payload.data;
  }

  async #readEnvelopeSafely(response) {
    const text = await response.text();
    if (text === '') {
      return {};
    }
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return { message: redact(text.slice(0, 300), this.#secret) };
    }
  }

  async #fetch(path, init) {
    const headers = {
      ...(init.headers ?? {}),
      'x-request-id': `app12-g03-${randomUUID().replaceAll('-', '').slice(0, 20)}`,
    };
    if (this.#cookie !== undefined) {
      headers.cookie = this.#cookie;
    }
    return fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}

/** The two renditions the publication gate's derivatives back (`APP2-B03`). */
export const REQUIRED_RENDITIONS = Object.freeze(['thumbnail', 'catalog-preview']);

/**
 * Waits until an Asset is publishable, using only reads the Admin screen makes.
 *
 * The upload answers `202`: the object is stored synchronously, but inspection
 * and derivation are the worker's, so an Asset is not publishable the instant
 * the POST returns. Waiting on the *delivered* pipeline rather than writing
 * derivative rows is the whole difference between §8's "real media" and a
 * fabricated one.
 *
 * Two reads, because neither alone answers the question:
 *
 * - `adminAsset_detail` carries the lifecycle status and nothing about
 *   derivatives — its response has no `derivatives` field at all — so it can say
 *   `ACCEPTED` while the renditions are still being written.
 * - `adminAsset_preview` serves the rendition bytes, so a `200` is proof the
 *   derivative exists and is deliverable. It is also exactly what the Admin grid
 *   requests for every tile, which means an Asset this function accepts is an
 *   Asset the operator will see as a photograph.
 *
 * A `REJECTED` status ends the wait immediately: inspection has decided, and no
 * amount of further polling changes it.
 */
export async function waitForAssetReady({
  session,
  assetId,
  timeoutMs = 120_000,
  intervalMs = 1_000,
}) {
  const deadline = Date.now() + timeoutMs;
  let status = 'UNKNOWN';
  let ready = [];
  for (;;) {
    const detail = await session.request('adminAsset_detail', {
      method: 'GET',
      path: `/api/admin/assets/${assetId}`,
    });
    status = detail.status;
    if (status === 'REJECTED') {
      throw new Error(
        `APP12-G03: asset ${assetId} was REJECTED by inspection; the seeder will not publish it.`,
      );
    }
    if (status === 'ACCEPTED') {
      ready = [];
      for (const rendition of REQUIRED_RENDITIONS) {
        if (await session.renditionAvailable({ assetId, rendition })) {
          ready.push(rendition);
        }
      }
      if (ready.length === REQUIRED_RENDITIONS.length) {
        return { assetId, status, byteSize: detail.byteSize, checksum: detail.checksum };
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `APP12-G03: asset ${assetId} did not become publishable within ` +
          `${String(Math.round(timeoutMs / 1000))}s (status ${status}, ` +
          `renditions ${ready.join(',') || 'none'}). Is the worker running?`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
