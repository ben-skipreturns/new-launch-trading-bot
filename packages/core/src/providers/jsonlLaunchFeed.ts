import { createReadStream } from "node:fs";
import { createInterface } from "node:readline/promises";
import type { LaunchFeed } from "../domain/interfaces.js";
import type { LaunchEvent } from "../domain/types.js";
import { normalizePumpApiEvent } from "../normalizers/pumpApi.js";

export class JsonlLaunchFeed implements LaunchFeed {
  readonly name = "jsonl";

  constructor(private readonly filePath: string) {}

  async *stream(signal?: AbortSignal): AsyncIterable<LaunchEvent> {
    const lines = createInterface({
      input: createReadStream(this.filePath, { encoding: "utf8" }),
      crlfDelay: Infinity
    });

    for await (const line of lines) {
      if (signal?.aborted) break;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const event = normalizePumpApiEvent(JSON.parse(trimmed));
      if (event) yield event;
    }
  }
}
