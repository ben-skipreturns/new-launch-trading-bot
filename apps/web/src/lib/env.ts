import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

let loaded = false;

export function loadWorkspaceEnv(): void {
  if (loaded) return;
  loaded = true;

  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../.env"),
    resolve(process.cwd(), "../../.env")
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      config({ path, override: false });
      return;
    }
  }
}
