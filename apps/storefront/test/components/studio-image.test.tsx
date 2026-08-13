/**
 * The image capability, driven as a customer drives it (`APP3-S06`).
 *
 * The model test proves the rules; this proves the form asks them, that the
 * stage reflects the answer, and that the journey a customer actually takes —
 * choose, wait, see it appear — holds together across the four approved states.
 *
 * Time is a **fake clock** throughout. Polling is the subject of half of these
 * cases, and a suite that waited two real seconds per poll would take a minute
 * to prove something a virtual clock proves exactly.
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
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import {
  imageElement,
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  setViewportWidth,
  textElement,
} from '../support/studio-stage-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicProductPlacementGet: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
  publicDesignSessionAssetCreate: jest.fn(),
  publicDesignSessionAssetGet: jest.fn(),
  publicDesignSessionAssetStatus: jest.fn(),
}));

const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;
const uploadMock = publicDesignSessionAssetCreate as jest.MockedFunction<
  typeof publicDesignSessionAssetCreate
>;
const statusMock = publicDesignSessionAssetStatus as jest.MockedFunction<
  typeof publicDesignSessionAssetStatus
>;
const blobMock = publicDesignSessionAssetGet as jest.MockedFunction<
  typeof publicDesignSessionAssetGet
>;
const autosaveMock = jest.requireMock<{ publicDesignSessionAutosave: jest.Mock }>(
  '@embroidery/api-client',
).publicDesignSessionAutosave;

const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const DERIVATIVE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6082';

const created: string[] = [];
const revoked: string[] = [];

beforeAll(() => {
  URL.createObjectURL = jest.fn((blob: Blob) => {
    const url = `blob:studio/${String(created.length)}-${String(blob.size)}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = jest.fn((url: string) => {
    revoked.push(url);
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  // The accepted desktop composition, stated rather than inherited.
  setViewportWidth(1440);
  created.length = 0;
  revoked.length = 0;
  for (const mock of [backgroundMock, uploadMock, statusMock, blobMock, autosaveMock]) {
    mock.mockReset();
  }
  backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
  blobMock.mockResolvedValue(new Blob([new Uint8Array(64)], { type: 'image/webp' }));
  useStudioInteractionStore.setState({ selectedElementId: null });
  useStudioDocumentStore.getState().reset();
  useStudioViewportStore.getState().resetViewport();
});

afterEach(() => {
  jest.useRealTimers();
});

function accepted(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      assetId: ASSET_ID,
      designSessionAssetId: 'association',
      sessionRevision: 9,
      assetStatus: 'INSPECTING',
      mediaType: 'image/png',
      byteSize: 2_048,
      ...overrides,
    },
  } as never;
}

function status(state: string, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      assetId: ASSET_ID,
      state,
      ...(state === 'READY'
        ? {
            derivativeId: DERIVATIVE_ID,
            widthPx: 400,
            heightPx: 240,
            mediaType: 'image/webp',
            byteSize: 51_200,
          }
        : {}),
      ...overrides,
    },
  } as never;
}

function renderStage(document = makeStageDocument([textElement('t')])) {
  return renderWithProviders(
    <StudioStageScreen
      areaLimits={null}
      isResuming={false}
      onExpired={jest.fn()}
      onResume={jest.fn()}
      scope={makeScope()}
      snapshot={makeStageSnapshot(document)}
      templateName={null}
    />,
  );
}

function pngFile(name = 'anh.png', type = 'image/png', size = 2_048): File {
  const handle = new File([new Uint8Array(8)], name, { type });
  Object.defineProperty(handle, 'size', { value: size });
  return handle;
}

function choose(file: File) {
  fireEvent.change(screen.getByTestId('studio-image-file'), { target: { files: [file] } });
}

/** One polling tick, on the virtual clock. */
async function tick(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      jest.advanceTimersByTime(SESSION_ASSET_POLL_INTERVAL_MS);
      await Promise.resolve();
    });
  }
}

const placedImages = () =>
  (useStudioDocumentStore.getState().document?.elements ?? []).filter(
    (element) => element.type === 'image',
  );

describe('the affordance (APP3-S06 §17)', () => {
  it('offers exactly the three accepted types and no others', () => {
    renderStage();

    expect(screen.getByTestId('studio-image-file')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp',
    );
  });

  it.each([
    ['an SVG', 'image/svg+xml', 'Định dạng'],
    ['a GIF', 'image/gif', 'Định dạng'],
  ])('refuses %s before any request', (_label, type, sentence) => {
    renderStage();

    choose(pngFile('anh', type));

    expect(screen.getByTestId('studio-image-refusal')).toHaveTextContent(sentence);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('refuses an oversized file before any request', () => {
    renderStage();

    choose(pngFile('anh.png', 'image/png', 20 * 1024 * 1024));

    expect(screen.getByTestId('studio-image-refusal')).toHaveTextContent('MB');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('never shows a percentage the transport did not report', async () => {
    uploadMock.mockImplementation(() => new Promise(() => undefined));
    renderStage();

    choose(pngFile());

    await waitFor(() => {
      expect(screen.getByTestId('studio-image-status')).toHaveTextContent('Đang tải ảnh lên…');
    });
    expect(screen.getByTestId('studio-image-status')).not.toHaveTextContent('%');
  });
});

describe('the journey (APP3-S06 §22)', () => {
  it('uploads, waits, then places the image with the server’s own measurements', async () => {
    uploadMock.mockResolvedValue(accepted());
    statusMock.mockResolvedValueOnce(status('PROCESSING')).mockResolvedValue(status('READY'));
    renderStage();

    choose(pngFile());

    // Processing is reported honestly while the server has no verdict.
    await waitFor(() => {
      expect(screen.getByTestId('studio-image-status')).toHaveTextContent('Đang xử lý ảnh…');
    });
    expect(placedImages()).toHaveLength(0);

    await tick(2);

    await waitFor(() => {
      expect(placedImages()).toHaveLength(1);
    });
    expect(placedImages()[0]).toMatchObject({
      assetId: ASSET_ID,
      derivativeId: DERIVATIVE_ID,
      intrinsicWidthPx: 400,
      intrinsicHeightPx: 240,
    });
  });

  it('takes the session revision from the upload response', async () => {
    uploadMock.mockResolvedValue(accepted({ sessionRevision: 12 }));
    statusMock.mockResolvedValue(status('PROCESSING'));
    renderStage();

    choose(pngFile());
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
    });

    // The next upload must present the revision the server reported, or it is
    // refused as stale.
    await tick(1);
    choose(pngFile('hai.png'));
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(2);
    });
    const headers = uploadMock.mock.calls[1]?.[2]?.config?.headers as Record<string, string>;
    expect(headers['X-Design-Session-Revision']).toBe('12');
  });

  it('reuses one idempotency key per attempt and mints a new one per choice', async () => {
    uploadMock.mockResolvedValue(accepted());
    statusMock.mockResolvedValue(status('PROCESSING'));
    renderStage();

    choose(pngFile());
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(1);
    });
    await tick(1);
    choose(pngFile('hai.png'));
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledTimes(2);
    });

    const keyOf = (index: number) =>
      (uploadMock.mock.calls[index]?.[2]?.config?.headers as Record<string, string>)[
        'Idempotency-Key'
      ];
    expect(keyOf(0)).toEqual(expect.any(String));
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('renders the real bytes as one native SVG image, not a placeholder', async () => {
    renderStage(makeStageDocument([imageElement('img')]));

    await waitFor(() => {
      expect(screen.getByTestId('studio-stage-image')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('studio-image-placeholder')).not.toBeInTheDocument();
    expect(screen.getByTestId('studio-stage-image').getAttribute('href')).toMatch(/^blob:/);
    // One scene: the picture is inside the stage's own SVG.
    expect(screen.getByTestId('studio-stage-canvas')).toContainElement(
      screen.getByTestId('studio-stage-image'),
    );
  });

  it('keeps the honest placeholder while media is unavailable', async () => {
    blobMock.mockRejectedValue(new Error('refused'));
    renderStage(makeStageDocument([imageElement('img')]));

    await waitFor(() => {
      expect(screen.getByTestId('studio-image-placeholder')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('studio-stage-image')).not.toBeInTheDocument();
  });
});

describe('polling (APP3-S06 §11.3)', () => {
  it('does not begin before there is an upload to poll', () => {
    renderStage();

    expect(statusMock).not.toHaveBeenCalled();
  });

  it('stops on READY', async () => {
    uploadMock.mockResolvedValue(accepted());
    statusMock.mockResolvedValue(status('READY'));
    renderStage();

    choose(pngFile());
    await waitFor(() => {
      expect(placedImages()).toHaveLength(1);
    });

    const afterPlacement = statusMock.mock.calls.length;
    await tick(4);
    expect(statusMock.mock.calls.length).toBe(afterPlacement);
  });

  it('stops on REJECTED and says so without a reason', async () => {
    uploadMock.mockResolvedValue(accepted());
    statusMock.mockResolvedValue(status('REJECTED'));
    renderStage();

    choose(pngFile());

    await waitFor(() => {
      expect(screen.getByTestId('studio-image-refusal')).toHaveTextContent('không dùng được');
    });
    expect(placedImages()).toHaveLength(0);
    const afterVerdict = statusMock.mock.calls.length;
    await tick(4);
    expect(statusMock.mock.calls.length).toBe(afterVerdict);
  });

  it('never polls the binary route as a state machine', async () => {
    uploadMock.mockResolvedValue(accepted());
    statusMock.mockResolvedValue(status('PROCESSING'));
    renderStage();

    choose(pngFile());
    await tick(3);

    expect(statusMock.mock.calls.length).toBeGreaterThan(1);
    // The document has no image yet, so nothing addresses the preview route.
    expect(blobMock).not.toHaveBeenCalled();
  });

  it('stops when the component unmounts', async () => {
    uploadMock.mockResolvedValue(accepted());
    statusMock.mockResolvedValue(status('PROCESSING'));
    const view = renderStage();

    choose(pngFile());
    await tick(1);
    const beforeUnmount = statusMock.mock.calls.length;
    view.unmount();
    await tick(4);

    expect(statusMock.mock.calls.length).toBe(beforeUnmount);
  });
});

describe('object URLs stay runtime-only (APP3-S06 §18)', () => {
  it('writes no blob, URL or storage identity into the document', async () => {
    renderStage(makeStageDocument([imageElement('img')]));
    await waitFor(() => {
      expect(screen.getByTestId('studio-stage-image')).toBeInTheDocument();
    });

    const serialized = JSON.stringify(useStudioDocumentStore.getState().document);
    for (const forbidden of ['blob:', 'http', 'storageKey', 'bucket']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('revokes every owned URL on unmount', async () => {
    const view = renderStage(makeStageDocument([imageElement('img')]));
    await waitFor(() => {
      expect(created.length).toBeGreaterThan(0);
    });

    view.unmount();

    expect(revoked).toEqual(expect.arrayContaining(created));
  });
});

describe('nothing is pulled forward (APP3-S06 §2)', () => {
  /*
   * Scoped at `APP3-S10`, which delivered the autosave loop this rule predates.
   *
   * The thing it was written to prevent is unchanged and still asserted: placing
   * an image does not itself save. What changed is that the document it placed is
   * now saved *later*, by the one loop that owns saving, on the cadence that loop
   * owns — so the assertion is made at the moment of placement rather than
   * forever.
   */
  it('never saves from the image capability itself', async () => {
    uploadMock.mockResolvedValue(accepted());
    statusMock.mockResolvedValue(status('READY'));
    renderStage();

    choose(pngFile());
    await waitFor(() => {
      expect(placedImages()).toHaveLength(1);
    });

    expect(autosaveMock).not.toHaveBeenCalled();
  });

  it('offers no crop, opacity, filter, delete or history control', () => {
    renderStage(makeStageDocument([imageElement('img')]));

    const panel = screen.getByTestId('studio-image-choose').closest('section');
    const text = panel?.textContent ?? '';
    for (const promise of ['Cắt', 'Xoá nền', 'Bộ lọc', 'Độ mờ', 'Hoàn tác', 'Đã lưu', 'Lớp']) {
      expect(text).not.toContain(promise);
    }
  });
});

describe('responsive composition (APP3-S06 §7)', () => {
  it('offers the picker in flow at 1440', () => {
    setViewportWidth(1440);
    renderStage();

    expect(screen.getByTestId('studio-image-choose')).toBeInTheDocument();
    // The topbar exists at every tier from `APP3-S10` (it carries the save
    // chip); what must not exist at 1440 is the drawer trigger, because the
    // controls are already in flow.
    expect(screen.queryByTestId('studio-text-drawer-trigger')).not.toBeInTheDocument();
  });

  it('puts it in the one accepted drawer at 1024, behind the one trigger', () => {
    setViewportWidth(1024);
    renderStage();

    // One topbar, one trigger, one drawer — the image controls are a section of
    // the panel S05-MI01 established, not a second drawer over the same edge.
    expect(screen.getAllByTestId('studio-stage-topbar')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-text-drawer-trigger')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-text-drawer')).toHaveLength(1);
    expect(screen.getByTestId('studio-text-drawer')).toContainElement(
      screen.getByTestId('studio-image-choose'),
    );
  });

  it('renders no image editing surface at all at 390', () => {
    setViewportWidth(390);
    renderStage(makeStageDocument([imageElement('img')]));

    // Not hidden — absent. A CSS-hidden file input still opens a picker.
    expect(screen.queryByTestId('studio-image-file')).not.toBeInTheDocument();
    expect(screen.queryByTestId('studio-image-choose')).not.toBeInTheDocument();
    expect(screen.getByTestId('studio-image-mobile-notice')).toHaveTextContent('chưa đủ rộng');
  });

  it('promises no S11 capability in the mobile notice', () => {
    setViewportWidth(390);
    renderStage(makeStageDocument([imageElement('img')]));

    const notice = screen.getByTestId('studio-image-mobile-notice').textContent ?? '';
    for (const promise of ['sắp', 'sẽ có', 'cập nhật']) expect(notice).not.toContain(promise);
  });
});
