import {
  normalizeCareerOSPlan,
  type CareerOSPlan,
} from "@/lib/access/career-access";

import {
  createClient,
} from "@/lib/supabase/server";

export type CareerOSServerAccess = {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  plan: CareerOSPlan;
};

export type CareerOSCVAccess = CareerOSServerAccess & {
  cvHash: string | null;
  cvUnlocked: boolean;
  hasPaidAccess: boolean;
};

export async function getCareerOSServerAccess(): Promise<CareerOSServerAccess> {
  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    return {
      authenticated: false,
      userId: null,
      email: null,
      plan: "free",
    };
  }

  const {
    data: profile,
    error: profileError,
  } =
    await supabase
      .from("profiles")
      .select("plan")
      .eq(
        "id",
        user.id
      )
      .maybeSingle();

  if (profileError) {
    console.error(
      "CVCommit: Failed to load user profile.",
      profileError
    );

    return {
      authenticated: true,
      userId: user.id,
      email: user.email ?? null,
      plan: "free",
    };
  }

  return {
    authenticated: true,
    userId: user.id,
    email: user.email ?? null,
    plan:
      normalizeCareerOSPlan(
        profile?.plan
      ),
  };
}

export async function getCareerOSCVAccess(
  cvHash: string
): Promise<CareerOSCVAccess> {
  const normalizedCVHash =
    cvHash.trim();

  const access =
    await getCareerOSServerAccess();

  if (!access.authenticated) {
    return {
      ...access,
      cvHash:
        normalizedCVHash || null,
      cvUnlocked: false,
      hasPaidAccess: false,
    };
  }

  /*
   * Keep the existing account-wide Pro entitlement working
   * during the transition to per-CV purchases.
   */
  if (access.plan === "pro") {
    return {
      ...access,
      cvHash:
        normalizedCVHash || null,
      cvUnlocked: false,
      hasPaidAccess: true,
    };
  }

  if (!normalizedCVHash) {
    return {
      ...access,
      cvHash: null,
      cvUnlocked: false,
      hasPaidAccess: false,
    };
  }

  const supabase =
    await createClient();

  const {
    data: unlock,
    error: unlockError,
  } =
    await supabase
      .from("cv_unlocks")
      .select("id")
      .eq(
        "user_id",
        access.userId
      )
      .eq(
        "cv_hash",
        normalizedCVHash
      )
      .eq(
        "status",
        "paid"
      )
      .maybeSingle();

  if (unlockError) {
    console.error(
      "CVCommit: Failed to check CV unlock.",
      unlockError
    );

    return {
      ...access,
      cvHash: normalizedCVHash,
      cvUnlocked: false,
      hasPaidAccess: false,
    };
  }

  const cvUnlocked =
    Boolean(unlock);

  return {
    ...access,
    cvHash: normalizedCVHash,
    cvUnlocked,
    hasPaidAccess: cvUnlocked,
  };
}
