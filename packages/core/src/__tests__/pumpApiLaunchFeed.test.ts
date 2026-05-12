import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { parsePumpApiMessage, PumpApiLaunchFeed, type PumpApiStreamStatusType } from "../providers/pumpApiLaunchFeed.js";

describe("parsePumpApiMessage", () => {
  it("returns parser rejects for invalid JSON and unsupported payloads", () => {
    const invalidJson = parsePumpApiMessage("{bad-json");
    const unsupported = parsePumpApiMessage(JSON.stringify({ signature: "sig-comment", txType: "comment", mint: "MintIgnored111" }));

    expect(invalidJson.reject?.reason).toBe("invalid_json");
    expect(invalidJson.reject?.payloadText).toContain("{bad-json");
    expect(unsupported.reject?.reason).toBe("unsupported_or_invalid_payload");
    expect(unsupported.reject?.payload).toMatchObject({ signature: "sig-comment" });
  });

  it("returns valid launch events after rejected payloads", () => {
    const parsed = parsePumpApiMessage(
      JSON.stringify({
        signature: "sig-create",
        txType: "create",
        mint: "Mint111",
        txSigner: "Creator111",
        timestamp: "2026-05-08T12:00:00.000Z",
        name: "Moon",
        symbol: "MOON"
      })
    );

    expect(parsed.reject).toBeUndefined();
    expect(parsed.event?.tokenLaunch?.mint).toBe("Mint111");
  });

  it("reports queue overflow instead of silently dropping launches", async () => {
    let socket: FakeSocket | undefined;
    const statuses: PumpApiStreamStatusType[] = [];
    const feed = new PumpApiLaunchFeed({
      url: "ws://pumpapi.test",
      webSocketFactory: () => {
        socket = new FakeSocket();
        return socket as unknown as WebSocket;
      },
      reconnect: false,
      maxQueueSize: 1,
      onStatus: (event) => statuses.push(event.type)
    });

    const events: string[] = [];
    const run = (async () => {
      for await (const event of feed.stream()) events.push(event.signature);
    })();

    await tick();
    socket?.open();
    for (let index = 0; index < 10; index += 1) {
      socket?.message(
        JSON.stringify({
          signature: `sig-create-${index}`,
          txType: "create",
          mint: `MintOverflow${index}`,
          txSigner: "Creator111",
          timestamp: "2026-05-08T12:00:00.000Z",
          name: "Overflow",
          symbol: "FLOW"
        })
      );
    }

    await expect(run).rejects.toThrow(/queue exceeded/);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(statuses).toContain("queue_overflow");
  });
});

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING;

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.emit("open");
  }

  message(payload: string): void {
    if (this.readyState === WebSocket.OPEN) this.emit("message", Buffer.from(payload));
  }

  close(): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
