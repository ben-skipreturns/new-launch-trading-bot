import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const token = process.env.DASHBOARD_AUTH_TOKEN;
  const authDisabled = process.env.NODE_ENV === "development" && process.env.DASHBOARD_AUTH_DISABLED === "true";
  if (!token) {
    if (authDisabled) return NextResponse.next();
    return new NextResponse("Dashboard authentication is not configured", { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (isAuthorized(authorization, token)) return NextResponse.next();

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Moonshot Command Center"'
    }
  });
}

function isAuthorized(authorization: string | null, token: string): boolean {
  if (!authorization) return false;
  if (authorization === `Bearer ${token}`) return true;
  if (!authorization.startsWith("Basic ")) return false;

  try {
    const decoded = atob(authorization.slice("Basic ".length));
    const [, password] = decoded.split(":", 2);
    return password === token;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
