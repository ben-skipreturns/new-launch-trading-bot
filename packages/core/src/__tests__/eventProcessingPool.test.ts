import { describe, expect, it } from "vitest";
import { EventProcessingPool } from "../index.js";

describe("EventProcessingPool", () => {
  it("keeps tasks for the same key ordered while allowing unrelated keys to run", async () => {
    const events: string[] = [];
    const first = deferred<void>();
    const pool = new EventProcessingPool({ concurrency: 2, maxQueuedEvents: 10 });

    await pool.add("mint-a", async () => {
      events.push("a1:start");
      await first.promise;
      events.push("a1:end");
    });
    await pool.add("mint-a", async () => {
      events.push("a2");
    });
    await pool.add("mint-b", async () => {
      events.push("b1");
    });

    await tick();
    expect(events).toEqual(["a1:start", "b1"]);

    first.resolve();
    await pool.drain();
    expect(events).toEqual(["a1:start", "b1", "a1:end", "a2"]);
  });

  it("waits for active tasks to finish before surfacing a processing failure", async () => {
    const slow = deferred<void>();
    const completed: string[] = [];
    const pool = new EventProcessingPool({ concurrency: 2, maxQueuedEvents: 10 });

    await pool.add("slow", async () => {
      await slow.promise;
      completed.push("slow");
    });
    await pool.add("fail", async () => {
      throw new Error("boom");
    });

    await tick();
    const drain = pool.drain();
    await expect(Promise.race([drain.then(() => "done").catch(() => "failed"), delay(20).then(() => "pending")])).resolves.toBe(
      "pending"
    );

    slow.resolve();
    await expect(drain).rejects.toThrow("boom");
    expect(completed).toEqual(["slow"]);
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function tick(): Promise<void> {
  await delay(0);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
