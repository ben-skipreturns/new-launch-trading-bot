export interface EventProcessingMetrics {
  active: number;
  queued: number;
  concurrency: number;
  maxQueuedEvents: number;
  oldestQueuedMs: number;
}

export interface EventProcessingPoolOptions {
  concurrency: number;
  maxQueuedEvents: number;
  onFailure?: (error: unknown) => void;
  onMetrics?: (metrics: EventProcessingMetrics) => void;
}

interface QueuedEventTask {
  key: string;
  enqueuedAt: number;
  run: () => Promise<unknown>;
}

export class EventProcessingPool {
  private readonly concurrency: number;
  private readonly maxQueuedEvents: number;
  private readonly onFailure?: (error: unknown) => void;
  private readonly onMetrics?: (metrics: EventProcessingMetrics) => void;
  private readonly pending: QueuedEventTask[] = [];
  private readonly activeKeys = new Set<string>();
  private readonly capacityWaiters: Array<() => void> = [];
  private readonly idleWaiters: Array<() => void> = [];
  private active = 0;
  private failure: unknown;

  constructor(options: EventProcessingPoolOptions) {
    this.concurrency = Math.max(1, options.concurrency);
    this.maxQueuedEvents = Math.max(1, options.maxQueuedEvents);
    this.onFailure = options.onFailure;
    this.onMetrics = options.onMetrics;
  }

  async add(key: string, run: () => Promise<unknown>): Promise<void> {
    this.throwIfFailed();
    while (this.pending.length >= this.maxQueuedEvents) {
      await new Promise<void>((resolve) => this.capacityWaiters.push(resolve));
      this.throwIfFailed();
    }
    this.pending.push({ key, run, enqueuedAt: Date.now() });
    this.emitMetrics();
    this.pump();
  }

  async drain(): Promise<void> {
    await this.waitForIdle();
    this.throwIfFailed();
  }

  async waitForIdle(): Promise<void> {
    while (this.pending.length > 0 || this.active > 0) {
      await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
    }
  }

  getFailure(): unknown {
    return this.failure;
  }

  private pump(): void {
    while (!this.failure && this.active < this.concurrency) {
      const index = this.pending.findIndex((task) => !this.activeKeys.has(task.key));
      if (index < 0) break;
      const [task] = this.pending.splice(index, 1);
      if (!task) break;
      this.active += 1;
      this.activeKeys.add(task.key);
      this.emitMetrics();
      void Promise.resolve()
        .then(task.run)
        .catch((error) => this.fail(error))
        .finally(() => {
          this.active -= 1;
          this.activeKeys.delete(task.key);
          if (this.failure) this.pending.splice(0);
          this.resolveCapacityWaiters();
          this.emitMetrics();
          this.pump();
          this.resolveIdleWaitersIfIdle();
        });
    }
  }

  private fail(error: unknown): void {
    if (this.failure) return;
    this.failure = error;
    this.pending.splice(0);
    this.resolveCapacityWaiters();
    this.onFailure?.(error);
  }

  private throwIfFailed(): void {
    if (this.failure) throw this.failure;
  }

  private resolveCapacityWaiters(): void {
    this.capacityWaiters.splice(0).forEach((resolve) => resolve());
  }

  private resolveIdleWaitersIfIdle(): void {
    if (this.pending.length > 0 || this.active > 0) return;
    this.idleWaiters.splice(0).forEach((resolve) => resolve());
  }

  private emitMetrics(): void {
    const oldestQueuedMs = this.pending.length > 0 ? Date.now() - Math.min(...this.pending.map((task) => task.enqueuedAt)) : 0;
    this.onMetrics?.({
      active: this.active,
      queued: this.pending.length,
      concurrency: this.concurrency,
      maxQueuedEvents: this.maxQueuedEvents,
      oldestQueuedMs
    });
  }
}
