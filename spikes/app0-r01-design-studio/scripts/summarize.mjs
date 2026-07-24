#!/usr/bin/env node
/**
 * Folds the raw per-run results into one summary per candidate plus the scoring
 * file. Budgets and weights are frozen here BEFORE any result is looked at (see
 * the completion report); this script only applies them.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RAW = join(PACKAGE_ROOT, 'results', 'raw');
const ENGINES = ['konva', 'fabric', 'svg'];

/** Frozen provisional budgets (checkpoint §21). Not changed after results. */
export const BUDGETS = {
  transformP95DesktopMs: 20,
  transformP95MobileMs: 33,
  longTaskMs: 100,
  sceneLoadDesktopMs: 500,
  sceneLoadMobileMs: 1000,
  serializeLMs: 100,
  deserializeLMs: 300,
  incrementalGzipKb: 200,
};

/** Frozen weights (checkpoint §24). */
export const WEIGHTS = {
  capability: 25,
  architecture: 20,
  react: 15,
  mobile: 15,
  performance: 15,
  accessibility: 5,
  supplyChain: 5,
};

/**
 * Judgement scores per weighted area, 0..1 of the area weight. Each is anchored
 * to observed evidence; the rationale is carried into the completion report.
 */
const AREA_SCORES = {
  konva: {
    capability: 0.8,
    architecture: 0.85,
    react: 0.73,
    mobile: 0.67,
    performance: 0.67,
    accessibility: 0.4,
    supplyChain: 0.8,
  },
  fabric: {
    capability: 0.92,
    architecture: 0.75,
    react: 0.53,
    mobile: 0.33,
    performance: 0.27,
    accessibility: 0.4,
    supplyChain: 0.8,
  },
  svg: {
    capability: 0.84,
    architecture: 1,
    react: 1,
    mobile: 1,
    performance: 1,
    accessibility: 1,
    supplyChain: 1,
  },
};

function readRaw() {
  const files = readdirSync(RAW).filter((name) => name.endsWith('.json'));
  return files.map((name) => ({ name, data: JSON.parse(readFileSync(join(RAW, name), 'utf8')) }));
}

function worst(values) {
  return values.length === 0 ? null : Math.max(...values);
}

function summarizeEngine(engine, raw, bundle) {
  const perf = raw.filter((entry) => entry.name.startsWith(`performance.${engine}.`));
  const caps = raw.filter((entry) => entry.name.startsWith(`capability.${engine}.`));
  const mobile = raw.filter((entry) => entry.name.startsWith(`mobile.${engine}.`));

  const runs = perf.map((entry) => {
    const { data } = entry;
    const isMobile = data.project.startsWith('mobile');
    const transforms = ['drag', 'resize', 'rotate'];
    const transformP95 = (size) =>
      worst(transforms.map((kind) => data.scenes[size].gestures[kind].frames.p95));
    return {
      platform: data.platform,
      project: data.project,
      isMobile,
      firstUsableP95: {
        S: data.scenes.S.load.firstUsable.p95,
        M: data.scenes.M.load.firstUsable.p95,
        L: data.scenes.L.load.firstUsable.p95,
      },
      transformP95: { S: transformP95('S'), M: transformP95('M'), L: transformP95('L') },
      viewportP95M: data.scenes.M.gestures.zoom.frames.p95,
      droppedFramesLDrag: data.scenes.L.gestures.drag.dropped,
      longTaskMaxMs: worst(
        ['S', 'M', 'L'].flatMap((size) =>
          Object.values(data.scenes[size].gestures).map((gesture) => gesture.longTasks.maxMs),
        ),
      ),
      selectionP95M: data.scenes.M.selection.p95,
      undoRedoP95M: data.scenes.M.undoRedo.p95,
      nodes: { S: data.scenes.S.nodes, M: data.scenes.M.nodes, L: data.scenes.L.nodes },
      canonicalSerializeLP95: data.canonical.L.serialize.p95,
      canonicalDeserializeLP95: data.canonical.L.deserialize.p95,
      sparseWatermarkDragP95M: data.sparseWatermarkDragM.frames.p95,
      leak: data.leak,
    };
  });

  const desktopRuns = runs.filter((run) => !run.isMobile);
  const mobileRuns = runs.filter((run) => run.isMobile);
  const gates = {
    transformDesktopM: worst(desktopRuns.map((run) => run.transformP95.M)),
    transformMobileM: worst(mobileRuns.map((run) => run.transformP95.M)),
    longTaskMax: worst(runs.map((run) => run.longTaskMaxMs)),
    sceneLoadDesktopM: worst(desktopRuns.map((run) => run.firstUsableP95.M)),
    sceneLoadMobileM: worst(mobileRuns.map((run) => run.firstUsableP95.M)),
    serializeL: worst(runs.map((run) => run.canonicalSerializeLP95)),
    deserializeL: worst(runs.map((run) => run.canonicalDeserializeLP95)),
    incrementalGzipKb: bundle.candidates[engine].engineGzipKb,
    heapMonotonic: runs.some((run) => run.leak.monotonic === true),
  };

  return {
    engine,
    runs,
    gates,
    budgetVerdict: {
      transformDesktop: gates.transformDesktopM <= BUDGETS.transformP95DesktopMs,
      transformMobile: gates.transformMobileM <= BUDGETS.transformP95MobileMs,
      longTask: gates.longTaskMax <= BUDGETS.longTaskMs,
      sceneLoadDesktop: gates.sceneLoadDesktopM <= BUDGETS.sceneLoadDesktopMs,
      sceneLoadMobile: gates.sceneLoadMobileM <= BUDGETS.sceneLoadMobileMs,
      serializeL: gates.serializeL <= BUDGETS.serializeLMs,
      deserializeL: gates.deserializeL <= BUDGETS.deserializeLMs,
      bundle: gates.incrementalGzipKb <= BUDGETS.incrementalGzipKb,
      noHeapGrowth: gates.heapMonotonic === false,
    },
    capabilities: caps.map((entry) => ({
      platform: entry.data.platform,
      project: entry.data.project,
      capabilities: entry.data.capabilities,
      watermark: entry.data.watermark,
      hashAfterLoad: entry.data.serialization.hashAfterLoad,
      crossEngineSubsetHash: entry.data.serialization.crossEngineSubsetHash,
      hashSource: entry.data.serialization.hashSource,
      svgScriptExecuted: entry.data.svgScriptExecuted,
    })),
    mobile: mobile.map((entry) => entry.data),
    bundle: bundle.candidates[engine],
  };
}

function main() {
  const raw = readRaw();
  const bundle = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'results', 'bundle.json'), 'utf8'));
  const summaries = {};
  for (const engine of ENGINES) {
    const summary = summarizeEngine(engine, raw, bundle);
    summaries[engine] = summary;
    writeFileSync(
      join(PACKAGE_ROOT, 'results', `${engine}.summary.json`),
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    );
  }

  const scoring = { weights: WEIGHTS, budgets: BUDGETS, candidates: {} };
  for (const engine of ENGINES) {
    const areas = AREA_SCORES[engine];
    let total = 0;
    const breakdown = {};
    for (const [area, weight] of Object.entries(WEIGHTS)) {
      const points = Math.round(areas[area] * weight * 10) / 10;
      breakdown[area] = { weight, points };
      total += points;
    }
    const verdicts = summaries[engine].budgetVerdict;
    scoring.candidates[engine] = {
      breakdown,
      total: Math.round(total * 10) / 10,
      budgetVerdict: verdicts,
      hardGatePassed: Object.values(verdicts).every(Boolean),
    };
  }
  const ranked = Object.entries(scoring.candidates).sort((a, b) => b[1].total - a[1].total);
  scoring.ranking = ranked.map(([engine, entry]) => ({
    engine,
    total: entry.total,
    hardGatePassed: entry.hardGatePassed,
  }));
  scoring.selected = ranked.find(([, entry]) => entry.hardGatePassed)?.[0] ?? null;
  writeFileSync(
    join(PACKAGE_ROOT, 'results', 'scoring.json'),
    `${JSON.stringify(scoring, null, 2)}\n`,
    'utf8',
  );
  for (const entry of scoring.ranking) {
    console.log(
      `[score] ${entry.engine}: ${String(entry.total)} / 100 — hard gates ${entry.hardGatePassed ? 'PASS' : 'FAIL'}`,
    );
  }
  console.log(`[score] selected: ${String(scoring.selected)}`);
}

main();
