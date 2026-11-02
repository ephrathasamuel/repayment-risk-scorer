import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:8000";
const SESSION_COOKIE = "scorer_session";

// Forwards /api/* to the FastAPI service (read at request time, so one image works anywhere),
// and sends visitors without a session to the sign-in page. The API checks every request itself.
export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.rewrite(new URL(pathname + search, API_URL));
  }
  if (pathname !== "/login" && !request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
