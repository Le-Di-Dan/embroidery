/**
 * The Busboy streaming parser for the single-file upload (`APP2-B01` §6).
 *
 * It owns the multipart *shape* and nothing else: no hashing, no size counting,
 * no storage, no idempotency. Its contract is "hand me a request, get back the
 * two metadata values and an unread file stream, or an error".
 *
 * The ordering rule — metadata fields strictly before the file part — is what
 * makes the whole pre-stream design possible. Without it the fingerprint, the
 * object key and the idempotency claim could only be computed after bytes had
 * already arrived, and there would be nowhere to put them.
 *
 * `resolve` fires from inside the `file` handler with the stream still unread.
 * Busboy stalls until that stream is consumed, which is exactly what we want:
 * the durable allocation commits first, and only then does the caller start
 * reading bytes.
 */
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';

import Busboy from 'busboy';

import { assetIntakeError, AssetIntakeError } from '../../domain/asset-intake.errors';
import {
  UPLOAD_FIELD_ASSET_KIND,
  UPLOAD_FIELD_CLASSIFICATION,
  UPLOAD_FILE_PART,
} from '../../domain/asset-intake.policy';
import { ADMIN_CATALOG_INTAKE_LANE, type AssetIntakeLane } from '../../domain/intake-lane';

/** Bounds on the metadata half of the body, independent of the file limit. */
const MAX_FIELD_VALUE_BYTES = 128;

/** The contract carries exactly two fields. */
const EXPECTED_FIELDS = 2;

/**
 * Busboy's own cap, set one above the contract.
 *
 * Set to exactly two, Busboy's `fieldsLimit` would fire before the explicit
 * rules below could ever run — a third field would be reported as "too many
 * fields" instead of the specific violation it is, and the ordering check would
 * become unreachable code. One spare lets the intentional rule decide, while
 * the cap still stops an unbounded field flood.
 */
const MAX_FIELDS = EXPECTED_FIELDS + 1;

export interface OpenedUpload {
  /** The client-declared content type of the file part, not yet allowlisted. */
  readonly declaredMediaType: string;
  /** The raw filename as sent; normalized by the caller, never stored. */
  readonly rawFilename: string;
  /** Unread. Consuming it is what lets the rest of the body flow. */
  readonly stream: Readable;
  /**
   * Resolves once the whole body has been parsed and no extra part appeared.
   * Rejects with the shape violation a late part introduced.
   */
  finish(): Promise<void>;
}

interface PendingState {
  assetKind?: string;
  classification?: string;
  fileSeen: boolean;
}

/**
 * Rejects anything that is not exactly the one contract shape.
 *
 * A duplicate field is a rejection rather than last-wins: two different values
 * for `classification` in one body has no correct interpretation, and picking
 * one would silently accept a request the client did not mean to send.
 */
function readField(state: PendingState, lane: AssetIntakeLane, name: string, value: string): void {
  if (!lane.declaresMetadataFields) {
    // This lane's body is one file part and nothing else, so any field at all
    // is a shape violation rather than an unrecognised name.
    throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
  }
  if (state.fileSeen) {
    // A field after the file part cannot participate in the fingerprint that
    // was already computed, so accepting it would make the receipt a lie.
    throw assetIntakeError('ASSET_UPLOAD_INVALID_MULTIPART');
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_FIELD_VALUE_BYTES) {
    throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
  }
  if (name === UPLOAD_FIELD_ASSET_KIND) {
    if (state.assetKind !== undefined || value !== lane.assetKind) {
      throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
    }
    state.assetKind = value;
    return;
  }
  if (name === UPLOAD_FIELD_CLASSIFICATION) {
    // The classification is fixed by policy and is not client-selectable; the
    // field exists so the request is self-describing, not so it can vary.
    if (state.classification !== undefined || value !== lane.classification) {
      throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
    }
    state.classification = value;
    return;
  }
  throw assetIntakeError('ASSET_UPLOAD_METADATA_INVALID');
}

/**
 * Starts parsing and resolves at the file part.
 *
 * The `signal` aborts the parse from outside — a timeout, a size violation
 * detected downstream, or a storage failure — so one abort reason tears down
 * the request body and the upload together.
 */
export function openMultipartUpload(
  request: IncomingMessage,
  signal: AbortSignal,
  lane: AssetIntakeLane = ADMIN_CATALOG_INTAKE_LANE,
): Promise<OpenedUpload> {
  return new Promise<OpenedUpload>((resolve, reject) => {
    let busboy: Busboy.Busboy;
    try {
      busboy = Busboy({
        headers: request.headers,
        // Defence in depth behind the explicit checks below: even if a rule
        // were removed, the parser itself would still refuse a second file.
        limits: {
          files: 1,
          fields: MAX_FIELDS,
          fieldSize: MAX_FIELD_VALUE_BYTES,
          fileSize: lane.maxUploadBytes + 1,
        },
      });
    } catch {
      // Busboy throws when the content type is absent or not multipart.
      reject(assetIntakeError('ASSET_UPLOAD_INVALID_MULTIPART'));
      return;
    }

    const state: PendingState = { fileSeen: false };
    let settled = false;
    let finishReject: ((error: Error) => void) | undefined;
    let finishResolve: (() => void) | undefined;
    let finishError: Error | undefined;
    let finished = false;

    const fail = (error: Error): void => {
      // Tearing the parser down is unconditional, not just a pre-resolution
      // step. After the file part has been handed over, the caller is blocked
      // reading that stream; if a timeout or a disconnect only recorded an
      // error without destroying Busboy, the file stream would simply stop
      // producing and the request would hang past its own deadline — which is
      // the failure the deadline exists to prevent.
      request.unpipe(busboy);
      busboy.destroy();

      if (!settled) {
        settled = true;
        reject(error);
        return;
      }
      finishError ??= error;
      finishReject?.(finishError);
    };

    const onAbort = (): void => {
      fail(signal.reason instanceof AssetIntakeError ? signal.reason : abortReason(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    busboy.on('field', (name: string, value: string) => {
      try {
        readField(state, lane, name, value);
      } catch (error: unknown) {
        fail(error instanceof Error ? error : assetIntakeError('ASSET_UPLOAD_METADATA_INVALID'));
      }
    });

    busboy.on('file', (name: string, stream: Readable, info: Busboy.FileInfo) => {
      if (state.fileSeen || name !== UPLOAD_FILE_PART) {
        discard(stream);
        fail(assetIntakeError('ASSET_UPLOAD_INVALID_MULTIPART'));
        return;
      }
      if (
        lane.declaresMetadataFields &&
        (state.assetKind === undefined || state.classification === undefined)
      ) {
        discard(stream);
        fail(assetIntakeError('ASSET_UPLOAD_METADATA_INVALID'));
        return;
      }
      state.fileSeen = true;
      settled = true;
      // Tearing Busboy down mid-parse makes this stream emit `Unexpected end of
      // file`. The consumer's `for await` observes that and rejects normally,
      // but only while it is still iterating — once it has stopped, the same
      // emit would be an unhandled stream error and would end the process. A
      // permanent no-op listener makes the emit survivable without suppressing
      // anything: the async iterator still sees and reports it.
      stream.on('error', () => undefined);
      resolve({
        declaredMediaType: info.mimeType,
        rawFilename: info.filename,
        stream,
        finish: () =>
          new Promise<void>((resolveFinish, rejectFinish) => {
            if (finishError !== undefined) {
              rejectFinish(finishError);
              return;
            }
            if (finished) {
              resolveFinish();
              return;
            }
            finishResolve = resolveFinish;
            finishReject = rejectFinish;
          }),
      });
    });

    busboy.on('filesLimit', () => fail(assetIntakeError('ASSET_UPLOAD_INVALID_MULTIPART')));
    busboy.on('fieldsLimit', () => fail(assetIntakeError('ASSET_UPLOAD_METADATA_INVALID')));
    busboy.on('error', () => fail(assetIntakeError('ASSET_UPLOAD_INVALID_MULTIPART')));

    busboy.on('close', () => {
      signal.removeEventListener('abort', onAbort);
      if (!state.fileSeen) {
        fail(assetIntakeError('ASSET_UPLOAD_INVALID_MULTIPART'));
        return;
      }
      finished = true;
      if (finishError === undefined) {
        finishResolve?.();
      } else {
        finishReject?.(finishError);
      }
    });

    // A client that disconnects mid-body never emits `close` on Busboy, so the
    // request's own abort is what unblocks `finish()`.
    request.on('aborted', () => fail(assetIntakeError('ASSET_UPLOAD_INVALID_MULTIPART')));
    // `pipe` does not forward source errors, so a socket that fails mid-body
    // would emit `error` on the request with no listener and take the process
    // down. Handling it here is also what turns a dropped connection into a
    // settled rejection instead of a request that hangs until the deadline.
    request.on('error', () => fail(assetIntakeError('ASSET_UPLOAD_INVALID_MULTIPART')));
    request.pipe(busboy);
  });
}

/**
 * Drops a file part this request will never process.
 *
 * The error listener is not optional: destroying Busboy mid-parse makes the
 * in-flight file stream emit `Unexpected end of file`, and an unhandled
 * `error` on a stream terminates the process. The rejection is already being
 * reported through `fail`, so this listener only has to stop that emit from
 * being fatal.
 */
function discard(stream: Readable): void {
  stream.on('error', () => undefined);
  stream.resume();
}

function abortReason(signal: AbortSignal): AssetIntakeError {
  return signal.reason instanceof AssetIntakeError
    ? signal.reason
    : assetIntakeError('ASSET_UPLOAD_TIMEOUT');
}
