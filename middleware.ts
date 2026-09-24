import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Resolves the current Supabase user for the request, or `null` if there is
 * no session - or if anything goes wrong (missing env vars, a network blip
 * talking to Supabase, etc). Auth failures must never crash the middleware;
 * worst case we fall back to "not signed in" and let the login page handle it.
 */
async function getUserSafely(request: NextRequest, response: { current: NextResponse }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Scope everything below to /admin - candidate routes, static assets and
  // Next.js internals never reach this file at all (see matcher).
  const response = { current: NextResponse.next({ request }) };
  const user = await getUserSafely(request, response);

  const isLoginRoute = pathname === "/admin/login";

  if (!isLoginRoute && !user) {
    const redirectUrl = new URL("/admin/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isLoginRoute && user) {
    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }

  if (pathname === "/admin" && user) {
    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }

  return response.current;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
