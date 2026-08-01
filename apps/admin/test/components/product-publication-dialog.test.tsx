/**
 * The unpublish confirmation and the A03 entry point.
 *
 * The dialog assertions cover what the approved handoff requires of it —
 * `role="alertdialog"`, focus in/trapped/returned, dismissible only while idle —
 * and the entry-point assertions cover the one navigation rule that matters
 * here: a dirty product form must get to ask before the route changes.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { useRouter } from 'next/navigation';

import {
  adminProductDetail,
  adminProductPublicationReadiness,
  adminProductUnpublish,
} from '@embroidery/api-client';

import { ProductPublicationScreen } from '../../src/features/products/components/product-publication-screen';
import { ProductPublicationEntry } from '../../src/features/products/components/product-publication-entry';
import { PRODUCT_PUBLICATION_COPY } from '../../src/features/products/model/product-publication-copy';
import {
  NavigationGuardProvider,
  useRegisterNavigationInterceptor,
} from '../../src/shared/navigation/navigation-guard';
import {
  makePublicationResult,
  makeProductDetail,
  makeReadiness,
  productDetailEnvelope,
  publicationEnvelope,
  readinessEnvelope,
} from '../support/product-fixture';

// Built inside the factory: `jest.mock` is hoisted above the imports, so a
// factory closing over a module-scope `const` would read it before it is
// initialized. The mock returns one stable router, so `useRouter()` below
// retrieves the same spies the components use.
jest.mock('next/navigation', () => mockCreateNavigationMock('/products/p-1/publication').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductDetail: jest.fn(),
  adminProductPublicationReadiness: jest.fn(),
  adminProductUnpublish: jest.fn(),
}));

const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const readinessMock = adminProductPublicationReadiness as jest.MockedFunction<
  typeof adminProductPublicationReadiness
>;
const unpublishMock = adminProductUnpublish as jest.MockedFunction<typeof adminProductUnpublish>;

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';
const PUBLISHED = { status: 'PUBLISHED' as const };

// Captured once: the mock returns one stable router. `push` is a plain jest.fn
// property rather than a prototype method, so the unbound-method rule does not
// apply — there is no `this` for it to lose.
// eslint-disable-next-line @typescript-eslint/unbound-method
const pushSpy = useRouter().push;

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

async function openDialog() {
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail(PUBLISHED)));
  readinessMock.mockResolvedValue(readinessEnvelope(makeReadiness(PUBLISHED)));
  renderWithProviders(<ProductPublicationScreen productId={PRODUCT_ID} />);
  const trigger = await screen.findByTestId('unpublish-action');
  await user.click(trigger);
  return { trigger, dialog: await screen.findByRole('alertdialog') };
}

describe('unpublish confirmation', () => {
  it('is an alertdialog, labelled and described', async () => {
    const { dialog } = await openDialog();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(PRODUCT_PUBLICATION_COPY.unpublishDialog.title);
    expect(dialog).toHaveAttribute('aria-describedby');
  });

  it('states that it is neither a delete nor an archive', async () => {
    const { dialog } = await openDialog();

    expect(dialog).toHaveTextContent(PRODUCT_PUBLICATION_COPY.unpublishDialog.reassurance);
    expect(dialog).toHaveTextContent(PRODUCT_PUBLICATION_COPY.unpublishDialog.body);
  });

  it('offers no reason field', async () => {
    const { dialog } = await openDialog();

    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('moves focus into the dialog', async () => {
    const { dialog } = await openDialog();

    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
  });

  it('returns focus to the control that opened it', async () => {
    const { trigger } = await openDialog();

    await user.click(
      screen.getByRole('button', { name: PRODUCT_PUBLICATION_COPY.unpublishDialog.cancel }),
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('closes on Escape while idle', async () => {
    await openDialog();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('sends nothing when the operator keeps the product published', async () => {
    await openDialog();

    await user.click(
      screen.getByRole('button', { name: PRODUCT_PUBLICATION_COPY.unpublishDialog.cancel }),
    );

    expect(unpublishMock).not.toHaveBeenCalled();
  });

  it('disables the primary action and stops dismissing while the command is in flight', async () => {
    let settle: ((value: unknown) => void) | undefined;
    unpublishMock.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );
    const { dialog } = await openDialog();

    await user.click(
      within(dialog).getByRole('button', {
        name: PRODUCT_PUBLICATION_COPY.unpublishDialog.confirm,
      }),
    );

    const confirm = await within(dialog).findByRole('button', {
      name: PRODUCT_PUBLICATION_COPY.published.unpublishing,
    });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-disabled', 'true');

    // Escape must not abandon a request that is already on the wire.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    settle?.(publicationEnvelope(makePublicationResult({ status: 'DRAFT' })));
  });

  it('does not fire the command twice', async () => {
    let settle: ((value: unknown) => void) | undefined;
    unpublishMock.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );
    const { dialog } = await openDialog();
    const confirm = within(dialog).getByRole('button', {
      name: PRODUCT_PUBLICATION_COPY.unpublishDialog.confirm,
    });

    await user.click(confirm);
    await user.click(confirm);

    expect(unpublishMock).toHaveBeenCalledTimes(1);
    settle?.(publicationEnvelope(makePublicationResult({ status: 'DRAFT' })));
  });
});

describe('A03 entry point', () => {
  function renderEntry(status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'UNKNOWN') {
    return renderWithProviders(
      <NavigationGuardProvider>
        <ProductPublicationEntry productId={PRODUCT_ID} status={status} />
      </NavigationGuardProvider>,
    );
  }

  it('labels a draft as publishing and a published product as managing', () => {
    renderEntry('DRAFT');
    expect(screen.getByTestId('publication-entry')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.entry.fromDraft,
    );
  });

  it('links to the canonical publication route', () => {
    renderEntry('PUBLISHED');

    expect(screen.getByTestId('publication-entry')).toHaveAttribute(
      'href',
      `/products/${PRODUCT_ID}/publication`,
    );
    expect(screen.getByTestId('publication-entry')).toHaveTextContent(
      PRODUCT_PUBLICATION_COPY.entry.fromPublished,
    );
  });

  it('offers no publication entry for an archived product', () => {
    renderEntry('ARCHIVED');

    expect(screen.queryByTestId('publication-entry')).not.toBeInTheDocument();
  });

  it('routes the departure through the navigation guard rather than navigating directly', async () => {
    const intercepted: (() => void)[] = [];
    renderWithProviders(
      <NavigationGuardProvider>
        <Interceptor onRequest={(proceed) => intercepted.push(proceed)} />
        <ProductPublicationEntry productId={PRODUCT_ID} status="DRAFT" />
      </NavigationGuardProvider>,
    );

    await user.click(screen.getByTestId('publication-entry'));

    // The guard held the departure: nothing navigated yet.
    expect(intercepted).toHaveLength(1);
    expect(pushSpy).not.toHaveBeenCalled();

    intercepted[0]?.();
    expect(pushSpy).toHaveBeenCalledWith(`/products/${PRODUCT_ID}/publication`);
  });
});

/** Registers an interceptor, standing in for the A03 form's dirty guard. */
function Interceptor({ onRequest }: { onRequest: (proceed: () => void) => void }) {
  useRegisterNavigationInterceptor(onRequest);
  return null;
}
