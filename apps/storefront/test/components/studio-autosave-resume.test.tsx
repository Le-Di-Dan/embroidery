/**
 * Resume across a full reload, and the end of a Session (`APP3-S10`).
 *
 * `APP3-S01` kept the Session id in component state and recorded that surviving
 * a reload needed a persistence contract no accepted authority provided. This is
 * that contract, exercised end to end: a stored **non-secret** id, an offer the
 * customer answers, a real resume request the browser attaches the `HttpOnly`
 * cookie to, and a handle that is forgotten the moment the server says the
 * Session is over.
 */
import {
  publicDesignSessionCreate,
  publicDesignSessionResume,
  publicDesignTemplateDetail,
  publicDesignTemplateList,
  publicProductPlacementGet,
} from '@embroidery/api-client';
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { StudioScreen } from '../../src/features/design-studio/components/studio-screen';
import { STUDIO_SAVE_COPY } from '../../src/features/design-studio/model/studio-autosave-copy';
import { STUDIO_COPY } from '../../src/features/design-studio/model/studio-copy';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
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

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductPlacementGet: jest.fn(),
  publicDesignTemplateList: jest.fn(),
  publicDesignTemplateDetail: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
  publicProductSideBackgroundGet: jest.fn(),
}));

const placementMock = publicProductPlacementGet as jest.MockedFunction<
  typeof publicProductPlacementGet
>;
const listMock = publicDesignTemplateList as jest.MockedFunction<typeof publicDesignTemplateList>;
const detailMock = publicDesignTemplateDetail as jest.MockedFunction<
  typeof publicDesignTemplateDetail
>;
const createMock = publicDesignSessionCreate as jest.MockedFunction<
  typeof publicDesignSessionCreate
>;
const resumeMock = publicDesignSessionResume as jest.MockedFunction<
  typeof publicDesignSessionResume
>;

const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const HANDLE_KEY = `embroidery.studio.session:${PRODUCT_SLUG}:mat-truoc:nguc-trai`;

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/resume');
  URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  for (const mock of [placementMock, listMock, detailMock, createMock, resumeMock])
    mock.mockReset();
  placementMock.mockResolvedValue(envelopeOf(makePlacement()));
  listMock.mockResolvedValue(
    envelopeOf(makeTemplatePage([makeTemplate({ slug: 'hoa-sen', name: 'Hoa sen' })])),
  );
  detailMock.mockResolvedValue(envelopeOf(makeTemplateDetail({ document: makeDocument([]) })));
  window.localStorage.clear();
  useStudioDocumentStore.getState().reset();
});

function renderStudio() {
  return renderWithProviders(<StudioScreen productName="Gấu bông" productSlug={PRODUCT_SLUG} />);
}

describe('the resume offer (APP3-S10 §20)', () => {
  it('offers nothing when this browser has no handle for the placement', async () => {
    renderStudio();

    expect(await screen.findByRole('button', { name: STUDIO_COPY.startBlank })).toBeEnabled();
    expect(screen.queryByTestId('studio-resume-prompt')).not.toBeInTheDocument();
  });

  it('is not offered under a placement the handle was not written for', async () => {
    window.localStorage.setItem(
      `embroidery.studio.session:${PRODUCT_SLUG}:mat-sau:lung-giua`,
      SESSION_ID,
    );

    renderStudio();

    expect(await screen.findByRole('button', { name: STUDIO_COPY.startBlank })).toBeEnabled();
    expect(screen.queryByTestId('studio-resume-prompt')).not.toBeInTheDocument();
  });

  it('asks rather than dropping the customer back into a design', async () => {
    window.localStorage.setItem(HANDLE_KEY, SESSION_ID);

    renderStudio();

    expect(await screen.findByTestId('studio-resume-prompt')).toBeInTheDocument();
    expect(screen.getByText(STUDIO_SAVE_COPY.resumeBody)).toBeInTheDocument();
    // Nothing was opened, resumed or created before the customer answered.
    expect(resumeMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('continuing (APP3-S10 §20)', () => {
  beforeEach(() => {
    window.localStorage.setItem(HANDLE_KEY, SESSION_ID);
  });

  it('resumes by the stored id, with no secret argument', async () => {
    resumeMock.mockResolvedValue(envelopeOf(makeSnapshot({ revision: 7 })));
    const user = createUser();
    renderStudio();
    await screen.findByTestId('studio-resume-prompt');

    await user.click(screen.getByTestId('studio-resume-continue'));

    await waitFor(() => {
      expect(resumeMock).toHaveBeenCalled();
    });
    expect(resumeMock.mock.calls[0]?.[0]).toBe(SESSION_ID);
    // The cookie is the browser's to attach; there is no second argument that
    // could carry a secret, because this code has none to carry.
    expect(resumeMock.mock.calls[0]).toHaveLength(2);
  });

  it('draws the stage from the resumed snapshot, with an empty past', async () => {
    resumeMock.mockResolvedValue(envelopeOf(makeSnapshot({ revision: 7 })));
    const user = createUser();
    renderStudio();
    await screen.findByTestId('studio-resume-prompt');

    await user.click(screen.getByTestId('studio-resume-continue'));

    // `APP3-B07` omits `scope` on resume; the geometry comes from the manifest
    // this screen already holds, so the stage really draws.
    expect(await screen.findByTestId('studio-stage-canvas')).toBeInTheDocument();
    expect(useStudioDocumentStore.getState().history.entries).toHaveLength(0);
    expect(useStudioDocumentStore.getState().history.cursor).toBe(0);
  });

  it('keeps the offer when the resume fails for a reason that is not expiry', async () => {
    resumeMock.mockRejectedValue(apiFailure(503));
    const user = createUser();
    renderStudio();
    await screen.findByTestId('studio-resume-prompt');

    await user.click(screen.getByTestId('studio-resume-continue'));

    expect(await screen.findByTestId('studio-resume-failed')).toBeInTheDocument();
    // The Session may well still be there. Forgetting the handle over a dropped
    // request would discard a real design.
    expect(window.localStorage.getItem(HANDLE_KEY)).toBe(SESSION_ID);
  });

  it('forgets the handle and returns to the picker on an explicit fresh start', async () => {
    const user = createUser();
    renderStudio();
    await screen.findByTestId('studio-resume-prompt');

    await user.click(screen.getByTestId('studio-resume-restart'));

    expect(await screen.findByRole('button', { name: STUDIO_COPY.startBlank })).toBeEnabled();
    expect(window.localStorage.getItem(HANDLE_KEY)).toBeNull();
    // No Session is opened by the act of declining one. The customer still
    // chooses Blank or a Template.
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('a Session that is over (APP3-S10 §21)', () => {
  it('forgets the handle, says so, and offers both approved ways on', async () => {
    window.localStorage.setItem(HANDLE_KEY, SESSION_ID);
    resumeMock.mockRejectedValue(apiFailure(401));
    const user = createUser();
    renderStudio();
    await screen.findByTestId('studio-resume-prompt');

    await user.click(screen.getByTestId('studio-resume-continue'));

    expect(await screen.findByText(STUDIO_SAVE_COPY.expiredHeading)).toBeInTheDocument();
    expect(screen.getByText(STUDIO_SAVE_COPY.expiredBody)).toBeInTheDocument();
    expect(screen.getByTestId('studio-expired-restart')).toBeInTheDocument();
    expect(screen.getByTestId('studio-expired-pick-template')).toBeInTheDocument();
    expect(window.localStorage.getItem(HANDLE_KEY)).toBeNull();
  });

  it('promises no recovery and reads no cookie', async () => {
    window.localStorage.setItem(HANDLE_KEY, SESSION_ID);
    resumeMock.mockRejectedValue(apiFailure(401));
    const user = createUser();
    const { container } = renderStudio();
    await screen.findByTestId('studio-resume-prompt');

    await user.click(screen.getByTestId('studio-resume-continue'));
    await screen.findByText(STUDIO_SAVE_COPY.expiredHeading);

    /*
     * One refusal, and nothing asks again. There is no grace secret to find.
     *
     * The check is on behaviour, not on the word: the approved copy names the
     * identifying cookie in a sentence that is true, and a ban on the *word*
     * would fire on the honest explanation while a `document.cookie` read went
     * past it. That read is forbidden structurally, in the boundary suite.
     */
    expect(resumeMock).toHaveBeenCalledTimes(1);
    expect(document.cookie).toBe('');
    expect(container.querySelectorAll('button')).toHaveLength(2);
  });

  it('goes back to the Template picker with nothing chosen', async () => {
    window.localStorage.setItem(HANDLE_KEY, SESSION_ID);
    resumeMock.mockRejectedValue(apiFailure(401));
    const user = createUser();
    renderStudio();
    await screen.findByTestId('studio-resume-prompt');
    await user.click(screen.getByTestId('studio-resume-continue'));
    await screen.findByText(STUDIO_SAVE_COPY.expiredHeading);

    await user.click(screen.getByTestId('studio-expired-pick-template'));

    // The list is back and nothing in it is chosen, so "chọn mẫu khác" really is
    // a fresh choice rather than the same screen under a second label.
    expect(await screen.findByRole('button', { name: /Hoa sen/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
