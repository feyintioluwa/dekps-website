import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Daily limit on CV analyses per account (each one costs AI credits).
 * Change this number to raise or lower the limit. No database change needed.
 * The count restarts every day at midnight UTC (1 AM in Nigeria).
 */
export const FREE_ANALYSIS_DAILY_LIMIT = 1;
export const PAID_ANALYSIS_DAILY_LIMIT = 10;

export const ANALYSIS_LIMIT_MESSAGE = "You have reached your daily CV analysis limit. Please try again tomorrow.";

/*
 * Counts one analysis for this user. The counting happens in the database
 * function consume_analysis_quota, which only the server can call.
 *
 * If the check itself fails (for example a database problem) the request is
 * allowed and the error is logged, the same way as the per-CV limits.
 */
export async function consumeAnalysisQuota(
  userId: string | null,
  paid: boolean
): Promise<{ allowed: boolean; reason?: "limit" | "unavailable" }> {
  if (!userId) {
    return { allowed: false, reason: "unavailable" };
  }

  try {
    const { data, error } = await createAdminClient().rpc(
      "consume_analysis_quota",
      {
        p_user: userId,
        p_limit: paid ? PAID_ANALYSIS_DAILY_LIMIT : FREE_ANALYSIS_DAILY_LIMIT,
      }
    );

    if (error) {
      console.error("CVCommit analysis quota check failed:", error);
      return { allowed: false, reason: "unavailable" };
    }

    return data === "ok"
      ? { allowed: true }
      : data === "limit"
        ? { allowed: false, reason: "limit" }
        : { allowed: false, reason: "unavailable" };
  } catch (error) {
    console.error("CVCommit analysis quota check failed:", error);
    return { allowed: false, reason: "unavailable" };
  }
}