/**
 * Reaching placement authoring from the product detail screen.
 *
 * The affordance routes through the shared navigation guard rather than
 * navigating directly, because it sits beside a form that may hold unsaved
 * edits. A plain link would leave the route before the form could ask.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { adminProductDetail } from '@embroidery/api-client';

import { ProductDetailScreen } from '../../src/features/products/components/product-detail-screen';
import { PLACEMENT_ENTRY_LABEL } from '../../src/features/products/model/product-placement-entry-copy';
import { makeProductDetail, productDetailEnvelope } from '../support/product-fixture';

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';

// `jest.mock` is hoisted above every const, so the pathname is written out
// rather than interpolated from `PRODUCT_ID`.
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
const router = jest
  .requireMock<{ useRouter: () => { push: jest.Mock } }>('next/navigation')
  .useRouter();

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

it('offers a placement entry on an editable product', async () => {
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));

  renderWithProviders(<ProductDetailScreen productId={PRODUCT_ID} />);

  const entry = await screen.findByTestId('placement-entry');
  expect(entry).toHaveTextContent(PLACEMENT_ENTRY_LABEL);
  expect(entry).toHaveAttribute('href', `/products/${PRODUCT_ID}/placement`);
});

it('keeps placement reachable for a published product', async () => {
  // Sides and areas exist independently of public visibility, so a PUBLISHED
  // product whose placement needs a correction must not be locked out.
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ status: 'PUBLISHED' })));

  renderWithProviders(<ProductDetailScreen productId={PRODUCT_ID} />);

  expect(await screen.findByTestId('placement-entry')).toBeInTheDocument();
});

it('routes the departure through the navigation guard', async () => {
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));

  renderWithProviders(<ProductDetailScreen productId={PRODUCT_ID} />);
  await user.click(await screen.findByTestId('placement-entry'));

  await waitFor(() => {
    expect(router.push).toHaveBeenCalledWith(`/products/${PRODUCT_ID}/placement`);
  });
});
