import { NextResponse, type NextRequest } from "next/server";

// Presence check only. Real verification happens in server code with
// verifySessionCookie(cookie, true).
export function proxy(request: NextRequest) {
  if (!request.cookies.has("__session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/portal/:path*"],
};
