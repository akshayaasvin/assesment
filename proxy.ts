import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminUid } from "@/lib/auth/admin-uid";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Resolves the current Supabase user for the request, or `null` if there is
 * no session - or if anything goes wrong (missing env vars, a network blip
 * talking to Supabase, etc). Auth failures must never crash the proxy;
 * worst case we fall back to "not signed in" and let the login page handle it.
 */
async function getUserSafely(request: NextRequest, response: { current: NextResponse }) {
  try {
    const { url, publishableKey } = getSupabasePublicEnv();
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response.current = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.current.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Scope everything below to /admin - candidate routes, static assets and
  // Next.js internals never reach this file at all (see matcher).
  const response = { current: NextResponse.next({ request }) };
  const user = await getUserSafely(request, response);

  // Only page navigations get redirected. Server Actions are POSTs to the page
  // they're used on, and a redirect response to one isn't a valid action
  // response - the client throws "An unexpected response was received from
  // the server" and the action never runs. (That's what used to break login:
  // verifyAdminSession() POSTs to /admin/login right after sign-in, and got
  // redirected to the dashboard.) Every admin Server Action authorizes itself
  // via requireAdmin(), so letting non-GET requests through is safe.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return response.current;
  }

  const authorized = isAdminUid(user?.id);
  const isLoginRoute = pathname === "/admin/login";

  if (isLoginRoute) {
    // Always publicly reachable so an unauthenticated (or wrong-account)
    // admin can get to the sign-in form; only bounce away once already
    // signed in as the one authorized admin.
    return authorized ? NextResponse.redirect(new URL("/admin/dashboard", request.url)) : response.current;
  }

  if (!authorized) {
    const redirectUrl = new URL("/admin/login", request.url);
    if (user) redirectUrl.searchParams.set("error", "unauthorized");
    else redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/admin") {
    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }

  return response.current;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
