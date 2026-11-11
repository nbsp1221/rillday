import { ServerRequestError } from './server-transport.ts';

const checkInterval = 60_000;

export class SessionActivity {
  private attempt: { at: number; controller: AbortController } | undefined;

  reset() {
    this.attempt?.controller.abort();
    this.attempt = undefined;
  }

  async check(renew: (signal: AbortSignal) => Promise<boolean>, requireAuthentication: () => void) {
    const at = performance.now();
    if (this.attempt && at - this.attempt.at < checkInterval) {
      return;
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
    this.attempt = { at, controller };
    try {
      const active = await renew(signal);
      signal.throwIfAborted();
      if (!active) {
        requireAuthentication();
      }
    } catch (error) {
      if (!signal.aborted && error instanceof ServerRequestError && error.status === 401) {
        requireAuthentication();
      }
      // A temporary failure leaves the local workspace and credentials intact.
    }
  }
}
