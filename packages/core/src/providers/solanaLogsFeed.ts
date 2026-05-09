import WebSocket from "ws";
import type { LaunchFeed } from "../domain/interfaces.js";
import type { JsonValue, LaunchEvent } from "../domain/types.js";

export interface SolanaLogsFeedOptions {
  endpoint: string;
  mentions: string[];
  parser: (notification: JsonValue) => LaunchEvent | null;
}

export class SolanaLogsFeed implements LaunchFeed {
  readonly name = "solana-logs";

  constructor(private readonly options: SolanaLogsFeedOptions) {}

  async *stream(signal?: AbortSignal): AsyncIterable<LaunchEvent> {
    const queue: LaunchEvent[] = [];
    const waiters: Array<() => void> = [];
    let id = 1;
    let done = false;
    let error: Error | undefined;
    const notify = () => waiters.splice(0).forEach((resolve) => resolve());
    const ws = new WebSocket(this.options.endpoint);

    ws.on("open", () => {
      for (const mention of this.options.mentions) {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: id++,
            method: "logsSubscribe",
            params: [{ mentions: [mention] }, { commitment: "processed" }]
          })
        );
      }
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as JsonValue;
        const event = this.options.parser(message);
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
