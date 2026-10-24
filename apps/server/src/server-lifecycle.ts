interface StoreResource {
  close(): void;
}

export class ServerLifecycle {
  app?: { close(): Promise<unknown> };
  sync?: { close(): Promise<void> };
  loop?: { disable(): boolean };
  private readonly store: StoreResource;
  private released?: Promise<void>;

  constructor(store: StoreResource) {
    this.store = store;
  }

  release(): Promise<void> {
    return (this.released ??= this.releaseRuntime());
  }

  private async releaseRuntime() {
    this.loop?.disable();
    const errors: unknown[] = [];
    try {
      await this.sync?.close();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.store.close();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      throw new AggregateError(errors, 'Server resources could not be released');
    }
  }

  async abort(error: unknown): Promise<never> {
    const errors = new Set([error]);
    try {
      await this.app?.close();
    } catch (cleanupError) {
      errors.add(cleanupError);
    }
    try {
      await this.release();
    } catch (cleanupError) {
      errors.add(cleanupError);
    }
    if (errors.size > 1) {
      throw new AggregateError([...errors], 'Server startup failed and cleanup reported errors');
    }

    throw error;
  }
}
