/**
 * Leaving the product form — the two exits an operator actually uses.
 *
 * Both were broken in the first `APP2-A03` build: a successful save left the
 * operator on the form with no visible outcome, and the shell's product entry
 * was rendered as static text on `/products/{productId}`, so the section was
 * unreachable from its own detail screen. These assert the screen inside the
 * real shell, because that is where the second defect lived — the form's own
 * DOM was correct in isolation.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminProductDetail, adminProductUpdate } from '@embroidery/api-client';

import { AdminShell } from '../../src/features/admin-shell';
import { ProductDetailScreen } from '../../src/features/products/components/product-detail-screen';
import { PRODUCT_COPY } from '../../src/features/products/model/product-copy';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
import { ADMIN_PRODUCTS_ROUTE } from '../../src/features/products/model/product-route';
import { NavigationGuardProvider } from '../../src/shared/navigation/navigation-guard';
import { ADMIN_STAFF_FIXTURE } from '../support/staff-fixture';
import { makeProductDetail, productDetailEnvelope } from '../support/product-fixture';

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';

// `jest.mock` is hoisted above every const, so the pathname is written out
// rather than interpolated from `PRODUCT_ID`.
jest.mock(
  'next/navigation',
  () => mockCreateNavigationMock('/products/01920000-0000-7000-8000-000000000001').module,
);
jest.mock('../../src/features/admin-shell/services/staff-self.service', () => ({
  fetchCurrentStaff: jest.fn(),
}));
jest.mock('../../src/features/admin-shell/services/staff-logout.service', () => ({
  submitStaffLogout: jest.fn(),
}));
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductDetail: jest.fn(),
  adminProductUpdate: jest.fn(),
}));

const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const updateMock = adminProductUpdate as jest.MockedFunction<typeof adminProductUpdate>;
const router = jest
  .requireMock<{ useRouter: () => { push: jest.Mock } }>('next/navigation')
  .useRouter();

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

async function renderEditInShell() {
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));

  const result = renderWithProviders(
    <NavigationGuardProvider>
      <AdminShell initialStaff={ADMIN_STAFF_FIXTURE}>
        <ProductDetailScreen productId={PRODUCT_ID} />
      </AdminShell>
    </NavigationGuardProvider>,
  );

  await screen.findByLabelText(PRODUCT_FORM_COPY.fields.nameLabel);
  return result;
}

function railEntry() {
  const rail = within(screen.getByRole('navigation', { name: 'Điều hướng chính' }));
  return rail.getByText(PRODUCT_COPY.page.title);
}

describe('the product section stays reachable from a product detail route', () => {
  it('renders the section entry as a link, not as the current page', async () => {
    await renderEditInShell();

    const entry = railEntry();
    expect(entry.tagName).toBe('A');
    expect(entry).toHaveAttribute('href', ADMIN_PRODUCTS_ROUTE);
    // The detail screen is not the list, so it must not claim to be it.
    expect(entry).not.toHaveAttribute('aria-current');
  });

  it('navigates back to the list when nothing is unsaved', async () => {
    await renderEditInShell();

    await user.click(railEntry());

    expect(router.push).toHaveBeenCalledWith(ADMIN_PRODUCTS_ROUTE);
    expect(screen.queryByText(PRODUCT_FORM_COPY.unsaved.title)).not.toBeInTheDocument();
  });
});

describe('unsaved changes survive a shell navigation', () => {
  async function makeDirtyThenLeave() {
    await renderEditInShell();
    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), '!');
    await user.click(railEntry());
  }

  it('asks before discarding, instead of navigating silently', async () => {
    await makeDirtyThenLeave();

    expect(await screen.findByText(PRODUCT_FORM_COPY.unsaved.title)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('leaves only after the operator confirms', async () => {
    await makeDirtyThenLeave();

    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.unsaved.leave }));

    expect(router.push).toHaveBeenCalledWith(ADMIN_PRODUCTS_ROUTE);
  });

  it('stays put when the operator keeps editing', async () => {
    await makeDirtyThenLeave();

    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.unsaved.stay }));

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByText(PRODUCT_FORM_COPY.unsaved.title)).not.toBeInTheDocument();
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toHaveValue(
      `${makeProductDetail().name}!`,
    );
  });
});

describe('a successful save returns to the list', () => {
  it('navigates to the product list once the server has accepted the change', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderEditInShell();

    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), '!');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(ADMIN_PRODUCTS_ROUTE));
  });

  it('does not navigate when the save was rejected', async () => {
    updateMock.mockRejectedValue(new Error('nope'));
    await renderEditInShell();

    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), '!');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    expect(await screen.findByText(PRODUCT_FORM_COPY.edit.saveFailedTitle)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
