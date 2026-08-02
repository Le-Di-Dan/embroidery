/**
 * Scroll-driven continuation and its fallback.
 *
 * jsdom ships no `IntersectionObserver`, so the rest of the feed suite exercises
 * the visible fallback button by default. This file installs a controllable
 * observer to prove the scroll path itself: that it fires once, that it cannot
 * replay a failed cursor on its own, and that the button disappears when the
 * observer exists.
 */
import { publicProductList } from '@embroidery/api-client';
import { renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import { act } from 'react';

import { DiscoverFeedScreen } from '../../src/features/product-discovery/components/discover-feed-screen';
import { DISCOVER_COPY } from '../../src/features/product-discovery/model/discover-copy';
import { makePublicPage, makePublicProduct, publicEnvelope } from '../support/discover-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductList: jest.fn(),
}));

const listMock = publicProductList as jest.MockedFunction<typeof publicProductList>;

/** Callbacks of every observer currently connected. */
let intersectCallbacks: Array<() => void> = [];

class TestIntersectionObserver {
  private readonly fire: () => void;
  constructor(callback: IntersectionObserverCallback) {
    this.fire = () =>
      callback([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
  }
  observe() {
    intersectCallbacks.push(this.fire);
  }
  disconnect() {
    intersectCallbacks = intersectCallbacks.filter((entry) => entry !== this.fire);
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function scrollToSentinel() {
  act(() => {
    for (const fire of [...intersectCallbacks]) fire();
  });
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: TestIntersectionObserver,
  });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, 'IntersectionObserver');
});

beforeEach(() => {
  listMock.mockReset();
  intersectCallbacks = [];
});

function names(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '');
}

describe('continuation sentinel', () => {
  it('loads the next page on intersection, with no manual button', async () => {
    listMock
      .mockResolvedValueOnce(
        publicEnvelope(makePublicPage([makePublicProduct({ slug: 'a', name: 'Một' })], 'cursor-1')),
      )
      .mockResolvedValueOnce(
        publicEnvelope(makePublicPage([makePublicProduct({ slug: 'b', name: 'Hai' })])),
      );
    renderWithProviders(<DiscoverFeedScreen categorySlug={undefined} />);

    await waitFor(() => expect(names()).toEqual(['Một']));
    expect(
      screen.queryByRole('button', { name: DISCOVER_COPY.continuation.loadMore }),
    ).not.toBeInTheDocument();

    scrollToSentinel();
    await waitFor(() => expect(names()).toEqual(['Một', 'Hai']));
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('does not fire twice for one cursor even if the sentinel stays in view', async () => {
    listMock
      .mockResolvedValueOnce(
        publicEnvelope(makePublicPage([makePublicProduct({ slug: 'a', name: 'Một' })], 'cursor-1')),
      )
      .mockResolvedValueOnce(
        publicEnvelope(makePublicPage([makePublicProduct({ slug: 'b', name: 'Hai' })])),
      );
    renderWithProviders(<DiscoverFeedScreen categorySlug={undefined} />);
    await waitFor(() => expect(names()).toEqual(['Một']));

    scrollToSentinel();
    scrollToSentinel();
    scrollToSentinel();

    await waitFor(() => expect(names()).toEqual(['Một', 'Hai']));
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('stops observing after a failure, so only an explicit retry replays the cursor', async () => {
    listMock
      .mockResolvedValueOnce(
        publicEnvelope(makePublicPage([makePublicProduct({ slug: 'a', name: 'Một' })], 'cursor-1')),
      )
      .mockRejectedValue(new Error('network'));
    renderWithProviders(<DiscoverFeedScreen categorySlug={undefined} />);
    await waitFor(() => expect(names()).toEqual(['Một']));

    scrollToSentinel();
    await screen.findByRole('alert');
    expect(listMock).toHaveBeenCalledTimes(2);

    // The observer is disconnected while the failure stands; further scrolling
    // must not turn one failed cursor into a request loop.
    scrollToSentinel();
    scrollToSentinel();
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('never observes once the feed is exhausted', async () => {
    listMock.mockResolvedValue(
      publicEnvelope(makePublicPage([makePublicProduct({ slug: 'a', name: 'Một' })])),
    );
    renderWithProviders(<DiscoverFeedScreen categorySlug={undefined} />);

    await waitFor(() => expect(names()).toEqual(['Một']));
    expect(intersectCallbacks).toHaveLength(0);
    scrollToSentinel();
    expect(listMock).toHaveBeenCalledTimes(1);
  });
});
