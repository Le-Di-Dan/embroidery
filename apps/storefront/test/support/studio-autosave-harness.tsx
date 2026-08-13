/**
 * The shared harness for the `APP3-S10` component suites.
 *
 * It answers "how is the real Studio driven, and how is time advanced"; the
 * suites importing it answer "what must the autosave loop do". Two copies of a
 * clock helper is how one suite silently stops advancing the timer the other one
 * does.
 *
 * The mock factory is deliberately **not** here: `jest.mock` is hoisted to the
 * top of the file that calls it, so a factory in a helper would not be applied
 * to the module the suite imports.
 *
 * Test-only support. No production file imports it.
 */
import { act } from 'react';

import {
  publicDesignSessionAutosave,
  publicDesignSessionResume,
  publicProductSideBackgroundGet,
  type DesignSessionSnapshotResponse,
} from '@embroidery/api-client';
import type { DesignDocument } from '@embroidery/design-document';
import { renderWithProviders, screen } from '@embroidery/frontend-testing';

import { StudioStageScreen } from '../../src/features/design-studio/components/studio-stage-screen';
import { useStudioDocumentStore } from '../../src/features/design-studio/store/studio-document.store';
import { useStudioInteractionStore } from '../../src/features/design-studio/store/studio-interaction.store';
import { useStudioViewportStore } from '../../src/features/design-studio/store/studio-viewport.store';
import { envelopeOf } from './studio-fixture';
import {
  makeScope,
  makeStageDocument,
  makeStageSnapshot,
  setViewportWidth,
  shapeElement,
} from './studio-stage-fixture';

export const autosaveMock = publicDesignSessionAutosave as jest.MockedFunction<
  typeof publicDesignSessionAutosave
>;
export const resumeMock = publicDesignSessionResume as jest.MockedFunction<
  typeof publicDesignSessionResume
>;
export const backgroundMock = publicProductSideBackgroundGet as jest.MockedFunction<
  typeof publicProductSideBackgroundGet
>;

export const START_REVISION = 4;

/** Two documents that differ, so "which one is on the stage" is answerable. */
export const scene = makeStageDocument([shapeElement('a', { transform: box(150) })]);

function box(x: number) {
  return { x, y: 160, width: 40, height: 20, rotationDeg: 0, scaleX: 1, scaleY: 1 };
}

/** A document the customer could have produced by moving the one element. */
export function movedScene(x: number): DesignDocument {
  return makeStageDocument([shapeElement('a', { transform: box(x) })]);
}

export function snapshotOf(
  document: DesignDocument,
  revision: number,
): DesignSessionSnapshotResponse {
  return makeStageSnapshot(document, { revision });
}

export function savedResponse(document: DesignDocument, revision: number) {
  return envelopeOf(snapshotOf(document, revision));
}

export function resumedResponse(document: DesignDocument, revision: number) {
  return envelopeOf(snapshotOf(document, revision));
}

/** The lifecycle every S10 suite installs, so none can drift from the others. */
export function installStudioAutosaveHarness(): void {
  beforeAll(() => {
    URL.createObjectURL = jest.fn(() => 'blob:studio/autosave');
    URL.revokeObjectURL = jest.fn();
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    };
    globalThis.cancelAnimationFrame = () => undefined;
  });

  beforeEach(() => {
    // Every timing proof in these suites runs on a fake clock. A real 2500ms
    // wait would make the suite slow *and* flaky, and a real 15s retry ladder
    // would make it unrunnable.
    jest.useFakeTimers();
    setViewportWidth(1440);
    autosaveMock.mockReset();
    resumeMock.mockReset();
    backgroundMock.mockReset();
    backgroundMock.mockRejectedValue(new Error('no background in this fixture'));
    useStudioInteractionStore.setState({ selectedElementId: null });
    useStudioDocumentStore.getState().reset();
    useStudioViewportStore.getState().resetViewport();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });
}

export function renderStage(revision = START_REVISION, onExpired = jest.fn()) {
  const view = renderWithProviders(
    <StudioStageScreen
      areaLimits={null}
      isResuming={false}
      onExpired={onExpired}
      onResume={jest.fn()}
      scope={makeScope()}
      snapshot={snapshotOf(scene, revision)}
      templateName={null}
    />,
  );
  return { ...view, onExpired };
}

/**
 * One document mutation, through the same `commit` every capability uses.
 *
 * Not a synthetic store write: `commit` is the seam `APP3-S03` established and
 * `APP3-S04`, `S05` and `S06` all write through, so a save scheduled from here
 * is scheduled by exactly what a real edit schedules it by.
 */
export function edit(x: number, kind = 'move' as const): void {
  act(() => {
    useStudioDocumentStore.getState().commit(movedScene(x), { kind, label: 'Hình khối' });
  });
}

/** Advances the fake clock and lets any promise the timer started settle. */
export async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Settles pending promises without moving the clock at all. */
export async function settle(): Promise<void> {
  await advance(0);
}

export const tone = () => screen.getByTestId('studio-save-chip').dataset['tone'];
export const saveState = () => screen.queryByTestId('studio-save-state')?.dataset['state'] ?? null;
export const working = () => useStudioDocumentStore.getState().document;
export const entries = () => useStudioDocumentStore.getState().history.entries;
export const cursor = () => useStudioDocumentStore.getState().history.cursor;

/** The `x` of the one element, which is what every edit here changes. */
export function placedX(): number | null {
  const element = working()?.elements[0];
  return element === undefined ? null : element.transform.x;
}
