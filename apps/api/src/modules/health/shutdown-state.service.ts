/**
 * Whether this process has begun terminating (`APP12-H04-C1` §4).
 *
 * The readiness probe's job is to answer "should this instance receive new
 * traffic". Between `SIGTERM` and the last in-flight response the honest answer
 * is **no**, but the probe could not say so: it asked the database, the database
 * was fine, and it kept reporting `ready` right up until the socket closed.
 *
 * `APP12-H04` measured the consequence — three connection resets per replica
 * roll, because the Gateway was still being told this pod was a valid upstream
 * while the process was closing it. The `preStop` delay in the Deployment is
 * what actually buys the endpoint removal time to propagate; this is the second
 * half of the same sequence, and it is the half that makes the *probe* tell the
 * truth rather than relying on timing alone.
 *
 * It lives in the health module because the health controller is its only
 * consumer (`CLAUDE.md` §5 — the narrowest valid scope). It is deliberately not
 * a general "app state" service: it has one boolean, set once, in one direction.
 */
import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class ShutdownStateService implements OnApplicationShutdown {
  private terminating = false;

  /**
   * Nest calls this on `SIGTERM`/`SIGINT` because `main.ts` enables shutdown
   * hooks. It only ever moves false -> true: a process that has started
   * draining never becomes a valid traffic target again.
   */
  onApplicationShutdown(): void {
    this.terminating = true;
  }

  /** True once termination has begun. */
  get isTerminating(): boolean {
    return this.terminating;
  }
}
