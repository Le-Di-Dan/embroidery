/**
 * @jest-environment jsdom
 *
 * The transport gate (`APP2-A01` §13): proof that the *generated* B01 operation
 * can express everything the upload needs — ordered multipart parts, the
 * `Idempotency-Key` header, an `AbortSignal` and upload progress — without a
 * raw URL, a hand-built request or a manually written multipart boundary.
 *
 * The generated operation and the real mutator both run here; only the Axios
 * instance is a stub, so what is asserted is the request the repository would
 * actually put on the wire.
 */
import {
  adminAssetUpload,
  AdminAssetUploadBodyAssetKind,
  AdminAssetUploadBodyClassification,
} from '@embroidery/api-client';
import type { AxiosRequestConfig } from 'axios';

import { makeFile } from '../support/asset-fixture';

interface CapturedRequest extends AxiosRequestConfig {
  data?: FormData;
}

function stubInstance(captured: CapturedRequest[]) {
  return {
    request: (config: CapturedRequest) => {
      captured.push(config);
      return Promise.resolve({ data: { data: { assetId: 'a-1' } } });
    },
  } as never;
}

describe('generated multipart upload transport', () => {
  const file = makeFile('hoa-sen-moi.png', 'image/png', 2_516_582);

  it('sends the two metadata parts before the file part', async () => {
    const captured: CapturedRequest[] = [];
    await adminAssetUpload(
      {
        assetKind: AdminAssetUploadBodyAssetKind.CATALOG_MEDIA,
        classification: AdminAssetUploadBodyClassification.PRODUCTION_SENSITIVE,
        file,
      },
      { instance: stubInstance(captured) },
    );

    const body = captured[0]?.data;
    expect(body).toBeInstanceOf(FormData);
    // B01 requires both metadata parts to arrive before the file part.
    expect([...(body as FormData).keys()]).toEqual(['assetKind', 'classification', 'file']);
    expect((body as FormData).get('assetKind')).toBe('CATALOG_MEDIA');
    expect((body as FormData).get('classification')).toBe('PRODUCTION_SENSITIVE');
    expect((body as FormData).get('file')).toBe(file);
  });

  it('targets the generated operation URL and method — no handwritten path', async () => {
    const captured: CapturedRequest[] = [];
    await adminAssetUpload(
      {
        assetKind: AdminAssetUploadBodyAssetKind.CATALOG_MEDIA,
        classification: AdminAssetUploadBodyClassification.PRODUCTION_SENSITIVE,
        file,
      },
      { instance: stubInstance(captured) },
    );

    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/admin/assets/upload');
  });

  it('carries the idempotency header, the abort signal and the progress callback', async () => {
    const captured: CapturedRequest[] = [];
    const controller = new AbortController();
    const onUploadProgress = jest.fn();

    await adminAssetUpload(
      {
        assetKind: AdminAssetUploadBodyAssetKind.CATALOG_MEDIA,
        classification: AdminAssetUploadBodyClassification.PRODUCTION_SENSITIVE,
        file,
      },
      {
        instance: stubInstance(captured),
        config: {
          headers: { 'Idempotency-Key': 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
          signal: controller.signal,
          onUploadProgress,
        },
      },
    );

    const request = captured[0];
    expect(request?.headers).toEqual({
      'Idempotency-Key': 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    });
    expect(request?.signal).toBe(controller.signal);
    expect(request?.onUploadProgress).toBe(onUploadProgress);
  });

  it('never writes a multipart boundary by hand', async () => {
    const captured: CapturedRequest[] = [];
    await adminAssetUpload(
      {
        assetKind: AdminAssetUploadBodyAssetKind.CATALOG_MEDIA,
        classification: AdminAssetUploadBodyClassification.PRODUCTION_SENSITIVE,
        file,
      },
      {
        instance: stubInstance(captured),
        config: { headers: { 'Idempotency-Key': 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' } },
      },
    );

    expect(JSON.stringify(captured[0]?.headers ?? {})).not.toMatch(/boundary/i);
  });
});
