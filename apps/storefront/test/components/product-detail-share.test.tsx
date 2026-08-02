import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { DetailShareButton } from '../../src/features/product-detail/components/detail-share-button';

const PATH = '/san-pham/gau-bong-theu-tay';
const NAME = 'Gấu bông thêu tay';

/**
 * jsdom owns the document origin and refuses to let it be redefined, so the
 * expected canonical URL is composed from the real one. The pure origin+path
 * join is unit-tested separately against explicit origins, so nothing is lost:
 * what matters here is that the button shares the ROUTE HELPER's path and not
 * `location.href` with whatever query string the visitor arrived carrying.
 */
const EXPECTED_URL = `${window.location.origin}${PATH}`;

const originalShare = Object.getOwnPropertyDescriptor(window.navigator, 'share');
const originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');

function stubNavigator(value: Partial<Navigator>): void {
  for (const [key, implementation] of Object.entries(value)) {
    Object.defineProperty(window.navigator, key, {
      value: implementation,
      configurable: true,
      writable: true,
    });
  }
}

function removeNavigatorKey(key: string): void {
  Object.defineProperty(window.navigator, key, { value: undefined, configurable: true });
}

afterEach(() => {
  if (originalShare) Object.defineProperty(window.navigator, 'share', originalShare);
  if (originalClipboard) Object.defineProperty(window.navigator, 'clipboard', originalClipboard);
});

function clickShare(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));
}

describe('Web Share path', () => {
  it('shares the canonical URL built from the route helper', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    stubNavigator({ share });

    renderWithProviders(
      <DetailShareButton name={NAME} path={PATH} description="Một buổi sáng tháng Ba" />,
    );
    clickShare();

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({
      title: NAME,
      text: 'Một buổi sáng tháng Ba',
      url: EXPECTED_URL,
    });
    await screen.findByText('Đã chia sẻ tác phẩm.');
  });

  it('treats a cancelled native share as a decision, not a failure', async () => {
    const abort = new Error('cancelled');
    abort.name = 'AbortError';
    stubNavigator({ share: jest.fn().mockRejectedValue(abort) });

    renderWithProviders(<DetailShareButton name={NAME} path={PATH} />);
    clickShare();

    await waitFor(() => {
      expect(screen.queryByText('Không thể chia sẻ liên kết. Vui lòng thử lại.')).toBeNull();
    });
    expect(screen.queryByText('Đã chia sẻ tác phẩm.')).toBeNull();
  });

  it('reports a genuine share failure', async () => {
    stubNavigator({ share: jest.fn().mockRejectedValue(new Error('boom')) });

    renderWithProviders(<DetailShareButton name={NAME} path={PATH} />);
    clickShare();

    await screen.findByText('Không thể chia sẻ liên kết. Vui lòng thử lại.');
  });
});

describe('clipboard fallback', () => {
  it('copies the canonical URL when Web Share is unavailable', async () => {
    removeNavigatorKey('share');
    const writeText = jest.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } as unknown as Clipboard });

    renderWithProviders(<DetailShareButton name={NAME} path={PATH} />);
    clickShare();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(EXPECTED_URL));
    await screen.findByText('Đã sao chép liên kết.');
  });

  it('reports a clipboard rejection', async () => {
    removeNavigatorKey('share');
    stubNavigator({
      clipboard: {
        writeText: jest.fn().mockRejectedValue(new Error('denied')),
      } as unknown as Clipboard,
    });

    renderWithProviders(<DetailShareButton name={NAME} path={PATH} />);
    clickShare();

    await screen.findByText('Không thể chia sẻ liên kết. Vui lòng thử lại.');
  });

  it('reports honestly when neither capability exists', async () => {
    removeNavigatorKey('share');
    removeNavigatorKey('clipboard');

    renderWithProviders(<DetailShareButton name={NAME} path={PATH} />);
    clickShare();

    await screen.findByText('Không thể chia sẻ liên kết. Vui lòng thử lại.');
  });
});

describe('share announcements', () => {
  it('announces through a polite live region rather than stealing focus', async () => {
    removeNavigatorKey('share');
    stubNavigator({
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } as unknown as Clipboard,
    });

    renderWithProviders(<DetailShareButton name={NAME} path={PATH} />);
    const button = screen.getByRole('button', { name: 'Chia sẻ' });
    button.focus();
    clickShare();

    const status = await screen.findByText('Đã sao chép liên kết.');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(document.activeElement).toBe(button);
  });
});
