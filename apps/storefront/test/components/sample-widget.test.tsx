// Import the shared helpers first so the hoisted jest.mock factory below can
// call `createNavigationMock` (its binding is initialised before next/navigation
// is first required). The factory runs once, so `useRouter()` returns a stable
// spied router for assertions.
import {
  createNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  type RouterMock,
} from '@embroidery/frontend-testing';
import { useRouter } from 'next/navigation';

import { SampleWidget } from '../fixtures/sample-widget';

jest.mock('next/navigation', () => createNavigationMock().module);

function router(): RouterMock {
  return useRouter() as unknown as RouterMock;
}

describe('SampleWidget (storefront)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs under the jsdom environment', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });

  it('renders and increments through real user interaction', async () => {
    const user = createUser();
    renderWithProviders(<SampleWidget />);
    expect(screen.getByText('count: 0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'increment' }));
    expect(screen.getByText('count: 1')).toBeInTheDocument();
  });

  it('renders next/link and next/image with accessible semantics', () => {
    renderWithProviders(<SampleWidget />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('img', { name: 'brand logo' })).toBeInTheDocument();
  });

  it('invokes the mocked next/navigation router', async () => {
    const user = createUser();
    renderWithProviders(<SampleWidget />);
    await user.click(screen.getByRole('button', { name: 'go back' }));
    expect(router().back).toHaveBeenCalledTimes(1);
  });
});
