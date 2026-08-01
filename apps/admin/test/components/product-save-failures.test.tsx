/**
 * Which failed save opens the stale-version dialog — and which must not.
 *
 * `adminProduct_update` answers `409` for more than one reason. The dialog is
 * destructive advice: it offers to reload, and reloading replaces the operator's
 * unsaved edits with the server's record. Showing it for a lifecycle refusal or
 * an ineligible image would tell the operator to throw work away to fix
 * something reloading cannot fix, so only the exact domain code may open it.
 *
 * Every case here also asserts the edits survive, because that is the property
 * the misclassification actually threatened.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { adminProductDetail, adminProductUpdate } from '@embroidery/api-client';

import { ProductDetailScreen } from '../../src/features/products/components/product-detail-screen';
import {
  PRODUCT_FORM_COPY,
  PRODUCT_SAVE_FAILURE_COPY,
} from '../../src/features/products/model/product-form-copy';
import { makeApiClientError } from '../support/api-error';
import { makeProductDetail, productDetailEnvelope } from '../support/product-fixture';

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';

jest.mock(
  'next/navigation',
  () => mockCreateNavigationMock('/products/01920000-0000-7000-8000-000000000001').module,
);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductDetail: jest.fn(),
  adminProductUpdate: jest.fn(),
}));

const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const updateMock = adminProductUpdate as jest.MockedFunction<typeof adminProductUpdate>;

/** A 409 whose envelope carries no `code` at all — a proxy or gateway answer. */
function makeCodelessConflict(): unknown {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: 'Conflict',
    response: {
      status: 409,
      headers: {},
      data: { success: false, message: 'Conflict' },
    },
  };
}

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

const TYPED_SUFFIX = '!';

async function saveAndFailWith(error: unknown) {
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
  updateMock.mockRejectedValue(error);

  renderWithProviders(<ProductDetailScreen productId={PRODUCT_ID} />);
  const name = await screen.findByLabelText(PRODUCT_FORM_COPY.fields.nameLabel);

  await user.type(name, TYPED_SUFFIX);
  await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));
  await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
}

function expectEditsPreserved() {
  expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toHaveValue(
    `${makeProductDetail().name}${TYPED_SUFFIX}`,
  );
}

async function expectNoConflictDialog() {
  // Give the dialog a chance to appear before asserting it did not.
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText(PRODUCT_FORM_COPY.conflict.title)).toBeNull();
  expect(screen.queryByText(PRODUCT_FORM_COPY.conflict.reload)).toBeNull();
  expectEditsPreserved();
}

describe('only the exact version-conflict code opens the reload dialog', () => {
  it('opens it for PRODUCT_VERSION_CONFLICT', async () => {
    await saveAndFailWith(
      makeApiClientError({ status: 409, code: 'PRODUCT_VERSION_CONFLICT', message: 'stale' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(PRODUCT_FORM_COPY.conflict.title);
    expectEditsPreserved();
  });

  it('does not open it for PRODUCT_NOT_EDITABLE, and says what actually happened', async () => {
    await saveAndFailWith(
      makeApiClientError({ status: 409, code: 'PRODUCT_NOT_EDITABLE', message: 'not a draft' }),
    );

    await expectNoConflictDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(
      PRODUCT_SAVE_FAILURE_COPY['not-editable'].title,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      PRODUCT_SAVE_FAILURE_COPY['not-editable'].body,
    );
  });

  it('does not open it for PRODUCT_MEDIA_ASSET_UNAVAILABLE, and points at the selection', async () => {
    await saveAndFailWith(
      makeApiClientError({
        status: 409,
        code: 'PRODUCT_MEDIA_ASSET_UNAVAILABLE',
        message: 'asset not accepted',
      }),
    );

    await expectNoConflictDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(
      PRODUCT_SAVE_FAILURE_COPY['media-unavailable'].title,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      PRODUCT_SAVE_FAILURE_COPY['media-unavailable'].body,
    );
  });

  it('does not open it for an unrecognised 409 code', async () => {
    await saveAndFailWith(
      makeApiClientError({ status: 409, code: 'PRODUCT_SLUG_CONFLICT', message: 'slug taken' }),
    );

    await expectNoConflictDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(PRODUCT_FORM_COPY.edit.saveFailedTitle);
  });

  it('does not open it for a 409 that carries no code at all', async () => {
    await saveAndFailWith(makeCodelessConflict());

    await expectNoConflictDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(PRODUCT_FORM_COPY.edit.saveFailedTitle);
  });

  it('never explains a failure with the backend message or request id', async () => {
    await saveAndFailWith(
      makeApiClientError({
        status: 409,
        code: 'PRODUCT_NOT_EDITABLE',
        message: 'product 019200 is PUBLISHED, expectedUpdatedAt rejected',
      }),
    );

    const body = document.body.textContent ?? '';
    expect(body).not.toContain('PUBLISHED');
    expect(body).not.toContain('expectedUpdatedAt');
    expect(body).not.toContain('req-test-0001');
    expect(body).not.toContain('PRODUCT_NOT_EDITABLE');
  });
});
