import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import * as index from './index';
import {
  createBrowserApiClient,
  createServerApiClient,
  healthCheck,
  healthReadiness,
  normalizeApiClientError,
  publicProductList,
  publicProductDetail,
  PublicProductListCategorySlug,
  staffSelfGet,
  staffSessionCreate,
  staffSessionDelete,
} from './index';
import type {
  CurrentStaffResponse,
  HealthStatusResponse,
  PublicProductSummaryResponse,
  PublicProductDetailResponse,
  ReadinessStatusResponse,
  StaffLoginRequest,
  StaffSelfGet200,
} from './index';

describe('package public API smoke', () => {
  it('re-exports the generated operations and the handwritten runtime together', () => {
    expect(typeof healthCheck).toBe('function');
    expect(typeof healthReadiness).toBe('function');
    expect(typeof createBrowserApiClient).toBe('function');
    expect(typeof normalizeApiClientError).toBe('function');
    expect(typeof staffSessionCreate).toBe('function');
    expect(typeof staffSelfGet).toBe('function');
    expect(typeof staffSessionDelete).toBe('function');
    expect(typeof createServerApiClient).toBe('function');
  });

  it('exposes the staff login request type on the public boundary', () => {
    const body: StaffLoginRequest = { email: 'admin@example.test', password: 'secret' };
    expect(body.email).toBe('admin@example.test');
  });

  it('exposes the current-staff response type on the public boundary', () => {
    const view: StaffSelfGet200['data'] = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'admin@example.test',
      displayName: 'Operator',
    };
    expect(view.displayName).toBe('Operator');
  });

  it('exposes the current-staff response as a named public type', () => {
    const view: CurrentStaffResponse = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'admin@example.test',
      displayName: 'Operator',
    };
    expect(view.email).toBe('admin@example.test');
  });

  it('calls a generated operation through an injected instance with no real network', async () => {
    const captured: AxiosRequestConfig[] = [];
    const body: HealthStatusResponse = {
      service: 'api',
      status: 'ok',
      timestamp: '2026-01-01T00:00:00.000Z',
      uptimeSeconds: 1,
    };
    const instance = {
      request: (config: AxiosRequestConfig) => {
        captured.push(config);
        return Promise.resolve({ data: body });
      },
    } as unknown as AxiosInstance;

    const result = await healthCheck({ instance });

    expect(result).toEqual(body);
    expect(captured[0]).toMatchObject({ url: '/api/health', method: 'GET' });
  });

  it('exposes generated response types usable at strict compile time', () => {
    const readiness: ReadinessStatusResponse['status'] = 'ready';
    expect(readiness).toBe('ready');
  });

  it('exposes the anonymous public catalog listing for the Storefront feed', () => {
    expect(typeof publicProductList).toBe('function');
  });

  it('derives the public category slugs from the contract, not a hand-kept list', () => {
    expect(Object.values(PublicProductListCategorySlug)).toEqual([
      'thu-bong',
      'khan',
      'quan-ao',
      'khac',
    ]);
  });

  it('exposes the public list item shape on the public boundary', () => {
    const item: PublicProductSummaryResponse = {
      slug: 'gau-bong-thu-cong',
      name: 'Gấu bông thủ công',
      category: { slug: 'thu-bong', name: 'Thú bông' },
      price: { amount: '450000', currency: 'VND' },
      isDisplayOutOfStock: false,
    };
    expect(item.thumbnail).toBeUndefined();
  });

  it('exposes the anonymous detail resolver for the Product Detail page', () => {
    // Crossed the boundary in `APP2-S02`, once IMP-D039 locked `/san-pham/[slug]`.
    // It was withheld under IMP-D038 precisely because no route existed: an
    // operation on this boundary is an invitation to render a page for it.
    expect(typeof publicProductDetail).toBe('function');
  });

  it('exposes the public detail shape on the public boundary', () => {
    const detail: PublicProductDetailResponse = {
      slug: 'gau-bong-thu-cong',
      name: 'Gấu bông thủ công',
      category: { slug: 'thu-bong', name: 'Thú bông' },
      price: { amount: '450000', currency: 'VND' },
      isDisplayOutOfStock: false,
      media: [],
      seo: { isIndexable: true },
    };
    expect(detail.description).toBeUndefined();
    expect(detail.media).toEqual([]);
  });

  it('still withholds the binary media operation', () => {
    // Image bytes are loaded by the browser rendering a relative `media[].url`,
    // never streamed by application code. Nothing about `APP2-S02` changes that.
    const surface = index as Record<string, unknown>;
    expect(surface.publicProductMediaGet).toBeUndefined();
  });
});
