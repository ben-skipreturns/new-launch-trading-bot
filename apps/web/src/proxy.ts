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
  const separator = authorization.indexOf(" ");
  const scheme = separator >= 0 ? authorization.slice(0, separator).toLowerCase() : "";
  const credentials = separator >= 0 ? authorization.slice(separator + 1) : "";
  if (scheme === "bearer") return credentials === token;
  if (scheme !== "basic") return false;

  try {
    const decoded = atob(credentials);
    const credentialSeparator = decoded.indexOf(":");
    const password = credentialSeparator >= 0 ? decoded.slice(credentialSeparator + 1) : "";
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
