/**
 * Fixtures for the `APP5-S01` suites.
 *
 * Every value is synthetic. The ids are readable strings rather than real
 * UUIDv7s on purpose: an assertion that a *specific* variant id reached the
 * submission is only convincing if the id is recognisable, and nothing in the
 * browser validates their shape — the server does.
 */
import {
  CustomRequestAssetStatusResponseState,
  type ApiSuccessResponse,
  type CustomRequestAssetIntakeResponse,
  type CustomRequestAssetStatusResponse,
  type CustomRequestSubmissionResponse,
  type PublicProductVariantListResponse,
  type PublicProductVariantResponse,
} from '@embroidery/api-client';

export function envelopeOf<T>(data: T): ApiSuccessResponse & { data: T } {
  return {
    success: true,
    code: 'OK',
    message: 'OK',
    data,
    meta: { requestId: 'req-test', timestamp: '2026-08-16T09:00:00.000Z' },
  };
}

export const PRODUCT_SLUG = 'ao-thun-co-tron';
export const PRODUCT_ID = 'product-app5-s01';

/** Two variants, so "the first one" is never the same as "the chosen one". */
export const VARIANT_RED = 'variant-red-m';
export const VARIANT_BLUE = 'variant-blue-l';

export function makeVariant(
  productVariantId: string,
  colorName: string | null,
  sizeLabel: string | null,
): PublicProductVariantResponse {
  // `skus` is the `APP12-B01` Ready-Made purchase projection. Empty here on
  // purpose: the custom-request flow neither reads it nor is affected by it, and
  // a fixture that populated it would suggest this screen cared.
  return { productVariantId, colorName, sizeLabel, skus: [] };
}

export function makeVariantList(
  variants: PublicProductVariantResponse[] = [
    makeVariant(VARIANT_RED, 'Đỏ', 'M'),
    makeVariant(VARIANT_BLUE, 'Xanh', 'L'),
  ],
): PublicProductVariantListResponse {
  return { productId: PRODUCT_ID, variants };
}

export const ASSET_ID = 'asset-cop-0001';

export function makeIntake(
  assetId = ASSET_ID,
  role: CustomRequestAssetIntakeResponse['role'] = 'COP_IMAGE',
): CustomRequestAssetIntakeResponse {
  return {
    assetId,
    byteSize: 2048,
    mediaType: 'image/png',
    role,
    state: 'INSPECTING',
  };
}

export function makeAssetStatus(
  state: CustomRequestAssetStatusResponse['state'],
  bindable: boolean,
  assetId = ASSET_ID,
): CustomRequestAssetStatusResponse {
  return { assetId, bindable, state };
}

export const ACCEPTED_STATUS = makeAssetStatus(
  CustomRequestAssetStatusResponseState.ACCEPTED,
  true,
);
export const INSPECTING_STATUS = makeAssetStatus(
  CustomRequestAssetStatusResponseState.INSPECTING,
  false,
);
export const REJECTED_STATUS = makeAssetStatus(
  CustomRequestAssetStatusResponseState.REJECTED,
  false,
);

export const REQUEST_CODE = 'YC-2026-000123';

export function makeSubmission(): CustomRequestSubmissionResponse {
  return { code: REQUEST_CODE, requestId: 'request-0001', status: 'NEW' };
}

/**
 * An Axios-shaped rejection carrying a real error **envelope**, which is how the
 * API answers a business refusal — the normalizer reads `code` from the body,
 * never from the message, so the code is what a test must supply.
 */
export function envelopeFailure(status: number, code: string): unknown {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: 'Request failed',
    response: {
      status,
      data: {
        success: false,
        code,
        // Deliberately server-flavoured prose. No assertion may find it on
        // screen: §12 keeps server sentences out of customer copy.
        message: 'internal detail: constraint fk_custom_requests__product_variant_id',
        meta: { requestId: 'req-test', timestamp: '2026-08-16T09:00:00.000Z' },
      },
    },
    toJSON: () => ({}),
  };
}

/** A refusal whose body is not an envelope at all (a proxy 404, say). */
export function bareFailure(status: number): unknown {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: 'Request failed',
    response: { status, data: {} },
    toJSON: () => ({}),
  };
}

/** A transport failure with no response at all — the uncertain-outcome path. */
export function networkFailure(): unknown {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    code: 'ECONNRESET',
    message: 'Network Error',
    toJSON: () => ({}),
  };
}

/** A PNG the size checks accept, small enough to build in memory. */
export function makeImageFile(name = 'anh-cua-toi.png'): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/png' });
}
