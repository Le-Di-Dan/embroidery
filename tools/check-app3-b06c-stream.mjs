/**
 * `APP3-B06C` — the transport half.
 *
 * Ordering, streaming, headers and the zero-write guarantee. Split from the
 * entry point by responsibility and to keep both files under the 450-line soft
 * cap; the import cycle is the same deliberate one the authorization half
 * documents.
 */
import { CANONICAL_FILES, code, read } from './check-app3-b06c.mjs';

/** Object storage is opened last, streamed, and torn down with the client. */
export function checkStreaming(rootDir, fail) {
  const service = code(rootDir, 'service');
  const controller = code(rootDir, 'controller');

  // The ordering claim, read structurally: the descriptor call must appear before
  // the storage call, and the refusal between them must be unconditional.
  const descriptor = service.indexOf('findDeliverableCandidate');
  const storage = service.indexOf('getObjectStream');
  if (descriptor === -1 || storage === -1 || descriptor > storage) {
    fail(`${CANONICAL_FILES.service}: object storage is not opened after the descriptor`);
  }
  const between = service.slice(descriptor, storage);
  if (
    !/candidate === undefined/.test(between) ||
    !/throw designSessionAssetNotFound\(\)/.test(between)
  ) {
    fail(`${CANONICAL_FILES.service}: a missing descriptor does not refuse before storage`);
  }

  // The private bucket, and the *persisted* key — never one derived from the
  // request.
  if (!/bucket: SESSION_ASSET_BUCKET/.test(service)) {
    fail(`${CANONICAL_FILES.service}: does not read from the private derivatives bucket`);
  }
  if (!/openObject\(candidate\.storageKey, signal\)/.test(service)) {
    fail(`${CANONICAL_FILES.service}: the storage key does not come from the persisted descriptor`);
  }
  if (/params\.|lookup\.assetId.*key|key: `/.test(service)) {
    fail(`${CANONICAL_FILES.service}: a storage key is derived from the request`);
  }

  // Streamed, never buffered: a buffered read puts a whole customer upload in the
  // heap per concurrent request and destroys backpressure.
  for (const forbidden of ['Buffer.concat', 'toArray()', 'readFileSync', 'arrayBuffer(']) {
    if (service.includes(forbidden) || controller.includes(forbidden)) {
      fail(`the delivery path buffers the object ("${forbidden}")`);
    }
  }

  // Provider/database reconciliation, with the stream destroyed before refusing.
  if (!/providerSize !== candidate\.byteSize/.test(service)) {
    fail(`${CANONICAL_FILES.service}: does not reconcile the provider size against byte_size`);
  }
  if (!/result\.body\.destroy\(\)/.test(service)) {
    fail(`${CANONICAL_FILES.service}: a contradicted object leaves its stream draining`);
  }
  if (!/DESIGN_SESSION_ASSET_UNAVAILABLE/.test(service)) {
    fail(`${CANONICAL_FILES.service}: a storage contradiction is not the 503 vocabulary`);
  }
  // An authorized-but-absent object must not become a privacy 404.
  const errors = code(rootDir, 'errors');
  if (
    !/DESIGN_SESSION_ASSET_UNAVAILABLE: \(payload\) => new ServiceUnavailableException/.test(errors)
  ) {
    fail(`${CANONICAL_FILES.errors}: the unavailable code is not a 503`);
  }
  if (!/DESIGN_SESSION_ASSET_NOT_FOUND: \(payload\) => new NotFoundException/.test(errors)) {
    fail(`${CANONICAL_FILES.errors}: the miss code is not a 404`);
  }

  // The client's disconnect tears the body down rather than draining into a
  // socket nobody reads.
  if (!/watchClientDisconnect\(request, response\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: does not watch the client connection`);
  }
  if (!/addEventListener\('abort', \(\) => stream\.body\.destroy\(\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: a disconnect does not destroy the open body`);
  }
}

/** `no-store`, `nosniff`, `inline`, and nothing else. */
export function checkHeaders(rootDir, fail) {
  const controller = code(rootDir, 'controller');
  const policy = code(rootDir, 'policy');

  if (!/SESSION_ASSET_CACHE_CONTROL = 'no-store'/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: the delivery response is not no-store`);
  }
  if (!/SESSION_ASSET_CONTENT_TYPE_OPTIONS = 'nosniff'/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: the delivery response is not nosniff`);
  }
  if (!/SESSION_ASSET_CONTENT_DISPOSITION = 'inline'/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: the delivery response is not inline`);
  }

  const setHeaders = controller.match(/response\.setHeader\(/g) ?? [];
  if (setHeaders.length !== 2) {
    fail(`${CANONICAL_FILES.controller}: sets ${String(setHeaders.length)} headers; expected 2`);
  }

  // A Session's authorization expires while its bytes do not, so a cacheable
  // directive would keep serving a customer's photograph to a browser that can no
  // longer prove it owns the session.
  //
  // Asserted against the *values actually sent*, not by banning words. The
  // published description legitimately says the bytes are immutable while the
  // authorisation is not, and a word ban would fire on that correct prose — the
  // same proxy failure `APP3-B06B` recorded, where a gate that banned a word
  // started refusing an accurate artifact.
  const sent = (controller.match(/response\.setHeader\((.*)\)/g) ?? []).join('\n');
  for (const forbidden of [/max-age/i, /immutable/i, /public/i, /ETag/i, /Last-Modified/i]) {
    if (forbidden.test(sent)) {
      fail(`${CANONICAL_FILES.controller}: sends a forbidden cache header (${String(forbidden)})`);
    }
  }
  // These may not appear anywhere in the delivery source, prose included: unlike
  // "immutable" they have no honest use in a description of this route.
  for (const forbidden of [/Accept-Ranges/i, /Content-Range/i, /filename:/i]) {
    if (forbidden.test(controller)) {
      fail(`${CANONICAL_FILES.controller}: sets a forbidden header (${String(forbidden)})`);
    }
  }

  // The persisted media type, never the parent Asset's `mime_type`, which
  // describes the original nobody may see.
  if (!/type: stream\.contentType/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: does not answer with the persisted media type`);
  }
  if (/mimeType|mime_type/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: reaches the parent asset's mime type`);
  }
}

/**
 * Nothing on this path can write, and the guarantee is structural rather than a
 * promise.
 */
export function checkReadOnly(rootDir, fail) {
  const module = code(rootDir, 'module');
  const port = code(rootDir, 'port');

  // The port has exactly one method, and it is a read. A delivery route holding a
  // writable repository is one refactor away from writing.
  const methods = port.match(/^\s{2}\w+\(/gm) ?? [];
  if (methods.length !== 1 || !port.includes('findDeliverableCandidate(')) {
    fail(`${CANONICAL_FILES.port}: declares ${String(methods.length)} methods; expected one read`);
  }
  for (const forbidden of [
    'attachAsset',
    'save',
    'advance',
    'rotate',
    'submit',
    'expire',
    'delete',
  ]) {
    if (new RegExp(`\\b${forbidden}\\w*\\(`).test(port)) {
      fail(`${CANONICAL_FILES.port}: exposes a write ("${forbidden}")`);
    }
  }

  // The delivery service resolves through the read port only.
  const service = code(rootDir, 'service');
  if (/DESIGN_SESSION_REPOSITORY|DesignSessionRepository/.test(service)) {
    fail(`${CANONICAL_FILES.service}: reaches the writable Session repository`);
  }
  for (const forbidden of ['Audit', 'Outbox', 'outbox', 'audit', 'Normalization', 'Idempotency']) {
    if (service.includes(forbidden)) {
      fail(`${CANONICAL_FILES.service}: can append or enqueue ("${forbidden}")`);
    }
  }

  // The module wires the read port and the delivery service; it must not have
  // acquired a bucket bootstrap, which a read path may never be able to call.
  if (!/DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY/.test(module)) {
    fail(`${CANONICAL_FILES.module}: does not bind the read-only delivery port`);
  }
  if (!/DesignSessionAssetDeliveryService/.test(module)) {
    fail(`${CANONICAL_FILES.module}: does not provide the delivery service`);
  }
  if (!/DesignSessionReadGuard/.test(module)) {
    fail(`${CANONICAL_FILES.module}: does not provide the read guard`);
  }

  // Nothing anywhere on the path may leak a storage identity or a credential.
  for (const key of ['service', 'controller', 'errors', 'policy']) {
    const source = code(rootDir, key);
    for (const forbidden of ['presign', 'getSignedUrl', 'accessKey', 'secretKey', 'endpoint']) {
      if (new RegExp(forbidden, 'i').test(source)) {
        fail(`${CANONICAL_FILES[key]}: names a storage credential or presign ("${forbidden}")`);
      }
    }
  }

  // The live proof exists and actually asserts the zero-write claim, rather than
  // the checkpoint reporting it.
  const live = read(rootDir, 'liveSpec') ?? '';
  for (const table of ['audit_events', 'outbox_events', 'design_session_assets']) {
    if (!live.includes(table)) {
      fail(`${CANONICAL_FILES.liveSpec}: does not prove ${table} is unchanged`);
    }
  }
}
