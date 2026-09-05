/**
 * Publication screen states — `/products/[productId]/publication`.
 *
 * Asserted at the generated-client boundary, so what the screen renders is
 * driven by exactly what `adminProduct_publicationReadiness` and
 * `adminProduct_detail` would return.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  within,
} from '@embroidery/frontend-testing';
import { adminProductDetail, adminProductPublicationReadiness } from '@embroidery/api-client';

import { ProductPublicationScreen } from '../../src/features/products/components/product-publication-screen';
import { PRODUCT_PUBLICATION_COPY } from '../../src/features/products/model/product-publication-copy';
import { makeApiClientError } from '../support/api-error';
import {
  makeProductDetail,
  makeProductMedia,
  makeReadiness,
  productDetailEnvelope,
  readinessEnvelope,
  REQUIREMENT_CODES,
} from '../support/product-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/products/p-1/publication').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductDetail: jest.fn(),
  adminProductPublicationReadiness: jest.fn(),
}));

const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const readinessMock = adminProductPublicationReadiness as jest.MockedFunction<
  typeof adminProductPublicationReadiness
>;

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';

beforeEach(() => {
  jest.clearAllMocks();
});

function render() {
  return renderWithProviders(<ProductPublicationScreen productId={PRODUCT_ID} />);
}

async function renderLoaded(detailOverrides = {}, readinessOverrides = {}) {
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail(detailOverrides)));
  readinessMock.mockResolvedValue(readinessEnvelope(makeReadiness(readinessOverrides)));
  const result = render();
  await screen.findByRole('heading', { level: 1 });
  return result;
}

describe('load states', () => {
  it('shows the loading state before the product arrives', () => {
    detailMock.mockReturnValue(new Promise(() => {}) as never);
    readinessMock.mockReturnValue(new Promise(() => {}) as never);
    render();

    expect(screen.getByRole('status')).toHaveTextContent(PRODUCT_PUBLICATION_COPY.screen.loading);
  });

  it('shows not found for a product that does not exist', async () => {
    detailMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'PRODUCT_NOT_FOUND' }));
    readinessMock.mockResolvedValue(readinessEnvelope(makeReadiness()));
    render();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.failure.notFoundTitle,
    );
  });

  it('keeps the summary and offers a retry when only readiness fails', async () => {
    detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
    readinessMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    render();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.failure.readinessTitle,
    );
    // The product loaded, so its authoritative summary is still shown.
    expect(screen.getByText('Khăn tay thêu sen đỏ')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: PRODUCT_PUBLICATION_COPY.failure.retry }),
    ).toBeInTheDocument();
  });

  it('renders exactly one h1', async () => {
    await renderLoaded();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('coherent snapshot', () => {
  it('disables every mutation when the two answers disagree on the token', async () => {
    await renderLoaded({}, { updatedAt: '2026-07-28T11:00:00.000Z' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.failure.mismatchTitle,
    );
    expect(screen.queryByTestId('publish-action')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unpublish-action')).not.toBeInTheDocument();
  });

  it('disables every mutation when the two answers disagree on status', async () => {
    await renderLoaded({ status: 'DRAFT' }, { status: 'PUBLISHED' });

    expect(screen.queryByTestId('publish-action')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unpublish-action')).not.toBeInTheDocument();
  });
});

describe('requirement checklist', () => {
  it('renders all seven codes in the server order', async () => {
    await renderLoaded();

    const rendered = screen
      .getAllByTestId(/^requirement-/)
      .map((node) => node.getAttribute('data-testid'));

    expect(rendered).toEqual(REQUIREMENT_CODES.map((code) => `requirement-${code}`));
  });

  it('shows all seven even when some are unmet', async () => {
    await renderLoaded({}, { unsatisfied: ['PRODUCT_PRICE_READY', 'PRODUCT_MEDIA_READY'] });

    expect(screen.getAllByTestId(/^requirement-/)).toHaveLength(7);
    expect(screen.getByTestId('requirement-PRODUCT_PRICE_READY')).toHaveAttribute(
      'data-satisfied',
      'false',
    );
    expect(screen.getByTestId('requirement-PRODUCT_NAME_READY')).toHaveAttribute(
      'data-satisfied',
      'true',
    );
  });

  it('distinguishes the two states with text, not colour alone', async () => {
    await renderLoaded({}, { unsatisfied: ['PRODUCT_PRICE_READY'] });

    expect(screen.getByTestId('requirement-PRODUCT_PRICE_READY')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.requirements.unsatisfied,
    );
    expect(screen.getByTestId('requirement-PRODUCT_NAME_READY')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.requirements.satisfied,
    );
  });

  it('renders an unknown code safely and never as satisfied', async () => {
    await renderLoaded(
      {},
      { requirements: [{ code: 'PRODUCT_FUTURE_RULE', satisfied: true }] as never },
    );

    const row = screen.getByTestId('requirement-PRODUCT_FUTURE_RULE');
    expect(row).toHaveAttribute('data-satisfied', 'false');
    expect(row).toHaveTextContent(PRODUCT_PUBLICATION_COPY.requirements.unknown);
    expect(row).not.toHaveTextContent('PRODUCT_FUTURE_RULE');
  });

  it('never renders a requirement code as prose', async () => {
    await renderLoaded();

    for (const code of REQUIREMENT_CODES) {
      expect(screen.getByTestId(`requirement-${code}`)).not.toHaveTextContent(code);
    }
  });
});

describe('ready DRAFT', () => {
  it('enables publish for an eligible draft', async () => {
    await renderLoaded();

    expect(screen.getByTestId('publish-action')).toBeEnabled();
    expect(screen.getByTestId('publish-action')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.ready.publish,
    );
  });

  it('offers the edit route and the consequence copy', async () => {
    await renderLoaded();

    expect(screen.getByRole('link', { name: PRODUCT_PUBLICATION_COPY.ready.edit })).toHaveAttribute(
      'href',
      `/products/${PRODUCT_ID}`,
    );
    expect(screen.getByText(PRODUCT_PUBLICATION_COPY.ready.consequence)).toBeInTheDocument();
  });

  it('never claims a public page is live', async () => {
    await renderLoaded();

    expect(document.body.textContent).not.toContain('/san-pham');
    expect(screen.queryByRole('link', { name: /storefront/i })).not.toBeInTheDocument();
  });
});

describe('blocked DRAFT', () => {
  it('disables publish and marks it aria-disabled', async () => {
    await renderLoaded({}, { unsatisfied: ['PRODUCT_PRICE_READY'] });

    const publish = screen.getByTestId('publish-action');
    expect(publish).toBeDisabled();
    expect(publish).toHaveAttribute('aria-disabled', 'true');
  });

  it('routes to the draft form to finish it', async () => {
    await renderLoaded({}, { unsatisfied: ['PRODUCT_PRICE_READY'] });

    expect(
      screen.getByRole('link', { name: PRODUCT_PUBLICATION_COPY.blocked.edit }),
    ).toHaveAttribute('href', `/products/${PRODUCT_ID}`);
  });
});

describe('PUBLISHED', () => {
  const published = { status: 'PUBLISHED' as const };

  it('offers unpublish and a read-only detail link, never editing', async () => {
    await renderLoaded(published, published);

    expect(screen.getByTestId('unpublish-action')).toBeEnabled();
    expect(
      screen.getByRole('link', { name: PRODUCT_PUBLICATION_COPY.published.view }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: PRODUCT_PUBLICATION_COPY.ready.edit }),
    ).not.toBeInTheDocument();
  });

  it('keeps unpublish available when requirements no longer hold', async () => {
    await renderLoaded(published, {
      ...published,
      unsatisfied: ['PRODUCT_CATEGORY_READY', 'PRODUCT_PRICE_READY'],
    });

    expect(screen.getByTestId('unpublish-action')).toBeEnabled();
  });

  it('offers no publish action', async () => {
    await renderLoaded(published, published);

    expect(screen.queryByTestId('publish-action')).not.toBeInTheDocument();
  });
});

describe('ARCHIVED', () => {
  const archived = { status: 'ARCHIVED' as const };

  it('is read-only with no lifecycle action', async () => {
    await renderLoaded(archived, archived);

    expect(screen.queryByTestId('publish-action')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unpublish-action')).not.toBeInTheDocument();
    expect(screen.getByTestId('publication-readonly')).toBeInTheDocument();
  });

  it('offers no archive or delete control anywhere', async () => {
    await renderLoaded(archived, archived);

    expect(screen.queryByRole('button', { name: /lưu trữ|xoá/i })).not.toBeInTheDocument();
  });
});

describe('summary honesty', () => {
  it('shows the bare server slug and never a constructed URL', async () => {
    await renderLoaded();

    const slug = screen.getByTestId('publication-slug');
    expect(slug).toHaveTextContent('khan-tay-theu-sen-do');
    expect(slug.textContent).not.toContain('/san-pham');
    expect(slug.closest('a')).toBeNull();
  });

  it('renders authoritative category data, not the mock sample', async () => {
    await renderLoaded();

    expect(screen.getByText('Khăn')).toBeInTheDocument();
    expect(screen.queryByText('Phụ kiện thêu tay')).not.toBeInTheDocument();
  });

  it('renders ordered media as real previews, marking the first', async () => {
    await renderLoaded({ media: [makeProductMedia(0), makeProductMedia(1)] });

    const tiles = screen.getAllByTestId('publication-media-tile');
    expect(tiles).toHaveLength(2);
    expect(
      within(tiles[0] as HTMLElement).getByText(PRODUCT_PUBLICATION_COPY.screen.primaryMedia),
    ).toBeInTheDocument();

    // `APP12-V02-C2`: an accepted image shows itself. This asserted zero
    // images while no Admin delivery contract existed; the order it checks is
    // the same, and now it can check that the tiles address the right assets.
    const images = [...document.querySelectorAll('img')];
    expect(images).toHaveLength(2);
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      `/api/admin/assets/${makeProductMedia(0).assetId}/thumbnail`,
      `/api/admin/assets/${makeProductMedia(1).assetId}/thumbnail`,
    ]);
  });

  it('exposes no filename, storage key or asset classification', async () => {
    await renderLoaded({ media: [makeProductMedia(0)] });

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('original.png');
    expect(text).not.toContain('PRODUCTION_SENSITIVE');
    expect(text).not.toContain('sha256');
  });
});

describe('excluded capabilities', () => {
  it('offers no archive, delete, variant or SKU surface', async () => {
    await renderLoaded();

    const text = document.body.textContent ?? '';
    for (const forbidden of ['Lưu trữ', 'Xoá', 'Xóa', 'Phiên bản', 'SKU', 'Tồn kho']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('renders no form control — this route edits nothing', async () => {
    await renderLoaded();

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(document.querySelector('form')).toBeNull();
  });

  it('renders the category by name and leaks no identifier of any kind', async () => {
    await renderLoaded({ media: [makeProductMedia(0)] });

    expect(screen.getByText('Khăn')).toBeInTheDocument();
    // No UUID anywhere: not the product id, not the asset id, not a category
    // id. The slug is the one server-owned string this screen may show, and it
    // is not an identifier of this shape.
    expect(document.body.textContent).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});
