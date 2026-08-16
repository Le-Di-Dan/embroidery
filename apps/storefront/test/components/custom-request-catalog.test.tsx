/**
 * The catalog branch of `APP5-S01`, reached the way a customer reaches it.
 *
 * The suite mocks the **generated operations** at the feature boundary rather
 * than Axios or a URL, so a route rename would break the mock rather than pass
 * silently, and nothing here asserts against a hand-written path.
 *
 * Its centre of gravity is the set of outcomes §17 forbids collapsing: an empty
 * variant list, an unavailable product and a stale Design Session are three
 * different screens, and the catalog journey ends by proving the *chosen*
 * variant — not the first one — is what reaches `APP5-B01`.
 */
import {
  publicCustomRequestSubmit,
  publicProductVariantList,
  publicVerificationIssue,
  publicVerificationSubmitAttempt,
  VerificationChallengeStatusResponseState,
} from '@embroidery/api-client';
import {
  createNavigationMock as mockCreateNavigationMock,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { useRouter } from 'next/navigation';

import { CUSTOM_REQUEST_COPY } from '../../src/features/custom-request/model/custom-request-copy';
import { CustomRequestScreen } from '../../src/features/custom-request/ui/custom-request-screen';
import {
  bareFailure,
  envelopeOf,
  makeSubmission,
  makeVariant,
  makeVariantList,
  networkFailure,
  PRODUCT_ID,
  PRODUCT_SLUG,
  REQUEST_CODE,
  VARIANT_BLUE,
  VARIANT_RED,
} from '../support/custom-request-fixture';
import { makeChallenge, makeStatus, TEST_EMAIL } from '../support/verification-fixture';
import { VERIFICATION_COPY } from '../../src/features/contact-verification/model/verification-copy';

// The `mock`-prefixed alias is what lets the hoisted factory close over the
// helper without tripping Jest's TDZ guard.
jest.mock('next/navigation', () => mockCreateNavigationMock('/yeu-cau/moi').module);

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductVariantList: jest.fn(),
  publicCustomRequestSubmit: jest.fn(),
  publicVerificationIssue: jest.fn(),
  publicVerificationSubmitAttempt: jest.fn(),
}));

const variantsMock = publicProductVariantList as jest.MockedFunction<
  typeof publicProductVariantList
>;
const submitMock = publicCustomRequestSubmit as jest.MockedFunction<
  typeof publicCustomRequestSubmit
>;
const issueMock = publicVerificationIssue as jest.MockedFunction<typeof publicVerificationIssue>;
const attemptMock = publicVerificationSubmitAttempt as jest.MockedFunction<
  typeof publicVerificationSubmitAttempt
>;

/** The one router instance every `useRouter()` call in the tree returns. */
const router = useRouter() as unknown as { push: jest.Mock };

const SESSION_ID = '018f4a1b-2c3d-7e4f-8a9b-0c1d2e3f4a5b';
const SIDE = 'truoc';
const AREA = 'nguc';

/** The Studio's own placement-keyed handle, written by `APP3-S10`. */
function storeDesignSession(sessionId = SESSION_ID): void {
  globalThis.localStorage.setItem(
    `embroidery.studio.session:${PRODUCT_SLUG}:${SIDE}:${AREA}`,
    sessionId,
  );
}

function enterFromStudio(): void {
  globalThis.history.replaceState(
    {},
    '',
    `/yeu-cau/moi?san-pham=${PRODUCT_SLUG}&mat=${SIDE}&vung=${AREA}`,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.localStorage.clear();
  globalThis.history.replaceState({}, '', '/yeu-cau/moi');
});

const button = (name: string) => screen.getByRole('button', { name });

// By role, not by label text: the quantity *section* is also labelled 'Số lượng'.
const quantityField = () =>
  screen.getByRole('textbox', { name: CUSTOM_REQUEST_COPY.quantity.quantityLabel });
const sizeField = () =>
  screen.getByRole('textbox', { name: CUSTOM_REQUEST_COPY.quantity.sizeLabel });

function chooseCatalog(): void {
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(CUSTOM_REQUEST_COPY.chooser.catalog) }),
  );
}

async function renderCatalog(): Promise<void> {
  renderWithProviders(<CustomRequestScreen />);
  // The entry context resolves in an effect, so the branch is chosen after the
  // first paint — exactly as a customer would.
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
  chooseCatalog();
}

describe('APP5-S01 — subject XOR', () => {
  it('offers both subjects with neither preselected', async () => {
    renderWithProviders(<CustomRequestScreen />);

    const catalog = screen.getByRole('radio', {
      name: new RegExp(CUSTOM_REQUEST_COPY.chooser.catalog),
    });
    const owned = screen.getByRole('radio', {
      name: new RegExp(CUSTOM_REQUEST_COPY.chooser.customerOwned),
    });

    expect(catalog).not.toBeChecked();
    expect(owned).not.toBeChecked();
    // Nothing catalog-specific is on screen before a branch exists.
    expect(screen.queryByText(CUSTOM_REQUEST_COPY.catalog.variantLegend)).not.toBeInTheDocument();
    await waitFor(() => expect(variantsMock).not.toHaveBeenCalled());
  });

  it('renders exactly one branch at a time', async () => {
    variantsMock.mockResolvedValue(envelopeOf(makeVariantList()));
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    await screen.findByText(CUSTOM_REQUEST_COPY.catalog.variantLegend);
    expect(
      screen.queryByLabelText(CUSTOM_REQUEST_COPY.customerOwned.nameLabel),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('radio', { name: new RegExp(CUSTOM_REQUEST_COPY.chooser.customerOwned) }),
    );

    expect(screen.getByLabelText(CUSTOM_REQUEST_COPY.customerOwned.nameLabel)).toBeInTheDocument();
    expect(screen.queryByText(CUSTOM_REQUEST_COPY.catalog.variantLegend)).not.toBeInTheDocument();
  });
});

describe('APP5-S01 — variant selection (650:3)', () => {
  it('renders the published labels and selects none of them by default', async () => {
    variantsMock.mockResolvedValue(envelopeOf(makeVariantList()));
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    const options = await screen.findAllByRole('radio', { name: /Đỏ|Xanh/ });
    expect(options).toHaveLength(2);
    for (const option of options) expect(option).not.toBeChecked();

    // Neither the id nor an invented variant name is shown to the customer.
    expect(screen.queryByText(VARIANT_RED)).not.toBeInTheDocument();
    expect(screen.queryByText(VARIANT_BLUE)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Đỏ · M' })).toBeInTheDocument();
  });

  it('falls back to approved copy when both published labels are null', async () => {
    variantsMock.mockResolvedValue(
      envelopeOf(makeVariantList([makeVariant(VARIANT_RED, null, null)])),
    );
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    expect(
      await screen.findByRole('radio', { name: CUSTOM_REQUEST_COPY.catalog.variantUnnamed }),
    ).toBeInTheDocument();
  });

  it('keeps the quantity table inert until a variant has been chosen', async () => {
    variantsMock.mockResolvedValue(envelopeOf(makeVariantList()));
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    await screen.findByRole('radio', { name: 'Đỏ · M' });
    expect(quantityField()).toBeDisabled();
    expect(screen.getByText(CUSTOM_REQUEST_COPY.quantity.catalogHintNoVariant)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Xanh · L' }));

    expect(quantityField()).toBeEnabled();
    expect(screen.getByText(CUSTOM_REQUEST_COPY.quantity.catalogHint)).toBeInTheDocument();
  });

  it('offers no variant control inside a quantity row', async () => {
    variantsMock.mockResolvedValue(envelopeOf(makeVariantList()));
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    fireEvent.click(await screen.findByRole('radio', { name: 'Xanh · L' }));
    fireEvent.click(button(CUSTOM_REQUEST_COPY.quantity.addLine));

    // Two rows, and still exactly the two variant radios from the selector —
    // adding a size never adds a second variant chooser.
    expect(
      screen.getAllByRole('textbox', { name: CUSTOM_REQUEST_COPY.quantity.sizeLabel }),
    ).toHaveLength(2);
    expect(screen.getAllByRole('radio', { name: /Đỏ|Xanh/ })).toHaveLength(2);
  });
});

describe('APP5-S01 — the four catalog outcomes stay apart (§17)', () => {
  it('an empty variant list is not the session-expired screen', async () => {
    variantsMock.mockResolvedValue(envelopeOf(makeVariantList([])));
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    expect(await screen.findByText(CUSTOM_REQUEST_COPY.catalog.variantEmpty)).toBeInTheDocument();
    expect(screen.getByText(CUSTOM_REQUEST_COPY.catalog.variantEmptyHint)).toBeInTheDocument();

    // Neither the expiry treatment nor an auto-switch to the other branch.
    expect(screen.queryByText(CUSTOM_REQUEST_COPY.catalog.sessionExpired)).not.toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: new RegExp(CUSTOM_REQUEST_COPY.chooser.customerOwned) }),
    ).not.toBeChecked();
    // And progression is blocked.
    fireEvent.click(button(CUSTOM_REQUEST_COPY.steps.continueToVerify));
    expect(screen.queryByText(CUSTOM_REQUEST_COPY.verification.intro)).not.toBeInTheDocument();
  });

  it('an unavailable product says only that, never draft or archived', async () => {
    variantsMock.mockRejectedValue(bareFailure(404));
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    expect(
      await screen.findByText(CUSTOM_REQUEST_COPY.catalog.productUnavailable),
    ).toBeInTheDocument();
    expect(screen.queryByText(CUSTOM_REQUEST_COPY.catalog.variantEmpty)).not.toBeInTheDocument();
    expect(screen.queryByText(/draft|archiv|nháp|lưu trữ/i)).not.toBeInTheDocument();
  });

  it('a transient failure offers a retry rather than a verdict about the product', async () => {
    variantsMock.mockRejectedValueOnce(networkFailure());
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    expect(await screen.findByText(CUSTOM_REQUEST_COPY.catalog.loadFailed)).toBeInTheDocument();

    variantsMock.mockResolvedValue(envelopeOf(makeVariantList()));
    fireEvent.click(button(CUSTOM_REQUEST_COPY.catalog.retry));

    expect(await screen.findByRole('radio', { name: 'Đỏ · M' })).toBeInTheDocument();
  });

  it('a missing design session draws the approved 650:187 treatment', async () => {
    variantsMock.mockResolvedValue(envelopeOf(makeVariantList()));
    enterFromStudio();
    // No handle stored: the placement is known, the design is not.
    await renderCatalog();

    expect(await screen.findByText(CUSTOM_REQUEST_COPY.catalog.sessionExpired)).toBeInTheDocument();
    expect(screen.queryByText(CUSTOM_REQUEST_COPY.catalog.variantEmpty)).not.toBeInTheDocument();
  });

  it('withdrawing the chosen variant asks for a reselection and keeps the rest', async () => {
    variantsMock.mockResolvedValue(envelopeOf(makeVariantList()));
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    fireEvent.click(await screen.findByRole('radio', { name: 'Xanh · L' }));
    fireEvent.change(quantityField(), {
      target: { value: '4' },
    });

    // Leaving step 1 re-reads the list, and it no longer publishes the choice.
    variantsMock.mockResolvedValue(
      envelopeOf(makeVariantList([makeVariant(VARIANT_RED, 'Đỏ', 'M')])),
    );
    fireEvent.click(button(CUSTOM_REQUEST_COPY.steps.continueToVerify));

    await waitFor(() =>
      expect(screen.getByText(CUSTOM_REQUEST_COPY.catalog.variantGone)).toBeInTheDocument(),
    );
    // Not the stale-session screen, and the quantity the customer typed survives.
    expect(screen.queryByText(CUSTOM_REQUEST_COPY.catalog.sessionExpired)).not.toBeInTheDocument();
    expect(quantityField()).toHaveValue('4');
  });
});

describe('APP5-S01 — the catalog journey through to the S02 handoff', () => {
  it('submits the variant the customer chose, then navigates to the confirmation', async () => {
    variantsMock.mockResolvedValue(envelopeOf(makeVariantList()));
    issueMock.mockResolvedValue(envelopeOf(makeChallenge()));
    attemptMock.mockResolvedValue(
      envelopeOf(makeStatus(VerificationChallengeStatusResponseState.VERIFIED)),
    );
    submitMock.mockResolvedValue(envelopeOf(makeSubmission()));
    enterFromStudio();
    storeDesignSession();
    await renderCatalog();

    // Step 1 — the *second* variant, so "the chosen one" and "the first one"
    // cannot be confused in the payload assertion below.
    fireEvent.click(await screen.findByRole('radio', { name: 'Xanh · L' }));
    fireEvent.change(quantityField(), {
      target: { value: '3' },
    });
    fireEvent.change(sizeField(), {
      target: { value: 'XL' },
    });
    fireEvent.click(button(CUSTOM_REQUEST_COPY.steps.continueToVerify));

    // Step 2 — APP4's own flow, embedded.
    const contact = await screen.findByRole('textbox', {
      name: VERIFICATION_COPY.emailField.label,
    });
    fireEvent.change(contact, { target: { value: TEST_EMAIL } });
    fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));
    const code = await screen.findByRole('textbox', {
      name: VERIFICATION_COPY.codeEntry.fieldLabel,
    });
    fireEvent.change(code, { target: { value: '012345' } });
    fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));

    // Step 3 — review and submit.
    const submit = await screen.findByRole('button', { name: CUSTOM_REQUEST_COPY.submit.action });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const [body] = submitMock.mock.calls[0]!;
    expect(body.catalog).toEqual({
      productId: PRODUCT_ID,
      productVariantId: VARIANT_BLUE,
      designSessionId: SESSION_ID,
    });
    expect(body.breakdown).toEqual([{ quantity: 3, sizeLabel: 'XL' }]);
    // The quantity line's own label, not the variant's.
    expect(body.breakdown?.[0]?.sizeLabel).not.toBe('L');

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/yeu-cau/da-gui?ma=${REQUEST_CODE}`),
    );
  });
});
