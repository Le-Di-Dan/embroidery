/**
 * The one derivative write (`APP3-W01A`, reused unchanged by `APP3-W01B`).
 *
 * Extracted so the raster lane and the Template SVG lane share a single copy of
 * the ordering that a live suite caught intermittently and only once. The
 * counter **is** the upload body and the upload runs as its own promise:
 * handing the upload to the pipeline's final-destination callback instead
 * resolves when the *source* ends rather than when the multipart upload
 * completes, so a row could be finalized before the object existed. Two copies
 * of that reasoning is how one of them loses it.
 *
 * The returned pair is measured on the bytes that actually reached the store,
 * never on what was requested (IMP-D044 PO-07, PO-12).
 */
import type { Writable } from 'node:stream';
import type { ObjectStoragePort } from '@embroidery/object-storage';

import {
  abortFailure,
  isAbort,
  toRetryableFailure,
} from '../../asset-inspection/application/storage-failure';
import { DigestCounterStream } from '../../asset-inspection/infrastructure/streams/digest-counter.stream';

const OPERATION = 'derivative upload';

export interface DerivativeObjectWriteInput {
  readonly storage: ObjectStoragePort;
  readonly key: string;
  readonly contentType: string;
  readonly signal: AbortSignal;
  /** Fills the counted sink. Whatever reaches it is what the object becomes. */
  readonly fill: (sink: Writable) => Promise<void>;
}

export interface DerivativeObjectWriteResult {
  readonly checksum: string;
  readonly byteSize: bigint;
}

export async function writeDerivativeObject(
  input: DerivativeObjectWriteInput,
): Promise<DerivativeObjectWriteResult> {
  const counter = new DigestCounterStream();

  const upload = (async () =>
    input.storage.putObjectStream({
      bucket: 'DERIVATIVES',
      key: input.key,
      body: counter,
      contentType: input.contentType,
      signal: input.signal,
    }))();

  let uploadFailure: unknown;
  // Observed immediately: an unattached rejection here would surface as an
  // unhandled rejection and take the worker process down.
  const settled = upload.then(
    () => undefined,
    (error: unknown) => {
      uploadFailure = error;
      // Once the upload is gone nothing will read `counter` again, so the
      // producer would sit on backpressure until the attempt timed out.
      counter.destroy(error instanceof Error ? error : new Error('derivative upload failed'));
      return error;
    },
  );

  try {
    await input.fill(counter);
  } catch (error: unknown) {
    await settled;
    const cause = uploadFailure ?? error;
    if (isAbort(input.signal, cause)) throw abortFailure(OPERATION);
    throw toRetryableFailure(OPERATION, cause);
  }

  const uploadError = await settled;
  if (uploadError !== undefined) {
    if (isAbort(input.signal, uploadError)) throw abortFailure(OPERATION);
    throw toRetryableFailure(OPERATION, uploadError);
  }

  return { checksum: counter.digest(), byteSize: BigInt(counter.byteSize) };
}
