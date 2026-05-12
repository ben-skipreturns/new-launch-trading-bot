import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const token = process.env.DASHBOARD_AUTH_TOKEN;
  const authDisabled = process.env.NODE_ENV === "development" && process.env.DASHBOARD_AUTH_DISABLED === "true";
  if (!token) {
    if (authDisabled) return withSecurityHeaders(NextResponse.next());
    return withSecurityHeaders(new NextResponse("Dashboard authentication is not configured", { status: 503 }));
  }

  const authorization = request.headers.get("authorization");
  if (isAuthorized(authorization, token)) return withSecurityHeaders(NextResponse.next());

  return withSecurityHeaders(
    new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Moonshot Command Center"'
      }
    })
  );
}

function isAuthorized(authorization: string | null, token: string): boolean {
  if (!authorization) return false;
  if (authorization === `Bearer ${token}`) return true;
  if (!authorization.startsWith("Basic ")) return false;

  try {
    const decoded = atob(authorization.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    const password = separator >= 0 ? decoded.slice(separator + 1) : "";
    return password === token;
  } catch {
    return false;
  }
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
