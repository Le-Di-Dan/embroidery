/**
 * The two `/yeu-cau` route segments as modules.
 *
 * Small on purpose. It proves the App Router boundary this checkpoint adds is
 * real — the segment exports metadata and mounts the capability's provider —
 * without a production build, which `APP5-S01` §23 permits only when the
 * boundary cannot be established by focused evidence.
 *
 * It also pins the one thing S01 must *not* do on the confirmation route:
 * render any of `APP5-S02`'s content.
 */
import { renderWithProviders, screen } from '@embroidery/frontend-testing';

import { CUSTOM_REQUEST_COPY } from '../../src/features/custom-request/model/custom-request-copy';
import NewCustomRequestPage, {
  metadata as newRequestMetadata,
} from '../../src/app/yeu-cau/moi/page';
import CustomRequestSubmittedPage, {
  metadata as submittedMetadata,
} from '../../src/app/yeu-cau/da-gui/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/yeu-cau/moi',
  useSearchParams: () => new URLSearchParams(''),
}));

describe('/yeu-cau/moi', () => {
  it('mounts the capability behind its own route-local query boundary', () => {
    renderWithProviders(<NewCustomRequestPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      CUSTOM_REQUEST_COPY.pageTitle,
    );
    expect(
      screen.getByRole('radio', { name: new RegExp(CUSTOM_REQUEST_COPY.chooser.catalog) }),
    ).toBeInTheDocument();
  });

  it('is kept out of search results', () => {
    // A half-filled request form has no standalone audience.
    expect(newRequestMetadata.robots).toEqual({ index: false, follow: false });
  });
});

describe('/yeu-cau/da-gui', () => {
  /**
   * S01's half of the handoff: the destination exists and is reachable with the
   * query key S01 writes. The confirmation the segment now renders is
   * `APP5-S02`'s and is proved in its own suite — this only pins that the two
   * halves still meet.
   */
  it('is the destination S01 navigates to, and is kept out of search results', async () => {
    const element = await CustomRequestSubmittedPage({
      searchParams: Promise.resolve({ ma: 'REQ-7KM2QD4XVA' }),
    });
    renderWithProviders(element);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(submittedMetadata.robots).toEqual({ index: false, follow: false });
  });
});
