/**
 * The asset library inside the authenticated Admin shell: one canonical route,
 * one active navigation destination, one page heading.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  within,
} from '@embroidery/frontend-testing';
import { adminAssetList } from '@embroidery/api-client';

import { AdminShell } from '../../src/features/admin-shell';
import { AssetLibraryScreen } from '../../src/features/assets/components/asset-library-screen';
import { ADMIN_ASSETS_ROUTE } from '../../src/features/assets/model/asset-route';
import { ASSET_COPY } from '../../src/features/assets/model/asset-copy';
import { ADMIN_STAFF_FIXTURE } from '../support/staff-fixture';
import { makeAsset, makePage } from '../support/asset-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/assets').module);
jest.mock('../../src/features/admin-shell/services/staff-self.service', () => ({
  fetchCurrentStaff: jest.fn(),
}));
jest.mock('../../src/features/admin-shell/services/staff-logout.service', () => ({
  submitStaffLogout: jest.fn(),
}));
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminAssetList: jest.fn(),
}));

const listMock = adminAssetList as jest.MockedFunction<typeof adminAssetList>;

function renderAssetsRoute() {
  listMock.mockResolvedValue({
    success: true,
    code: 'ASSET_LIST_READ',
    message: 'ok',
    data: makePage([makeAsset()]),
    meta: { requestId: 'req-1', timestamp: '2026-07-27T00:00:00.000Z' },
  } as never);

  return renderWithProviders(
    <AdminShell initialStaff={ADMIN_STAFF_FIXTURE}>
      <AssetLibraryScreen />
    </AdminShell>,
  );
}

describe('Admin assets route and navigation', () => {
  it('exposes exactly one canonical route constant', () => {
    expect(ADMIN_ASSETS_ROUTE).toBe('/assets');
  });

  it('marks the asset destination as the current location, not a link', () => {
    renderAssetsRoute();

    const rail = within(screen.getByRole('navigation', { name: 'Điều hướng chính' }));
    const current = rail.getByText(ASSET_COPY.page.title);
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current.tagName).not.toBe('A');
    // The other destination is a real link to an implemented route.
    expect(rail.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/');
  });

  it('renders a single page heading inside the shell main region', async () => {
    renderAssetsRoute();

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(ASSET_COPY.page.title);
    expect(within(screen.getByRole('main')).getByRole('heading', { level: 1 })).toBe(headings[0]);
    expect(await screen.findByText('Ảnh PNG')).toBeInTheDocument();
  });

  it('never renders an alias route anywhere in the shell', () => {
    const { container } = renderAssetsRoute();
    const hrefs = [...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'));
    expect(hrefs).not.toContain('/admin/assets');
    expect(hrefs).not.toContain('/media');
    expect(hrefs).not.toContain('/catalog/assets');
  });
});
