import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

describe("dashboard proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed outside development when no auth token is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    vi.stubEnv("DASHBOARD_AUTH_DISABLED", "");

    const response = proxy(request());

    expect(response.status).toBe(503);
  });

  it("does not honor the auth disabled flag outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    vi.stubEnv("DASHBOARD_AUTH_DISABLED", "true");

    const response = proxy(request());

    expect(response.status).toBe(503);
  });

  it("allows explicit local auth bypass in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    vi.stubEnv("DASHBOARD_AUTH_DISABLED", "true");

    const response = proxy(request());

    expect(response.status).toBe(200);
  });

  it("accepts bearer auth with the configured dashboard token", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret");

    const response = proxy(request({ authorization: "Bearer secret" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("accepts basic auth when the token contains colon characters", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret:with:colons");

    const credentials = btoa("operator:secret:with:colons");
    const response = proxy(request({ authorization: `Basic ${credentials}` }));

    expect(response.status).toBe(200);
  });

  it("rejects missing or wrong credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret");

    expect(proxy(request()).status).toBe(401);
    expect(proxy(request({ authorization: "Bearer wrong" })).status).toBe(401);
  });
});

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://dashboard.example.test/", { headers });
}
