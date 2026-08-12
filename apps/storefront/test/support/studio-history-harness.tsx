/**
 * The shared harness for the `APP3-S08` component suites.
 *
 * Extracted when the one suite crossed the 600-line test ceiling. It is a split
 * by *responsibility*, not by line count: this module answers "how is the real
 * Studio driven, and how is one gesture fired", and the two suites importing it
 * answer "what must the history do". Two copies of a drag helper is how one
 * suite silently stops firing the gesture the other one does.
 *
 * The mock factory is deliberately **not** here: `jest.mock` is hoisted to the
 * top of the file that calls it, so a factory in a helper would not be applied
 * to the module the suite imports.
 *
 * Test-only support. No production file imports it.
 */
import { act } from 'react';

import {
  publicDesignSessionAssetCreate,
  publicDesignSessionAssetGet,
  publicDesignSessionAssetStatus,
  publicProductSideBackgroundGet,
} from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { SESSION_ASSET_POLL_INTERVAL_MS } from '../../src/features/design-studio/hooks/use-session-asset-status';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import {
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  setViewportWidth,
  shapeElement,
  textElement,
} from './studio-stage-fixture';

export const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;
export const uploadMock = publicDesignSessionAssetCreate as jest.MockedFunction<
  typeof publicDesignSessionAssetCreate
>;
export const statusMock = publicDesignSessionAssetStatus as jest.MockedFunction<
  typeof publicDesignSessionAssetStatus
>;
export const blobMock = publicDesignSessionAssetGet as jest.MockedFunction<
  typeof publicDesignSessionAssetGet
>;

export const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
export const DERIVATIVE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6082';

/** Inside the fixture safe area (100,120 → 400,320), with room to move. */
export const INSIDE = {
  x: 150,
  y: 160,
  width: 40,
  height: 20,
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
};
const BOX_WIDTH_PX = 1000;
const BOX_HEIGHT_PX = 800;

export const scene = makeStageDocument([
  shapeElement('a', { transform: INSIDE }),
  textElement('b', { text: 'Xin chào', transform: { ...INSIDE, x: 250 } }),
]);

export function studioClient() {
  return jest.requireMock<{
    publicDesignSessionAutosave: jest.Mock;
    publicDesignSessionCreate: jest.Mock;
    publicDesignSessionResume: jest.Mock;
  }>('@embroidery/api-client');
}

/** The lifecycle both suites install, so neither can drift from the other. */
export function installStudioHistoryHarness(): void {
  beforeAll(() => {
    URL.createObjectURL = jest.fn(() => 'blob:studio/history');
    URL.revokeObjectURL = jest.fn();
    Element.prototype.setPointerCapture = jest.fn();
    Element.prototype.releasePointerCapture = jest.fn();
    Element.prototype.hasPointerCapture = jest.fn(() => true);
    // jsdom runs no frames; the gesture schedules exactly one per pointer batch.
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    globalThis.cancelAnimationFrame = () => undefined;
  });

  beforeEach(() => {
    // The accepted desktop composition, stated rather than inherited: jsdom's
    // own default width sits in the tablet band, where the panel is in a drawer.
    setViewportWidth(1440);
    for (const mock of [backgroundMock, uploadMock, statusMock, blobMock]) mock.mockReset();
    studioClient().publicDesignSessionAutosave.mockReset();
    backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
    blobMock.mockResolvedValue(new Blob([new Uint8Array(64)], { type: 'image/webp' }));
    useStudioInteractionStore.setState({ selectedElementId: null });
    useStudioDocumentStore.getState().reset();
    useStudioViewportStore.getState().resetViewport();
  });
}

/** How a Session that was cloned from a published Template arrives (`APP3-B07`). */
export const LINEAGE = Object.freeze({ templateSlug: 'hoa-sen-co-dien', templateVersion: 3 });

export interface RenderStageOptions {
  readonly sessionId?: string;
  /** Present only for a clone, exactly as `APP3-B07` sets it. */
  readonly lineage?: typeof LINEAGE;
  /** The display name `APP3-S01` already held, or `null` on a resume. */
  readonly templateName?: string | null;
}

export function renderStage(document = scene, options: RenderStageOptions = {}) {
  const base = makeStageSnapshot(document);
  const snapshot = {
    ...base,
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    ...(options.lineage === undefined ? {} : { lineage: options.lineage }),
  };
  return renderWithProviders(
    <StudioStageScreen
      areaLimits={null}
      isResuming={false}
      onResume={jest.fn()}
      scope={makeScope()}
      snapshot={snapshot}
      templateName={options.templateName ?? null}
    />,
  );
}

export function rerenderStage(
  view: ReturnType<typeof renderWithProviders>,
  sessionId: string,
): void {
  view.rerender(
    <StudioStageScreen
      areaLimits={null}
      isResuming={false}
      onResume={jest.fn()}
      scope={makeScope()}
      snapshot={{ ...makeStageSnapshot(scene), sessionId }}
      templateName={null}
    />,
  );
}

export function select(id: string) {
  act(() => {
    useStudioInteractionStore.getState().selectElement(id);
  });
}

function pointerEvent(type: string, init: Record<string, unknown> = {}) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    ...init,
  }) as unknown as Event;
}

function sizeOverlay() {
  const node = screen.queryByTestId('studio-transform-overlay');
  if (node === null) return;
  Object.defineProperty(node, 'clientWidth', { value: BOX_WIDTH_PX, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: BOX_HEIGHT_PX, configurable: true });
}

/** One gesture over the given pointer moves, ending in a release. */
export function drag(testId: string, steps: readonly (readonly [number, number])[]) {
  sizeOverlay();
  const handle = screen.getByTestId(testId);
  const overlay = screen.getByTestId('studio-transform-overlay');
  fireEvent(handle, Object.assign(pointerEvent('pointerdown'), { pointerType: 'mouse' }));
  for (const [x, y] of steps) {
    fireEvent(
      overlay,
      Object.assign(pointerEvent('pointermove', { clientX: x, clientY: y }), {
        pointerType: 'mouse',
      }),
    );
  }
  fireEvent(overlay, Object.assign(pointerEvent('pointerup'), { pointerType: 'mouse' }));
}

/** One polling tick, on the virtual clock. */
export async function tick(times = 1) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      jest.advanceTimersByTime(SESSION_ASSET_POLL_INTERVAL_MS);
      await Promise.resolve();
    });
  }
}

export const entries = () => useStudioDocumentStore.getState().history.entries;
export const cursor = () => useStudioDocumentStore.getState().history.cursor;
/** The action rows only. The baseline is projection, not an entry. */
export const rows = () => screen.queryAllByTestId('studio-history-row');
export const baselineRow = () => screen.getByTestId('studio-history-baseline');
/** Every projected row that claims to be the current position. Must be one. */
export const currentRows = () =>
  [...screen.getByTestId('studio-history-list').querySelectorAll('li')].filter(
    (node) => node.getAttribute('data-current') === 'true',
  );
export const undoButton = () => screen.getByTestId('studio-history-undo');
export const redoButton = () => screen.getByTestId('studio-history-redo');
export const stored = (id: string) =>
  useStudioDocumentStore.getState().document?.elements.find((element) => element.id === id);
export const imageElements = () =>
  (useStudioDocumentStore.getState().document?.elements ?? []).filter(
    (element) => element.type === 'image',
  );
export const paintedIds = () =>
  [
    ...screen
      .getByTestId('studio-stage-canvas')
      .querySelectorAll('[data-testid^="studio-element-"]'),
  ].map((node) => node.getAttribute('data-testid')?.replace('studio-element-', ''));
