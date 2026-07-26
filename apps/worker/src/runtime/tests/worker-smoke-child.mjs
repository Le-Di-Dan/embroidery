/**
 * Smoke child: runs the real compiled worker entry point, then asks it to shut
 * down (APP2-I02 §17 "Real worker smoke").
 *
 * A separate OS process on purpose — the point of this test is the *process*:
 * its bootstrap, its signal handling, its exit. Booting the Nest context inside
 * Jest would prove none of that.
 *
 * `process.emit` rather than an OS signal because Windows has no real SIGTERM:
 * `child.kill('SIGTERM')` there calls `TerminateProcess`, which kills without
 * ever running the handler, so an OS-signal test would silently prove nothing
 * on the development platform. Emitting invokes the exact listener Nest
 * registered, which is the behaviour under test. The parent spec records this
 * limitation.
 */
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const [, , mainPath, bootMsRaw] = process.argv;
const bootMs = Number(bootMsRaw ?? '2000');

await import(pathToFileURL(mainPath).href);

// Two samples, many poll cycles apart. A runtime that leaked a handle per
// cycle — an un-cleared timeout, an un-released connection — would show growth
// between them; a single snapshot could not tell a leak from normal state.
await delay(500);
console.log(`SMOKE_RESOURCES_EARLY ${JSON.stringify(process.getActiveResourcesInfo())}`);

await delay(bootMs);
console.log(`SMOKE_RESOURCES_LATE ${JSON.stringify(process.getActiveResourcesInfo())}`);
console.log('SMOKE_BOOTED');

// The signal name is passed explicitly: a bare `process.emit('SIGTERM')` calls
// the listener with `undefined`, where a real signal supplies its own name.
process.emit('SIGTERM', 'SIGTERM');
