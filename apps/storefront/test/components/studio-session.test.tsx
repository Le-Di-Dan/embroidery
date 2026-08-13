/**
 * Session bootstrap, resume and expiry on the Studio route (`APP3-S01`).
 *
 * The failures worth guarding are the quiet ones: a clone that becomes a blank
 * session nobody asked for, a double-submit that opens two Sessions on one
 * placement, a client that extends its own expiry, and any path by which a
 * Session identity reaches browser storage or the URL.
 */
import {
  publicDesignSessionCreate,
  publicDesignSessionResume,
  publicDesignTemplateAssetGet,
  publicDesignTemplateDetail,
  publicDesignTemplateList,
  publicProductPlacementGet,
} from '@embroidery/api-client';
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { StudioScreen } from '../../src/features/design-studio/components/studio-screen';
import { STUDIO_SAVE_COPY } from '../../src/features/design-studio/model/studio-autosave-copy';
import { STUDIO_COPY } from '../../src/features/design-studio/model/studio-copy';
import {
  apiFailure,
  envelopeOf,
  makeDocument,
  makePlacement,
  makeSnapshot,
  makeTemplate,
  makeTemplateDetail,
  makeTemplatePage,
  PRODUCT_SLUG,
} from '../support/studio-fixture';

/**
 * Indexed access that fails loudly when the entry is absent.
 *
 * `noUncheckedIndexedAccess` is on, and an assertion made against a silently
 * `undefined` element would be asserting nothing at all.
 */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`no entry at index ${String(index)}`);
  return item;
}

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductPlacementGet: jest.fn(),
  publicDesignTemplateList: jest.fn(),
  publicDesignTemplateDetail: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
}));

const placementMock = publicProductPlacementGet as jest.MockedFunction<
  typeof publicProductPlacementGet
>;
const listMock = publicDesignTemplateList as jest.MockedFunction<typeof publicDesignTemplateList>;
const detailMock = publicDesignTemplateDetail as jest.MockedFunction<
  typeof publicDesignTemplateDetail
>;
const assetMock = publicDesignTemplateAssetGet as jest.MockedFunction<
  typeof publicDesignTemplateAssetGet
>;
const createMock = publicDesignSessionCreate as jest.MockedFunction<
  typeof publicDesignSessionCreate
>;
const resumeMock = publicDesignSessionResume as jest.MockedFunction<
  typeof publicDesignSessionResume
>;

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/1');
  URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  placementMock.mockReset();
  listMock.mockReset();
  detailMock.mockReset();
  assetMock.mockReset();
  createMock.mockReset();
  resumeMock.mockReset();

  placementMock.mockResolvedValue(envelopeOf(makePlacement()));
  listMock.mockResolvedValue(
    envelopeOf(makeTemplatePage([makeTemplate({ slug: 'hoa-sen', name: 'Hoa sen' })])),
  );
  detailMock.mockResolvedValue(envelopeOf(makeTemplateDetail({ document: makeDocument([]) })));
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderStudio() {
  return renderWithProviders(<StudioScreen productName="Gấu bông" productSlug={PRODUCT_SLUG} />);
}

describe('Blank bootstrap', () => {
  it('sends the generated BLANK branch bound to the authorized placement', async () => {
    const user = createUser();
    createMock.mockResolvedValue(envelopeOf(makeSnapshot()));

    renderStudio();
    await user.click(await screen.findByRole('button', { name: STUDIO_COPY.startBlank }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalled();
    });
    expect(nth(createMock.mock.calls, 0)[0]).toEqual({
      mode: 'BLANK',
      productSlug: PRODUCT_SLUG,
      sideCode: 'mat-truoc',
      areaCode: 'nguc-trai',
    });
    // No document is sent: the blank DesignDocument is server-owned, and a
    // locally manufactured one would be a second definition of it.
    expect(nth(createMock.mock.calls, 0)[0]).not.toHaveProperty('document');
  });

  it('blocks a duplicate submission while one is in flight', async () => {
    const user = createUser();
    let release = (): void => undefined;
    createMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(envelopeOf(makeSnapshot()));
          };
        }),
    );

    renderStudio();
    const button = await screen.findByRole('button', { name: STUDIO_COPY.startBlank });
    await user.click(button);

    expect(await screen.findByText(STUDIO_COPY.starting)).toBeInTheDocument();
    expect(button).toBeDisabled();

    release();
    await screen.findByText(STUDIO_COPY.readyHeading);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('treats the returned snapshot as the only Session truth', async () => {
    const user = createUser();
    createMock.mockResolvedValue(
      envelopeOf(makeSnapshot({ expiresAt: '2026-09-30T10:00:00.000Z', revision: 3 })),
    );

    renderStudio();
    await user.click(await screen.findByRole('button', { name: STUDIO_COPY.startBlank }));

    expect(await screen.findByText('2026-09-30T10:00:00.000Z')).toBeInTheDocument();
  });

  it('shows no editing control once the Session is open', async () => {
    const user = createUser();
    createMock.mockResolvedValue(envelopeOf(makeSnapshot()));

    renderStudio();
    await user.click(await screen.findByRole('button', { name: STUDIO_COPY.startBlank }));
    await screen.findByText(STUDIO_COPY.readyHeading);

    // The handoff placeholder is a statement, not a disabled editor. A greyed
    // tool rail would promise a stage this checkpoint does not build.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('Clone bootstrap', () => {
  async function chooseTemplate() {
    const user = createUser();
    renderStudio();
    await user.click(await screen.findByRole('button', { name: /Hoa sen/ }));
    return user;
  }

  it('sends the generated CLONE_TEMPLATE branch with the Template slug', async () => {
    createMock.mockResolvedValue(envelopeOf(makeSnapshot()));
    const user = await chooseTemplate();

    await user.click(screen.getByRole('button', { name: STUDIO_COPY.startClone }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalled();
    });
    expect(nth(createMock.mock.calls, 0)[0]).toEqual({
      mode: 'CLONE_TEMPLATE',
      productSlug: PRODUCT_SLUG,
      sideCode: 'mat-truoc',
      areaCode: 'nguc-trai',
      templateSlug: 'hoa-sen',
    });
    // The version the picker read is not sent. `APP3-B07` resolves the
    // published version itself and stays final at bootstrap time.
    expect(nth(createMock.mock.calls, 0)[0]).not.toHaveProperty('templateVersion');
  });

  it('never falls back to a blank session when the clone is refused', async () => {
    createMock.mockRejectedValue(apiFailure(404));
    const user = await chooseTemplate();

    await user.click(screen.getByRole('button', { name: STUDIO_COPY.startClone }));

    expect(await screen.findByText(STUDIO_COPY.startCloneError)).toBeInTheDocument();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(STUDIO_COPY.readyHeading)).not.toBeInTheDocument();
    // Still on the picker, with the choice intact and Blank still explicit.
    expect(screen.getByRole('button', { name: STUDIO_COPY.startBlank })).toBeEnabled();
  });
});

describe('resume and expiry', () => {
  async function openSession() {
    const user = createUser();
    createMock.mockResolvedValue(envelopeOf(makeSnapshot()));
    renderStudio();
    await user.click(await screen.findByRole('button', { name: STUDIO_COPY.startBlank }));
    await screen.findByText(STUDIO_COPY.readyHeading);
    return user;
  }

  it('resumes by the id the create response returned, with no secret argument', async () => {
    resumeMock.mockResolvedValue(envelopeOf(makeSnapshot({ revision: 5 })));
    const user = await openSession();

    await user.click(screen.getByRole('button', { name: STUDIO_COPY.resume }));

    await waitFor(() => {
      expect(resumeMock).toHaveBeenCalled();
    });
    expect(nth(resumeMock.mock.calls, 0)[0]).toBe('22222222-2222-4222-8222-222222222222');
    // Exactly two arguments: the id and the per-call transport options. There
    // is no third one, because there is no secret to pass.
    expect(nth(resumeMock.mock.calls, 0)).toHaveLength(2);
  });

  /*
   * Scoped at `APP3-S10`, on the terms `APP3-G03` sets.
   *
   * "Nothing at all in the browser" was right while no accepted authority
   * allowed anything to be kept. `APP3-G03` allows exactly one thing — the
   * **non-secret Session id**, under a namespaced key — and `APP3-S10` is the
   * checkpoint that keeps it so a design survives a reload. What this rule was
   * always protecting is unchanged and asserted more strictly than before: the
   * secret, the document and the revision reach no browser storage, no cookie
   * and no URL.
   */
  it('persists the non-secret Session id and nothing else', async () => {
    resumeMock.mockResolvedValue(envelopeOf(makeSnapshot()));
    const user = await openSession();
    await user.click(screen.getByRole('button', { name: STUDIO_COPY.resume }));
    await waitFor(() => {
      expect(resumeMock).toHaveBeenCalled();
    });

    // One key, named after the placement, holding the id verbatim.
    expect(window.localStorage.length).toBe(1);
    const key = nth([window.localStorage.key(0) ?? ''], 0);
    expect(key).toBe(`embroidery.studio.session:${PRODUCT_SLUG}:mat-truoc:nguc-trai`);
    expect(window.localStorage.getItem(key)).toBe('22222222-2222-4222-8222-222222222222');

    // Everything else is still forbidden, and the whole store is searched for
    // the values that would matter rather than only the one key inspected.
    const stored = JSON.stringify(window.localStorage);
    for (const forbidden of ['elements', 'revision', 'expiresAt', 'secret']) {
      expect(stored).not.toContain(forbidden);
    }
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(document.cookie).toBe('');
  });

  it('forgets the handle when the Session is refused as expired', async () => {
    resumeMock.mockRejectedValue(apiFailure(401));
    const user = await openSession();
    expect(window.localStorage.length).toBe(1);

    await user.click(screen.getByRole('button', { name: STUDIO_COPY.resume }));
    await screen.findByText(STUDIO_SAVE_COPY.expiredHeading);

    // A dead Session must not be offered again after a reload.
    expect(window.localStorage.length).toBe(0);
  });

  it('shows the expired state when resume is refused with 401', async () => {
    resumeMock.mockRejectedValue(apiFailure(401));
    const user = await openSession();

    await user.click(screen.getByRole('button', { name: STUDIO_COPY.resume }));

    expect(await screen.findByText(STUDIO_SAVE_COPY.expiredHeading)).toBeInTheDocument();
    // One way forward, and it is an explicit new start. Nothing revives the
    // dead Session and nothing replays create by itself.
    expect(screen.getByRole('button', { name: STUDIO_COPY.expiredRestart })).toBeInTheDocument();
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('does not report an expiry for a failure that is not an authorization refusal', async () => {
    resumeMock.mockRejectedValue(apiFailure(503));
    const user = await openSession();

    await user.click(screen.getByRole('button', { name: STUDIO_COPY.resume }));

    await waitFor(() => {
      expect(resumeMock).toHaveBeenCalled();
    });
    expect(screen.queryByText(STUDIO_SAVE_COPY.expiredHeading)).not.toBeInTheDocument();
    expect(screen.getByText(STUDIO_COPY.readyHeading)).toBeInTheDocument();
  });

  it('returns to the picker after an explicit restart', async () => {
    resumeMock.mockRejectedValue(apiFailure(401));
    const user = await openSession();
    await user.click(screen.getByRole('button', { name: STUDIO_COPY.resume }));
    await screen.findByText(STUDIO_SAVE_COPY.expiredHeading);

    await user.click(screen.getByRole('button', { name: STUDIO_COPY.expiredRestart }));

    expect(await screen.findByRole('button', { name: STUDIO_COPY.startBlank })).toBeEnabled();
  });
});
