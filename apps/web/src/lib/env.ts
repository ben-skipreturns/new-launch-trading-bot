import "server-only";

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

let loaded = false;

export function loadWorkspaceEnv(): void {
  if (process.env.NODE_ENV === "production") return;
  if (loaded) return;
  loaded = true;

  const candidates = [
    resolve(/* turbopackIgnore: true */ process.cwd(), ".env"),
    resolve(/* turbopackIgnore: true */ process.cwd(), "../.env"),
    resolve(/* turbopackIgnore: true */ process.cwd(), "../../.env")
  ];

  for (const path of candidates) {
    if (existsSync(/* turbopackIgnore: true */ path)) {
      config({ path: /* turbopackIgnore: true */ path, override: false });
      return;
    }
  }
}
