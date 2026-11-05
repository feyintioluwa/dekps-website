import { createAdminClient } from "@/lib/supabase/admin";
import type { CareerOSCVAccess } from "@/lib/access/server-access";

/*
 * Usage limits for one paid CV unlock; free users get one use per CV.
 * Change these two numbers to raise or lower the limits.
 * No database change is needed.
 */
export const CV_UNLOCK_LIMITS = {
  fix: 30,
  download: 2147483647, // Paid CV downloads bypass this quota.
} as const;

export const CV_LIMIT_MESSAGE =
  "You have reached the usage limit for this CV unlock. Please contact CVCommit support if you need more.";

export type CVQuotaKind =
  keyof typeof CV_UNLOCK_LIMITS;

/*
 * Counts one use of a paid unlock (a Fix request or a download).
 * The counting happens in the database function consume_cv_quota,
 * which can only be called by the server.
 *
 * - Accounts on the older account-wide "pro" plan have no per-CV
 *   record, so they are not limited here.
 * - Database failures deny quota-consuming requests to protect AI costs.
 */
export async function consumeCVQuota(
  access: CareerOSCVAccess,
  kind: CVQuotaKind
): Promise<{ allowed: boolean }> {
  if (access.plan === "pro" || (kind === "download" && access.hasPaidAccess)) {
    return { allowed: true };
  }

  if (!access.userId || !access.cvHash) {
    return { allowed: false };
  }

  try {
    if (!access.hasPaidAccess) {
      const { data, error } = await createAdminClient().rpc("consume_free_cv_quota", {
        p_user: access.userId, p_cv_hash: access.cvHash, p_kind: kind, p_limit: 1,
      });
      if (error) { console.error("CVCommit free CV quota failed:", error); return { allowed: false }; }
      return { allowed: data === "ok" };
    }
    const { data, error } =
      await createAdminClient().rpc(
        "consume_cv_quota",
        {
          p_user:
            access.userId,
          p_cv_hash:
            access.cvHash,
          p_kind:
            kind,
          p_limit:
            CV_UNLOCK_LIMITS[kind],
        }
      );

    if (error) {
      console.error(
        "CVCommit: Usage check failed; denying request.",
        error.message
      );

      return { allowed: false };
    }

    return {
      allowed:
        data === "ok",
    };
  } catch (quotaError) {
    console.error(
      "CVCommit: Usage check failed; denying request.",
      quotaError
    );

    return { allowed: false };
  }
}