import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(
  request: NextRequest
) {
  let supabaseResponse =
    NextResponse.next({
      request,
    });

  const supabase =
    createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(
            cookiesToSet,
            responseHeaders
          ) {
            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value
                );
              }
            );

            supabaseResponse =
              NextResponse.next({
                request,
              });

            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                supabaseResponse.cookies.set(
                  name,
                  value,
                  options
                );
              }
            );

            if (responseHeaders) {
              Object.entries(
                responseHeaders
              ).forEach(
                ([
                  name,
                  value,
                ]) => {
                  supabaseResponse.headers.set(
                    name,
                    value
                  );
                }
              );
            }
          },
        },
      }
    );

  /*
   * IMPORTANT:
   * getClaims() verifies the JWT and also allows
   * Supabase to refresh an expired session.
   *
   * Do not replace this with getSession()
   * for authorization.
   */
  await supabase.auth.getClaims();

  return supabaseResponse;
}