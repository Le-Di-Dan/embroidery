/**
 * The upload → Session revision → autosave seam (`APP3-E01-C1`).
 *
 * `APP3-E01` put `APP3-S06` and `APP3-S10` in one browser for the first time and
 * found `FU-APP3-UPLOAD-REVISION-SEAM-01`: an image upload advances the Session
 * revision, and while each capability kept its own copy of it the save that
 * followed presented the pre-upload one, was refused `409`, and showed a
 * customer with a single tab open a conflict with nobody.
 *
 * So these cases are deliberately *cross-capability*. Each suite proved its own
 * half and passed; only the pair can fail the way the customer did. They run
 * against the real `StudioStageScreen`, through the real file input and the real
 * autosave loop, on a fake clock — the 2500 ms cadence is the subject here, not
 * something to wait out.
 */
import { act } from 'react';

import {
  publicDesignSessionAssetCreate,
  publicDesignSessionAssetGet,
  publicDesignSessionAssetStatus,
  publicProductSideBackgroundGet,
} from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { SESSION_ASSET_POLL_INTERVAL_MS } from '../../src/features/design-studio/hooks/use-session-asset-status';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import {
  advance,
  autosaveMock,
  cursor,
  edit,
  entries,
  installStudioAutosaveHarness,
  renderStage,
  savedResponse,
  scene,
  settle,
  START_REVISION,
  tone,
  working,
} from '../support/studio-autosave-harness';
import { makeScope, makeStageSnapshot } from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicDesignSessionAssetCreate: jest.fn(),
  publicDesignSessionAssetGet: jest.fn(),
  publicDesignSessionAssetStatus: jest.fn(),
}));

installStudioAutosaveHarness();

const uploadMock = publicDesignSessionAssetCreate as jest.MockedFunction<
  typeof publicDesignSessionAssetCreate
>;
const statusMock = publicDesignSessionAssetStatus as jest.MockedFunction<
  typeof publicDesignSessionAssetStatus
>;
const blobMock = publicDesignSessionAssetGet as jest.MockedFunction<
  typeof publicDesignSessionAssetGet
>;
const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const DERIVATIVE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6082';
/** A second Session, for the case where a response outlives the one it measured. */
const OTHER_SESSION = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60ff';

/** The revision the upload moves the Session to. Not `START_REVISION + 1`:
 *  the point is that only the server's own number is ever presented. */
const AFTER_UPLOAD = 12;

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:studio/seam');
  URL.revokeObjectURL = jest.fn();
});

beforeEach(() => {
  for (const mock of [uploadMock, statusMock, blobMock]) mock.mockReset();
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  blobMock.mockResolvedValue(new Blob([new Uint8Array(64)], { type: 'image/webp' }));
});

function accepted(sessionRevision = AFTER_UPLOAD) {
  return {
    data: {
      assetId: ASSET_ID,
      designSessionAssetId: 'association',
      sessionRevision,
      assetStatus: 'INSPECTING',
      mediaType: 'image/png',
      byteSize: 2_048,
    },
  } as never;
}

function ready() {
  return {
    data: {
      assetId: ASSET_ID,
      state: 'READY',
      derivativeId: DERIVATIVE_ID,
      widthPx: 400,
      heightPx: 240,
      mediaType: 'image/webp',
      byteSize: 51_200,
    },
  } as never;
}

function pngFile(name = 'anh.png'): File {
  const handle = new File([new Uint8Array(8)], name, { type: 'image/png' });
  Object.defineProperty(handle, 'size', { value: 2_048 });
  return handle;
}

function choose(file = pngFile()) {
  fireEvent.change(screen.getByTestId('studio-image-file'), { target: { files: [file] } });
}

/** One polling tick on the virtual clock. */
async function tick() {
  await act(async () => {
    jest.advanceTimersByTime(SESSION_ASSET_POLL_INTERVAL_MS);
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** The revision presented by autosave call `index`. */
function presented(index: number): number {
  const call = autosaveMock.mock.calls[index];
  if (call === undefined) throw new Error(`no autosave call at ${String(index)}`);
  return (call[1] as { expectedRevision: number }).expectedRevision;
}

/** The revision the header of upload call `index` presented. */
function uploaded(index: number): string {
  const headers = uploadMock.mock.calls[index]?.[2]?.config?.headers as Record<string, string>;
  return headers['X-Design-Session-Revision'] ?? '';
}

const images = () => (working()?.elements ?? []).filter((element) => element.type === 'image');

/** Choose a file, let the upload land, poll once — the image is on the stage. */
async function uploadAndPlace(sessionRevision = AFTER_UPLOAD) {
  uploadMock.mockResolvedValue(accepted(sessionRevision));
  statusMock.mockResolvedValue(ready());
  choose();
  await waitFor(() => {
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });
  await tick();
  await waitFor(() => {
    expect(images()).toHaveLength(1);
  });
}

describe('the revision an upload produced (APP3-E01-C1 §5)', () => {
  it('is the one the next autosave presents, and the save is accepted', async () => {
    autosaveMock.mockResolvedValue(savedResponse(scene, AFTER_UPLOAD + 1));
    renderStage();

    await uploadAndPlace();
    // Placing the image is the mutation; the save it schedules is the one that
    // was refused 409 before this correction.
    await advance(2500);

    await waitFor(() => {
      expect(autosaveMock).toHaveBeenCalledTimes(1);
    });
    expect(presented(0)).toBe(AFTER_UPLOAD);
    await waitFor(() => {
      expect(tone()).toBe('saved');
    });
  });

  it('is not the pre-upload revision the bootstrap carried', async () => {
    autosaveMock.mockResolvedValue(savedResponse(scene, AFTER_UPLOAD + 1));
    renderStage();

    await uploadAndPlace();
    await advance(2500);

    await waitFor(() => {
      expect(autosaveMock).toHaveBeenCalledTimes(1);
    });
    expect(presented(0)).not.toBe(START_REVISION);
  });

  it('is never computed locally, even when the server skips numbers', async () => {
    autosaveMock.mockResolvedValue(savedResponse(scene, 30));
    renderStage();

    await uploadAndPlace(21);
    await advance(2500);

    await waitFor(() => {
      expect(autosaveMock).toHaveBeenCalledTimes(1);
    });
    // Neither START_REVISION + 1 nor 21 + 1: only what a response reported.
    expect(presented(0)).toBe(21);

    // And the save's own answer is adopted in turn.
    edit(240);
    await advance(2500);
    await waitFor(() => {
      expect(autosaveMock).toHaveBeenCalledTimes(2);
    });
    expect(presented(1)).toBe(30);
  });

  it('is presented by the next upload too, so an upload after a save is not stale', async () => {
    autosaveMock.mockResolvedValue(savedResponse(scene, 41));
    uploadMock.mockResolvedValue(accepted());
    statusMock.mockResolvedValue({ data: { assetId: ASSET_ID, state: 'PROCESSING' } } as never);
    renderStage();

    edit(200);
    await advance(2500);
    await waitFor(() => {
      expect(autosaveMock).toHaveBeenCalledTimes(1);
    });

    choose();
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
    });
    // The autosave moved the Session; B06B is compare-and-set on the same
    // number, so the upload must carry what the save was told.
    expect(uploaded(0)).toBe('41');
  });

  it('does not advance when the upload failed', async () => {
    autosaveMock.mockResolvedValue(savedResponse(scene, START_REVISION + 1));
    uploadMock.mockRejectedValue(new Error('transport'));
    renderStage();

    choose();
    await waitFor(() => {
      expect(screen.getByTestId('studio-image-refusal')).toBeInTheDocument();
    });

    edit(200);
    await advance(2500);
    await waitFor(() => {
      expect(autosaveMock).toHaveBeenCalledTimes(1);
    });
    expect(presented(0)).toBe(START_REVISION);
  });
});

describe('what adopting a revision must not do (APP3-E01-C1 §6)', () => {
  it('leaves the document dirty through the ordinary seam, not clean', async () => {
    autosaveMock.mockResolvedValue(savedResponse(scene, AFTER_UPLOAD + 1));
    renderStage();

    await uploadAndPlace();

    // The placement is a real change and the chip says so, immediately: a
    // revision handoff that had marked the document clean would lose it.
    expect(tone()).not.toBe('saved');
    await advance(2500);
    await waitFor(() => {
      expect(tone()).toBe('saved');
    });
  });

  it('keeps the past: the placement is one undoable entry', async () => {
    autosaveMock.mockResolvedValue(savedResponse(scene, AFTER_UPLOAD + 1));
    renderStage();
    const before = entries().length;

    await uploadAndPlace();

    expect(entries().length).toBe(before + 1);
    const at = cursor();
    act(() => {
      useStudioDocumentStore.getState().undo();
    });
    expect(images()).toHaveLength(0);
    expect(cursor()).toBe(at - 1);
  });

  it('starts no save by itself: only the placement schedules one', async () => {
    autosaveMock.mockResolvedValue(savedResponse(scene, AFTER_UPLOAD + 1));
    uploadMock.mockResolvedValue(accepted());
    // The upload lands, but no verdict arrives — so nothing is placed.
    statusMock.mockResolvedValue({ data: { assetId: ASSET_ID, state: 'PROCESSING' } } as never);
    renderStage();

    choose();
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
    });
    await advance(60_000);

    expect(autosaveMock).not.toHaveBeenCalled();
    expect(tone()).toBe('saved');
  });
});

describe('ordering and ownership (APP3-E01-C1 §7)', () => {
  it('never moves the revision backward when an older answer lands last', async () => {
    // A save is in flight when the upload answers. The save started at the
    // bootstrap revision and its own answer is therefore older than what the
    // upload reported, even though it arrives after it.
    let answer: ((value: unknown) => void) | null = null;
    autosaveMock.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }) as never,
    );
    renderStage();

    edit(200);
    await advance(2500);
    await waitFor(() => {
      expect(autosaveMock).toHaveBeenCalledTimes(1);
    });

    await uploadAndPlace();

    autosaveMock.mockResolvedValue(savedResponse(scene, 40));
    await act(async () => {
      answer?.(savedResponse(scene, START_REVISION + 1));
      await Promise.resolve();
    });
    await settle();
    await advance(2500);

    await waitFor(() => {
      expect(autosaveMock).toHaveBeenCalledTimes(2);
    });
    // START_REVISION + 1 = 5 arrived last and is lower than the upload's 12.
    expect(presented(1)).toBe(AFTER_UPLOAD);
  });

  it('does not adopt a late response measured against a Session the customer left', async () => {
    let answer: ((value: unknown) => void) | null = null;
    uploadMock.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }) as never,
    );
    statusMock.mockResolvedValue(ready());
    autosaveMock.mockResolvedValue(savedResponse(scene, 71));

    const view = renderWithProviders(
      <StudioStageScreen
        areaLimits={null}
        isResuming={false}
        onExpired={jest.fn()}
        onResume={jest.fn()}
        scope={makeScope()}
        snapshot={makeStageSnapshot(scene, { revision: START_REVISION })}
        templateName={null}
      />,
    );

    choose();
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
    });

    // The customer starts over: a different Session, at its own revision.
    view.rerender(
      <StudioStageScreen
        areaLimits={null}
        isResuming={false}
        onExpired={jest.fn()}
        onResume={jest.fn()}
        scope={makeScope()}
        snapshot={makeStageSnapshot(scene, { sessionId: OTHER_SESSION, revision: 2 })}
        templateName={null}
      />,
    );

    await act(async () => {
      answer?.(accepted(99));
      await Promise.resolve();
    });
    await settle();

    edit(200);
    await advance(2500);
    await waitFor(() => {
      expect(autosaveMock).toHaveBeenCalledTimes(1);
    });
    // 99 counts revisions of a Session this loop is not saving into.
    expect(presented(0)).toBe(2);
  });
});
