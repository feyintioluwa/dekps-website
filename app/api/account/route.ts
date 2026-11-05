import { createAdminClient } from "@/lib/supabase/admin";
import {
  NextResponse,
} from "next/server";

import {
  getCareerOSCVAccess,
  getCareerOSServerAccess,
} from "@/lib/access/server-access";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: Request
) {
  try {
    const url =
      new URL(
        request.url
      );

    const cvHash =
      url.searchParams
        .get(
          "cvHash"
        )
        ?.trim() ?? "";

    /*
     * ---------------------------------------------------------
     * CV-SPECIFIC ACCESS CHECK
     * ---------------------------------------------------------
     *
     * When a CV hash is provided, return the normal
     * account information plus entitlement data for
     * that exact CV.
     *
     * Existing account-only callers can continue using
     * /api/account without any query parameters.
     */
    if (cvHash) {
      const access =
        await getCareerOSCVAccess(
          cvHash
        );

      let freeFixAvailable = false;
      let freeDownloadAvailable = false;
      if (access.authenticated && access.userId && !access.hasPaidAccess) {
        const { data, error } = await createAdminClient().from("free_cv_usage")
          .select("fix_count,download_count").eq("user_id", access.userId)
          .eq("cv_hash", cvHash).maybeSingle();
        if (!error) {
          freeFixAvailable = (data?.fix_count ?? 0) < 1;
          freeDownloadAvailable = (data?.download_count ?? 0) < 1;
        }
      }
      return NextResponse.json(
        {
          canFix: access.hasPaidAccess || freeFixAvailable,
          canDownload: access.hasPaidAccess || freeDownloadAvailable,
          success: true,
          authenticated:
            access.authenticated,
          user:
            access.authenticated
              ? {
                  id:
                    access.userId,
                  email:
                    access.email,
                }
              : null,
          plan:
            access.plan,
          cvHash:
            access.cvHash,
          cvUnlocked:
            access.cvUnlocked,
          hasPaidAccess:
            access.hasPaidAccess,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * EXISTING ACCOUNT ACCESS CHECK
     * ---------------------------------------------------------
     */

    const access =
      await getCareerOSServerAccess();

    return NextResponse.json(
      {
        success: true,
        authenticated:
          access.authenticated,
        user:
          access.authenticated
            ? {
                id:
                  access.userId,
                email:
                  access.email,
              }
            : null,
        plan:
          access.plan,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "CVCommit account API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        user: null,
        plan: "free",
        cvHash: null,
        cvUnlocked: false,
        hasPaidAccess: false,
        error:
          "CVCommit could not load your account.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}
