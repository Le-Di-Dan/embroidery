/**
 * The pure decisions behind the screen: status interpretation, page
 * accumulation, cursor resolution, local file policy, idempotency intent and
 * the translation of a backend failure into safe copy.
 */
import { ASSET_COPY } from '../../src/features/assets/model/asset-copy';
import {
  describeApiFailure,
  describeLocalRejection,
  describeUnknownFailure,
  AssetApiError,
} from '../../src/features/assets/model/asset-failure';
import { flattenAssetPages, resolveNextCursor } from '../../src/features/assets/model/asset-pages';
import {
  assetQueryKeys,
  ASSET_LIST_PAGE_SIZE,
} from '../../src/features/assets/model/asset-query-keys';
import {
  assetStatusLabel,
  isReconciliationPending,
  parseAssetStatus,
} from '../../src/features/assets/model/asset-status';
import {
  ASSET_FILE_ACCEPT,
  MAX_UPLOAD_BYTES,
  validateSelectedFiles,
} from '../../src/features/assets/model/asset-upload-policy';
import {
  createIdempotencyKey,
  createUploadIntent,
  IdempotencyKeyUnavailableError,
} from '../../src/features/assets/model/upload-intent';
import { makeAsset, makeFile, makePage } from '../support/asset-fixture';

describe('asset status interpretation', () => {
  it('maps the four known lifecycle states to the approved labels', () => {
    expect(assetStatusLabel(parseAssetStatus('UPLOADED'))).toBe('Đã tải lên / Đang chờ xử lý');
    expect(assetStatusLabel(parseAssetStatus('INSPECTING'))).toBe('Đang xử lý');
    expect(assetStatusLabel(parseAssetStatus('ACCEPTED'))).toBe('Sẵn sàng');
    expect(assetStatusLabel(parseAssetStatus('REJECTED'))).toBe('Không thể sử dụng');
  });

  it('fails safely on an unknown status: never raw, never inferred as ready', () => {
    for (const value of ['QUARANTINED', 'accepted', '', null, undefined, 7]) {
      const presentation = parseAssetStatus(value);
      expect(presentation).toBe('UNKNOWN');
      expect(assetStatusLabel(presentation)).toBe(ASSET_COPY.status.unknown);
      expect(assetStatusLabel(presentation)).not.toBe(ASSET_COPY.status.ready);
    }
    expect(assetStatusLabel(parseAssetStatus('QUARANTINED'))).not.toContain('QUARANTINED');
  });

  it('keeps reconciliation open only for the two in-flight states', () => {
    expect(isReconciliationPending(parseAssetStatus('UPLOADED'))).toBe(true);
    expect(isReconciliationPending(parseAssetStatus('INSPECTING'))).toBe(true);
    expect(isReconciliationPending(parseAssetStatus('ACCEPTED'))).toBe(false);
    expect(isReconciliationPending(parseAssetStatus('REJECTED'))).toBe(false);
    // An uninterpretable status stops the poll rather than looping forever.
    expect(isReconciliationPending(parseAssetStatus('SOMETHING_NEW'))).toBe(false);
  });
});

describe('page accumulation', () => {
  const first = makeAsset({ assetId: 'a-1' });
  const second = makeAsset({ assetId: 'a-2' });
  const third = makeAsset({ assetId: 'a-3' });

  it('renders every accumulated page in server order', () => {
    const items = flattenAssetPages([makePage([first, second], 'c1'), makePage([third])]);
    expect(items.map((item) => item.assetId)).toEqual(['a-1', 'a-2', 'a-3']);
  });

  it('keeps one representation of a repeated asset without reordering prior items', () => {
    const items = flattenAssetPages([makePage([first, second], 'c1'), makePage([second, third])]);
    expect(items.map((item) => item.assetId)).toEqual(['a-1', 'a-2', 'a-3']);
  });

  it('resolves a continuation only when both parts of the contract hold', () => {
    expect(resolveNextCursor(makePage([first], 'cursor-2'))).toBe('cursor-2');
    expect(resolveNextCursor(makePage([first]))).toBeUndefined();
    expect(resolveNextCursor({ hasNext: true, items: [first] })).toBeUndefined();
    expect(resolveNextCursor({ hasNext: true, items: [first], nextCursor: '' })).toBeUndefined();
    expect(
      resolveNextCursor({ hasNext: false, items: [first], nextCursor: 'stale' }),
    ).toBeUndefined();
    expect(resolveNextCursor(undefined)).toBeUndefined();
  });
});

describe('query keys', () => {
  it('requests the contract page size and carries nothing sensitive', () => {
    expect(ASSET_LIST_PAGE_SIZE).toBe(20);
    expect(assetQueryKeys.list()).toEqual(['admin', 'assets', 'list', { pageSize: 20 }]);
    expect(assetQueryKeys.detail('a-1')).toEqual(['admin', 'assets', 'detail', 'a-1']);
    expect(JSON.stringify(assetQueryKeys.list())).not.toMatch(/idempotency|file|cookie|token/i);
  });
});

describe('local file policy', () => {
  it('offers exactly the three accepted media types to the picker', () => {
    expect(ASSET_FILE_ACCEPT).toBe('image/png,image/jpeg,image/webp');
  });

  it('accepts a single supported image at exactly the maximum size', () => {
    const file = makeFile('a.png', 'image/png', MAX_UPLOAD_BYTES);
    expect(MAX_UPLOAD_BYTES).toBe(26_214_400);
    expect(validateSelectedFiles([file])).toEqual({ ok: true, file });
  });

  it('rejects the first byte above the maximum', () => {
    const file = makeFile('a.png', 'image/png', MAX_UPLOAD_BYTES + 1);
    expect(validateSelectedFiles([file])).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });

  it('rejects unsupported media, including SVG, and more than one file', () => {
    expect(validateSelectedFiles([makeFile('a.svg', 'image/svg+xml', 10)])).toEqual({
      ok: false,
      reason: 'MEDIA_UNSUPPORTED',
    });
    expect(validateSelectedFiles([makeFile('a.gif', 'image/gif', 10)])).toEqual({
      ok: false,
      reason: 'MEDIA_UNSUPPORTED',
    });
    expect(
      validateSelectedFiles([
        makeFile('a.png', 'image/png', 10),
        makeFile('b.png', 'image/png', 10),
      ]),
    ).toEqual({ ok: false, reason: 'MULTIPLE_FILES' });
    expect(validateSelectedFiles([])).toEqual({ ok: false, reason: 'NO_FILE' });
  });

  it('never states a size limit in the support copy', () => {
    expect(ASSET_COPY.upload.formats).toBe('Hỗ trợ định dạng PNG, JPEG và WebP.');
    expect(ASSET_COPY.errors.tooLarge).not.toMatch(/\d/);
  });
});

describe('idempotency intent', () => {
  /** Shadow a Crypto.prototype method on the instance to simulate its absence. */
  function hide(method: 'randomUUID' | 'getRandomValues') {
    Object.defineProperty(globalThis.crypto, method, { value: undefined, configurable: true });
  }
  function restore(method: 'randomUUID' | 'getRandomValues') {
    delete (globalThis.crypto as Partial<Crypto>)[method];
  }

  it('mints a distinct key per intent that satisfies the B01 allowlist', () => {
    const pattern = /^[A-Za-z0-9._:-]+$/;
    const first = createUploadIntent(makeFile('a.png', 'image/png', 10));
    const second = createUploadIntent(makeFile('b.png', 'image/png', 10));

    for (const key of [first.idempotencyKey, second.idempotencyKey]) {
      expect(key).toMatch(pattern);
      expect(key.length).toBeGreaterThanOrEqual(8);
      expect(key.length).toBeLessThanOrEqual(128);
    }
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });

  /**
   * Regression: the development gateway serves the Admin over plain HTTP on a
   * named host, which is NOT a secure context, so `crypto.randomUUID` — which
   * is specified `[SecureContext]` — is absent there. Throwing at that point
   * killed every upload before a request was ever made.
   */
  it('still mints a strong key when randomUUID is absent (insecure context)', () => {
    // The methods live on Crypto.prototype, so an insecure context is simulated
    // by shadowing them on the instance; deleting the shadow restores the real
    // implementation exactly.
    hide('randomUUID');
    try {
      expect(typeof globalThis.crypto.randomUUID).toBe('undefined');

      const keys = [createIdempotencyKey(), createIdempotencyKey()];
      for (const key of keys) {
        expect(key).toMatch(/^[A-Za-z0-9._:-]+$/);
        // A v4 UUID: correct version nibble and variant, from getRandomValues.
        expect(key).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(key).toHaveLength(36);
      }
      expect(keys[0]).not.toBe(keys[1]);
    } finally {
      restore('randomUUID');
    }
  });

  it('fails loudly only when Web Crypto is unavailable altogether', () => {
    hide('randomUUID');
    hide('getRandomValues');
    try {
      expect(() => createIdempotencyKey()).toThrow(IdempotencyKeyUnavailableError);
    } finally {
      restore('randomUUID');
      restore('getRandomValues');
    }
  });
});

describe('failure translation', () => {
  it('maps local rejections to actionable guidance', () => {
    expect(describeLocalRejection('TOO_LARGE').message).toBe(ASSET_COPY.errors.tooLarge);
    expect(describeLocalRejection('MEDIA_UNSUPPORTED').message).toBe(
      ASSET_COPY.errors.mediaUnsupported,
    );
    expect(describeLocalRejection('MULTIPLE_FILES').retryable).toBe(false);
  });

  it('maps each safe backend outcome without echoing the server message', () => {
    const cases: ReadonlyArray<[string, number, string, boolean]> = [
      ['ASSET_UPLOAD_MEDIA_UNSUPPORTED', 415, ASSET_COPY.errors.mediaUnsupported, false],
      ['ASSET_UPLOAD_SIGNATURE_MISMATCH', 415, ASSET_COPY.errors.signatureMismatch, false],
      ['ASSET_UPLOAD_TOO_LARGE', 413, ASSET_COPY.errors.tooLarge, false],
      ['ASSET_UPLOAD_METADATA_INVALID', 400, ASSET_COPY.errors.metadataInvalid, false],
      ['IDEMPOTENCY_CONFLICT', 409, ASSET_COPY.errors.idempotencyConflict, false],
      ['ASSET_UPLOAD_IN_PROGRESS', 409, ASSET_COPY.errors.uploadInProgress, true],
      ['ASSET_UPLOAD_TIMEOUT', 408, ASSET_COPY.errors.timeout, true],
      ['INTERNAL_SERVER_ERROR', 503, ASSET_COPY.errors.unavailable, true],
    ];
    for (const [code, httpStatus, message, retryable] of cases) {
      const failure = describeApiFailure({ code, message: 'raw server text', httpStatus });
      expect(failure.message).toBe(message);
      expect(failure.retryable).toBe(retryable);
      expect(failure.message).not.toContain('raw server text');
    }
  });

  it('routes a 401 to the shell session behaviour and a 429 to rate-limit copy', () => {
    const expired = describeApiFailure({ code: 'UNAUTHORIZED', message: 'x', httpStatus: 401 });
    expect(expired.sessionExpired).toBe(true);
    expect(expired.retryable).toBe(false);
    expect(
      describeApiFailure({ code: 'TOO_MANY_REQUESTS', message: 'x', httpStatus: 429 }),
    ).toEqual({
      message: ASSET_COPY.errors.rateLimited,
      retryable: true,
      sessionExpired: false,
    });
  });

  it('never leaks a request id, a field error or a native error', () => {
    const failure = describeApiFailure({
      code: 'ASSET_UPLOAD_METADATA_INVALID',
      message: 'bucket embroidery-private key 01920000',
      httpStatus: 400,
      requestId: 'req-abc-123',
      fieldErrors: [{ field: 'file', code: 'X', message: 'sha256 mismatch' }],
    });
    expect(failure.message).toBe(ASSET_COPY.errors.metadataInvalid);
    expect(failure.message).not.toMatch(/req-abc-123|bucket|sha256|01920000/);

    const native = describeUnknownFailure(new TypeError('e.target is undefined'));
    expect(native.message).toBe(ASSET_COPY.errors.unexpected);
    expect(native.message).not.toContain('e.target');
  });

  it('carries only the normalized error on the thrown service error', () => {
    const error = new AssetApiError({ code: 'ASSET_NOT_FOUND', message: 'gone', httpStatus: 404 });
    expect(describeUnknownFailure(error).message).toBe(ASSET_COPY.errors.notFound);
    expect(Object.keys(error)).not.toContain('config');
  });
});
