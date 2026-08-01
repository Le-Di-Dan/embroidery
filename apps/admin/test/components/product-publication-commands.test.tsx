/**
 * Publish and unpublish commands — request bodies, cache reconciliation and
 * error classification.
 *
 * Asserted at the generated-client boundary, so the body under test is exactly
 * what `adminProduct_publish` / `adminProduct_unpublish` would receive. Which
 * token value crosses that boundary, and how many times, is the whole point.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import {
  adminProductDetail,
  adminProductPublicationReadiness,
  adminProductPublish,
  adminProductUnpublish,
} from '@embroidery/api-client';

import { ProductPublicationScreen } from '../../src/features/products/components/product-publication-screen';
import { PRODUCT_PUBLICATION_COPY } from '../../src/features/products/model/product-publication-copy';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
import { makeApiClientError } from '../support/api-error';
import {
  makePublicationResult,
  makeProductDetail,
  makeReadiness,
  productDetailEnvelope,
  publicationEnvelope,
  readinessEnvelope,
} from '../support/product-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/products/p-1/publication').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductDetail: jest.fn(),
  adminProductPublicationReadiness: jest.fn(),
  adminProductPublish: jest.fn(),
  adminProductUnpublish: jest.fn(),
}));

const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const readinessMock = adminProductPublicationReadiness as jest.MockedFunction<
  typeof adminProductPublicationReadiness
>;
const publishMock = adminProductPublish as jest.MockedFunction<typeof adminProductPublish>;
const unpublishMock = adminProductUnpublish as jest.MockedFunction<typeof adminProductUnpublish>;

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';
const TOKEN = '2026-07-28T09:16:00.000Z';

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

async function renderReady(detailOverrides = {}, readinessOverrides = {}) {
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail(detailOverrides)));
  readinessMock.mockResolvedValue(readinessEnvelope(makeReadiness(readinessOverrides)));
  const result = renderWithProviders(<ProductPublicationScreen productId={PRODUCT_ID} />);
  await screen.findByTestId('publish-action');
  return result;
}

function publishBody(): Record<string, unknown> {
  const call = publishMock.mock.calls[0] as [string, Record<string, unknown>];
  return call[1];
}

/**
 * Confirms from inside the dialog.
 *
 * Scoped deliberately: the page action and the dialog's confirm carry the same
 * label, which is correct — the operator is confirming the thing they pressed —
 * so an unscoped query would be ambiguous and a test that resolved it by
 * position could pass while clicking the wrong control.
 */
async function confirmUnpublish() {
  const dialog = screen.getByRole('alertdialog');
  await user.click(
    within(dialog).getByRole('button', { name: PRODUCT_PUBLICATION_COPY.unpublishDialog.confirm }),
  );
}

describe('publish request', () => {
  it('sends exactly the concurrency token from the coherent snapshot', async () => {
    publishMock.mockResolvedValue(publicationEnvelope(makePublicationResult()));
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledTimes(1);
    });
    expect(publishBody()).toEqual({ expectedUpdatedAt: TOKEN });
    expect(publishMock.mock.calls[0]?.[0]).toBe(PRODUCT_ID);
  });

  it('sends no reason, status or publish date', async () => {
    publishMock.mockResolvedValue(publicationEnvelope(makePublicationResult()));
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalled();
    });
    expect(Object.keys(publishBody())).toEqual(['expectedUpdatedAt']);
  });

  it('shows the pending label and blocks a repeat submission', async () => {
    let settle: ((value: unknown) => void) | undefined;
    publishMock.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));

    await waitFor(() => {
      expect(screen.getByTestId('publish-action')).toHaveTextContent(
        PRODUCT_PUBLICATION_COPY.ready.publishing,
      );
    });
    expect(screen.getByTestId('publish-action')).toBeDisabled();

    await user.click(screen.getByTestId('publish-action'));
    expect(publishMock).toHaveBeenCalledTimes(1);

    settle?.(publicationEnvelope(makePublicationResult()));
  });

  it('never writes the new status before the server answers', async () => {
    let settle: ((value: unknown) => void) | undefined;
    publishMock.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));

    await waitFor(() => {
      expect(screen.getByTestId('publish-action')).toBeDisabled();
    });
    // Still a draft: no optimistic lifecycle state.
    expect(screen.queryByTestId('unpublish-action')).not.toBeInTheDocument();
    expect(
      screen.queryByText(PRODUCT_PUBLICATION_COPY.success.publishedTitle),
    ).not.toBeInTheDocument();

    settle?.(publicationEnvelope(makePublicationResult()));
  });
});

describe('publish success', () => {
  it('announces politely and reconciles to the returned status and token', async () => {
    publishMock.mockResolvedValue(
      publicationEnvelope(
        makePublicationResult({ status: 'PUBLISHED', updatedAt: '2026-07-28T10:00:00.000Z' }),
      ),
    );
    await renderReady();
    // Re-armed *after* the initial render, so the reads that follow the command
    // answer as PUBLISHED while the first pair stayed DRAFT.
    detailMock.mockResolvedValue(
      productDetailEnvelope(
        makeProductDetail({ status: 'PUBLISHED', updatedAt: '2026-07-28T10:00:00.000Z' }),
      ),
    );
    readinessMock.mockResolvedValue(
      readinessEnvelope(
        makeReadiness({ status: 'PUBLISHED', updatedAt: '2026-07-28T10:00:00.000Z' }),
      ),
    );

    await user.click(screen.getByTestId('publish-action'));

    expect(await screen.findByRole('status')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.success.publishedTitle,
    );
    // Transitioned in place, with no full-page reload.
    expect(await screen.findByTestId('unpublish-action')).toBeInTheDocument();
  });

  it('does not claim a public URL is live', async () => {
    publishMock.mockResolvedValue(publicationEnvelope(makePublicationResult()));
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));
    await screen.findByRole('status');

    expect(document.body.textContent).not.toContain('/san-pham');
    expect(PRODUCT_PUBLICATION_COPY.success.publishedBody).not.toMatch(/storefront/i);
  });
});

describe('publish failures', () => {
  it('opens the reload dialog for the exact version conflict only', async () => {
    publishMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PRODUCT_VERSION_CONFLICT' }),
    );
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));

    expect(await screen.findByRole('dialog')).toHaveTextContent(PRODUCT_FORM_COPY.conflict.title);
  });

  it('keeps the screen and refetches readiness on a not-ready refusal', async () => {
    publishMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'PRODUCT_PUBLICATION_NOT_READY',
        errors: [{ field: 'requirements', code: 'PRODUCT_PRICE_READY', message: 'not ready' }],
      }),
    );
    await renderReady();
    readinessMock.mockResolvedValue(
      readinessEnvelope(makeReadiness({ unsatisfied: ['PRODUCT_PRICE_READY'] })),
    );

    await user.click(screen.getByTestId('publish-action'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.commandFailure['not-ready'].title,
    );
    // No conflict dialog for this one.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(readinessMock.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('shows lifecycle guidance without a dialog when publish is not allowed', async () => {
    publishMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PRODUCT_PUBLISH_NOT_ALLOWED' }),
    );
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.commandFailure['publish-not-allowed'].title,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to the generic message for an unknown 409', async () => {
    publishMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PRODUCT_SOMETHING_NEW' }),
    );
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.commandFailure.generic.title,
    );
  });

  it('never renders the server message, code or request id', async () => {
    publishMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'PRODUCT_PUBLISH_NOT_ALLOWED',
        message: 'raw backend prose that must not be shown',
      }),
    );
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));
    await screen.findByRole('alert');

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('raw backend prose');
    expect(text).not.toContain('PRODUCT_PUBLISH_NOT_ALLOWED');
    expect(text).not.toContain('req-test-0001');
  });

  it('never retries a rejected command automatically', async () => {
    publishMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PRODUCT_VERSION_CONFLICT' }),
    );
    await renderReady();

    await user.click(screen.getByTestId('publish-action'));
    await screen.findByRole('dialog');

    expect(publishMock).toHaveBeenCalledTimes(1);
  });
});

describe('unpublish request', () => {
  const published = { status: 'PUBLISHED' as const };

  async function renderPublished() {
    detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail(published)));
    readinessMock.mockResolvedValue(readinessEnvelope(makeReadiness(published)));
    renderWithProviders(<ProductPublicationScreen productId={PRODUCT_ID} />);
    await screen.findByTestId('unpublish-action');
  }

  it('sends exactly the token from the published snapshot', async () => {
    unpublishMock.mockResolvedValue(
      publicationEnvelope(makePublicationResult({ status: 'DRAFT' })),
    );
    await renderPublished();

    await user.click(screen.getByTestId('unpublish-action'));
    await confirmUnpublish();

    await waitFor(() => {
      expect(unpublishMock).toHaveBeenCalledTimes(1);
    });
    const call = unpublishMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(call[1]).toEqual({ expectedUpdatedAt: TOKEN });
  });

  it('never calls the archive operation', async () => {
    unpublishMock.mockResolvedValue(
      publicationEnvelope(makePublicationResult({ status: 'DRAFT' })),
    );
    await renderPublished();

    await user.click(screen.getByTestId('unpublish-action'));
    await confirmUnpublish();

    await waitFor(() => {
      expect(unpublishMock).toHaveBeenCalled();
    });
    expect('adminProductArchive' in jest.requireActual('@embroidery/api-client')).toBe(false);
  });

  it('returns to DRAFT and announces politely on success', async () => {
    unpublishMock.mockResolvedValue(
      publicationEnvelope(
        makePublicationResult({ status: 'DRAFT', updatedAt: '2026-07-28T12:00:00.000Z' }),
      ),
    );
    await renderPublished();
    detailMock.mockResolvedValue(
      productDetailEnvelope(makeProductDetail({ updatedAt: '2026-07-28T12:00:00.000Z' })),
    );
    readinessMock.mockResolvedValue(
      readinessEnvelope(makeReadiness({ updatedAt: '2026-07-28T12:00:00.000Z' })),
    );

    await user.click(screen.getByTestId('unpublish-action'));
    await confirmUnpublish();

    expect(await screen.findByRole('status')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.success.unpublishedTitle,
    );
    expect(await screen.findByTestId('publish-action')).toBeInTheDocument();
  });

  it('reports a not-allowed refusal without a conflict dialog', async () => {
    unpublishMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PRODUCT_UNPUBLISH_NOT_ALLOWED' }),
    );
    await renderPublished();

    await user.click(screen.getByTestId('unpublish-action'));
    await confirmUnpublish();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.commandFailure['unpublish-not-allowed'].title,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
