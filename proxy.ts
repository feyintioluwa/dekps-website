import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  updateSession,
} from "@/lib/supabase/proxy";

const PROTECTED_ROUTES = [
  "/upload",
  "/analysis",
  "/results",
  "/fix",
  "/preview",
  "/upgrade",
];

function isProtectedRoute(
  pathname: string
) {
  return PROTECTED_ROUTES.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(
        `${route}/`
      )
  );
}

function copyResponseCookies(
  source: NextResponse,
  target: NextResponse
) {
  source.cookies
    .getAll()
    .forEach(
      (cookie) => {
        target.cookies.set(
          cookie
        );
      }
    );

  return target;
}

export async function proxy(
  request: NextRequest
) {
  /*
   * First let Supabase refresh the user's
   * authentication cookies when necessary.
   */
  const sessionResponse =
    await updateSession(
      request
    );

  const pathname =
    request.nextUrl.pathname;

  /*
   * Public pages do not need an additional
   * authentication lookup.
   */
  if (
    !isProtectedRoute(
      pathname
    )
  ) {
    return sessionResponse;
  }

  /*
   * Read the refreshed cookies from the request
   * and verify the authenticated Supabase user.
   */
  const supabase =
    createServerClient(
      process.env
        .NEXT_PUBLIC_SUPABASE_URL!,
      process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            /*
             * Cookie refreshing is already handled
             * by updateSession() above.
             */
          },
        },
      }
    );

  const {
    data: {
      user,
    },
    error,
  } =
    await supabase.auth.getUser();

  /*
   * Signed-out visitors cannot directly access
   * CVCommit application pages.
   */
  if (
    error ||
    !user
  ) {
    const loginUrl =
      request.nextUrl.clone();

    loginUrl.pathname =
      "/login";

    /*
     * Preserve the page they originally wanted.
     * Login can return them there afterward.
     */
    loginUrl.searchParams.set(
      "next",
      `${pathname}${request.nextUrl.search}`
    );

    const redirectResponse =
      NextResponse.redirect(
        loginUrl
      );

    return copyResponseCookies(
      sessionResponse,
      redirectResponse
    );
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
