import WebSocket from "ws";
import type { LaunchFeed } from "../domain/interfaces.js";
import type { LaunchEvent } from "../domain/types.js";
import { normalizePumpApiEvent } from "../normalizers/pumpApi.js";

export type PumpApiStreamStatusType = "connected" | "disconnected" | "reconnecting" | "stale" | "error";

export interface PumpApiStreamStatusEvent {
  type: PumpApiStreamStatusType;
  at: Date;
  attempt?: number;
  delayMs?: number;
  lastEventAt?: Date;
  errorText?: string;
}

export interface PumpApiLaunchFeedOptions {
  url?: string;
  reconnect?: boolean;
  maxReconnects?: number;
  initialReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  staleTimeoutMs?: number;
  onStatus?: (event: PumpApiStreamStatusEvent) => void;
}

interface QueueItem {
  event?: LaunchEvent;
  closed?: boolean;
}

const defaultUrl = "wss://stream.pumpapi.io/";

export class PumpApiLaunchFeed implements LaunchFeed {
  readonly name = "pumpapi";
  private readonly url: string;
  private readonly reconnect: boolean;
  private readonly maxReconnects: number;
  private readonly initialReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly staleTimeoutMs: number;
  private readonly onStatus?: (event: PumpApiStreamStatusEvent) => void;

  constructor(urlOrOptions: string | PumpApiLaunchFeedOptions = process.env.PUMPAPI_STREAM_URL ?? defaultUrl) {
    const options: PumpApiLaunchFeedOptions = typeof urlOrOptions === "string" ? { url: urlOrOptions } : urlOrOptions;
    this.url = options.url ?? process.env.PUMPAPI_STREAM_URL ?? defaultUrl;
    this.reconnect = options.reconnect ?? true;
    this.maxReconnects = options.maxReconnects ?? 20;
    this.initialReconnectDelayMs = options.initialReconnectDelayMs ?? 1_000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 30_000;
    this.staleTimeoutMs = options.staleTimeoutMs ?? 30_000;
    this.onStatus = options.onStatus;
  }

  async *stream(signal?: AbortSignal): AsyncIterable<LaunchEvent> {
    let attempt = 0;
    let lastEventAt: Date | undefined;

    while (!signal?.aborted) {
      const queue: QueueItem[] = [];
      const waiters: Array<() => void> = [];
      const notify = () => waiters.splice(0).forEach((resolve) => resolve());
      let ws: WebSocket | undefined;
      let staleEmitted = false;
      let lastMessageReceivedAt = Date.now();
      let latestSocketError: Error | undefined;

      const pushClosed = () => {
        queue.push({ closed: true });
        notify();
      };

      try {
        ws = new WebSocket(this.url);
        const socket = ws;
        const abort = () => socket.close();
        signal?.addEventListener("abort", abort, { once: true });

        socket.on("open", () => {
          staleEmitted = false;
          lastMessageReceivedAt = Date.now();
          this.emitStatus({ type: "connected", at: new Date(), attempt });
        });
        socket.on("message", (data) => {
          lastMessageReceivedAt = Date.now();
          try {
            const parsed = JSON.parse(data.toString());
            const event = normalizePumpApiEvent(parsed);
            if (event) {
              lastEventAt = event.timestamp;
              queue.push({ event });
            }
          } catch (cause) {
            const error = cause instanceof Error ? cause : new Error(String(cause));
            this.emitStatus({ type: "error", at: new Date(), attempt, errorText: error.message, lastEventAt });
          } finally {
            notify();
          }
        });
        socket.on("error", (cause) => {
          latestSocketError = cause instanceof Error ? cause : new Error(String(cause));
          this.emitStatus({ type: "error", at: new Date(), attempt, errorText: latestSocketError.message, lastEventAt });
        });
        socket.on("close", () => {
          this.emitStatus({
            type: "disconnected",
            at: new Date(),
            attempt,
            errorText: latestSocketError?.message,
            lastEventAt
          });
          pushClosed();
        });

        const staleTimer = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN || staleEmitted) return;
          const ageMs = Date.now() - lastMessageReceivedAt;
          if (ageMs < this.staleTimeoutMs) return;
          staleEmitted = true;
          this.emitStatus({ type: "stale", at: new Date(), attempt, lastEventAt });
          socket.close();
        }, Math.max(1_000, Math.min(this.staleTimeoutMs, 10_000)));

        try {
          while (!signal?.aborted) {
            const next = queue.shift();
            if (next?.event) {
              yield next.event;
              continue;
            }
            if (next?.closed) break;
            await new Promise<void>((resolve) => waiters.push(resolve));
          }
        } finally {
          clearInterval(staleTimer);
          signal?.removeEventListener("abort", abort);
          if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) socket.close();
        }
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        latestSocketError = error;
        this.emitStatus({ type: "error", at: new Date(), attempt, errorText: error.message, lastEventAt });
      }

      const reconnectsExhausted = attempt >= this.maxReconnects;
      if (signal?.aborted || !this.reconnect || reconnectsExhausted) {
        if (!signal?.aborted && latestSocketError && (!this.reconnect || reconnectsExhausted)) throw latestSocketError;
        break;
      }

      attempt += 1;
      const delayMs = Math.min(this.maxReconnectDelayMs, this.initialReconnectDelayMs * 2 ** Math.max(0, attempt - 1));
      this.emitStatus({ type: "reconnecting", at: new Date(), attempt, delayMs, lastEventAt });
      await sleep(delayMs, signal);
    }
  }

  private emitStatus(event: PumpApiStreamStatusEvent): void {
    this.onStatus?.(event);
  }
}

async function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0 || signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}
