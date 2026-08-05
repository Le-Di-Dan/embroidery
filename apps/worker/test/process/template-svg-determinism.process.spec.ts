/**
 * `APP3-W01B` determinism across process and platform boundaries (`IMP-D047`
 * PO-13, directive §13/§14).
 *
 * Repeating a pure function inside one Jest process proves very little: the
 * module graph is already loaded, the JIT is warm, and any accidental
 * module-level state is shared by every repetition. The properties that matter
 * are the ones a *fresh* process can disagree about — hash-map iteration order,
 * locale-sensitive comparison, a cached window, a `Math.random` seed — so each
 * repetition here is a new Node process, and one of them is a new Node process
 * on Alpine Linux running the production image.
 *
 * The container run is also the supply-chain proof: it is the only place that
 * shows `jsdom@29.1.1` actually loads under the locked `node:22.14.0`. That was
 * the whole reason `IMP-D047` refused jsdom 30, whose `engines.node` the locked
 * runtime does not satisfy.
 *
 * Runs from its own indexed command: it needs `dist/` and a Docker daemon, so
 * the Docker-free `pnpm test` excludes every `*.process.spec.ts`.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const WORKER_DIR = path.join(REPO_ROOT, 'apps', 'worker');
const IMAGE_TAG = 'embroidery-w01b-worker:test';
const SANITIZER = './dist/jobs/asset-normalization/application/template-svg-sanitizer.js';

const NS = 'http://www.w3.org/2000/svg';

/**
 * The corpus every process runs. Chosen to exercise the parts most likely to
 * differ between processes: attribute ordering, number formatting, path
 * canonicalization and the rejection path.
 */
const CORPUS: readonly string[] = [
  `<svg xmlns="${NS}" viewBox="0 0 320 240"><g transform="translate(1,2)"><path d="M0 0L10 10 20 0Z" fill="#F00"/><rect x="0" y="0" width="8" height="8"/></g></svg>`,
  `<svg xmlns="${NS}" viewBox="0 0 4096 4096"><polygon points="0,0 10,0 10,10" stroke="rgb(0 128 255 / 0.5)" stroke-dasharray="4,2"/></svg>`,
  `<svg xmlns="${NS}" viewBox="0 0 10 10"><path d="M0 0a1 1 0 011 1" stroke-width="1.500000" opacity="1.0"/></svg>`,
  `<svg xmlns="${NS}" viewBox="0 0 10 10"><script>alert(1)</script></svg>`,
];

/**
 * The snippet each process runs. Written as one line of source rather than a
 * fixture file so nothing test-shaped is ever compiled into `dist/` — the
 * production image must contain the worker and nothing else.
 */
const SNIPPET = `
const { sanitizeTemplateSvg } = require(${JSON.stringify(SANITIZER)});
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const deps = JSON.parse(readFileSync('./package.json', 'utf8')).dependencies;
const corpus = ${JSON.stringify(CORPUS)};
const results = corpus.map((text) => {
  const out = sanitizeTemplateSvg(Buffer.from(text, 'utf8'));
  if (out === undefined) return { outcome: 'REJECTED' };
  return {
    outcome: 'NORMALIZED',
    sha256: createHash('sha256').update(out.bytes).digest('hex'),
    byteSize: out.bytes.length,
    widthPx: out.widthPx,
    heightPx: out.heightPx,
  };
});
process.stdout.write(JSON.stringify({
  node: process.version,
  jsdom: deps.jsdom,
  dompurify: deps.dompurify,
  results,
}));
`;

interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

interface Report {
  readonly node: string;
  readonly jsdom: string;
  readonly dompurify: string;
  readonly results: readonly { outcome: string; sha256?: string; byteSize?: number }[];
}

function parse(result: RunResult): Report {
  if (result.code !== 0) {
    throw new Error(`sanitizer process exited ${String(result.code)}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as Report;
}

describe('Template SVG determinism across processes and platforms', () => {
  beforeAll(() => {
    if (!existsSync(path.join(WORKER_DIR, 'dist'))) {
      throw new Error('apps/worker/dist is missing; run the worker build before this suite');
    }
  });

  let hostReport: Report;

  it('produces the same bytes in five fresh host processes', async () => {
    const reports: Report[] = [];
    for (let run_ = 0; run_ < 5; run_ += 1) {
      reports.push(parse(await run(process.execPath, ['-e', SNIPPET], WORKER_DIR)));
    }

    hostReport = reports[0] as Report;
    for (const report of reports) {
      expect(report.results).toEqual(hostReport.results);
    }
    // Three accepted files and one refused, so the corpus proves both halves.
    expect(hostReport.results.map((entry) => entry.outcome)).toEqual([
      'NORMALIZED',
      'NORMALIZED',
      'NORMALIZED',
      'REJECTED',
    ]);
    expect(new Set(hostReport.results.map((entry) => entry.sha256)).size).toBe(4);
  }, 300_000);

  it('loads the exact pinned dependencies under the locked Node in the production image', async () => {
    const build = await run(
      'docker',
      [
        'build',
        '-f',
        'infrastructure/docker/worker.Dockerfile',
        '--target',
        'runner',
        '-t',
        IMAGE_TAG,
        '.',
      ],
      REPO_ROOT,
    );
    expect(build.code).toBe(0);

    const report = parse(
      await run(
        'docker',
        ['run', '--rm', '--entrypoint', 'node', IMAGE_TAG, '-e', SNIPPET],
        REPO_ROOT,
      ),
    );

    // The finding that decided IMP-D047: jsdom 30 declares an `engines.node`
    // this image does not satisfy. Asserting the version *and* that it ran is
    // what would catch a later bump that only fails inside the container.
    expect(report.node).toBe('v22.14.0');
    expect(report.jsdom).toBe('29.1.1');
    expect(report.dompurify).toBe('3.4.13');
  }, 1_800_000);

  it('produces byte-identical output on Alpine Linux and on the host platform', async () => {
    const report = parse(
      await run(
        'docker',
        ['run', '--rm', '--entrypoint', 'node', IMAGE_TAG, '-e', SNIPPET],
        REPO_ROOT,
      ),
    );
    expect(report.results).toEqual(hostReport.results);
  }, 600_000);
});
