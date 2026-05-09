import WebSocket from "ws";
import type { LaunchFeed } from "../domain/interfaces.js";
import type { LaunchEvent } from "../domain/types.js";
import { normalizePumpApiEvent } from "../normalizers/pumpApi.js";

export class PumpApiLaunchFeed implements LaunchFeed {
  readonly name = "pumpapi";

  constructor(private readonly url = process.env.PUMPAPI_STREAM_URL ?? "wss://stream.pumpapi.io/") {}

  async *stream(signal?: AbortSignal): AsyncIterable<LaunchEvent> {
    const queue: LaunchEvent[] = [];
    let done = false;
    let error: Error | undefined;
    const waiters: Array<() => void> = [];
    const notify = () => waiters.splice(0).forEach((resolve) => resolve());
    const ws = new WebSocket(this.url);

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        const event = normalizePumpApiEvent(parsed);
        if (event) queue.push(event);
        notify();
      } catch (cause) {
        error = cause instanceof Error ? cause : new Error(String(cause));
        notify();
      }
    });
    ws.on("error", (cause) => {
      error = cause instanceof Error ? cause : new Error(String(cause));
      notify();
    });
    ws.on("close", () => {
      done = true;
      notify();
    });
    signal?.addEventListener("abort", () => ws.close());

    while (!done || queue.length > 0) {
      if (error) throw error;
      const next = queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
  }
}
