import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  CV_UNLOCK_AMOUNT_NGN,
  CV_UNLOCK_CURRENCY,
  isValidCVUnlockTransaction,
  verifyPaystackTransaction,
} from "@/lib/payments/paystack";

type VerifyRequestBody = {
  reference?: unknown;
  cvHash?: unknown;
};

export async function POST(request: Request) {
  try {
    /*
     * ---------------------------------------------------------
     * VERIFY SIGNED-IN USER
     * ---------------------------------------------------------
     */

    const supabase =
      await createClient();

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Sign in before verifying this payment.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * READ REQUEST
     * ---------------------------------------------------------
     */

    const body =
      (await request.json()) as VerifyRequestBody;

    const reference =
      typeof body.reference === "string"
        ? body.reference.trim()
        : "";

    const cvHash =
      typeof body.cvHash === "string"
        ? body.cvHash.trim()
        : "";

    if (!reference) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing Paystack payment reference.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !cvHash ||
      !/^[a-f0-9]{64}$/i.test(
        cvHash
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The CV identifier is invalid.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * VERIFY DIRECTLY WITH PAYSTACK
     * ---------------------------------------------------------
     *
     * Never trust the browser saying payment succeeded.
     */

    const transaction =
      await verifyPaystackTransaction(
        reference
      );

    const validTransaction =
      isValidCVUnlockTransaction(
        transaction,
        user.id,
        cvHash
      );

    if (!validTransaction) {
      console.error(
        "CVCommit Paystack verification rejected transaction.",
        {
          reference:
            transaction.reference,

          status:
            transaction.status,

          amount:
            transaction.amount,

          currency:
            transaction.currency,

          userId:
            user.id,

          cvHash,
        }
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "CVCommit could not verify this payment for the selected CV.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * WRITE TRUSTED CV UNLOCK
     * ---------------------------------------------------------
     *
     * cv_unlocks blocks normal authenticated users from
     * inserting/updating rows.
     *
     * Only this trusted server-side admin client may write
     * the successful entitlement.
     */

    const admin =
      createAdminClient();

    const unlockedAt =
      new Date().toISOString();

    const {
      data: unlock,
      error: unlockError,
    } =
      await admin
        .from("cv_unlocks")
        .upsert(
          {
            user_id:
              user.id,

            cv_hash:
              cvHash,

            payment_reference:
              transaction.reference,

            amount:
              CV_UNLOCK_AMOUNT_NGN,

            currency:
              CV_UNLOCK_CURRENCY,

            status:
              "paid",

            unlocked_at:
              unlockedAt,
          },
          {
            onConflict:
              "user_id,cv_hash",
          }
        )
        .select(
          `
            id,
            user_id,
            cv_hash,
            payment_reference,
            amount,
            currency,
            status,
            unlocked_at
          `
        )
        .single();

    if (unlockError) {
      console.error(
        "CVCommit Paystack verification: Failed to save CV unlock.",
        unlockError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            "Your payment was verified, but CVCommit could not activate the CV unlock. Please retry verification.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ---------------------------------------------------------
     * SUCCESS
     * ---------------------------------------------------------
     */

    return NextResponse.json({
      success: true,

      verified: true,

      cvUnlocked: true,

      cvHash,

      reference:
        transaction.reference,

      unlock,
    });
  } catch (error) {
    console.error(
      "CVCommit Paystack verification error:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "CVCommit could not verify the payment.",
      },
      {
        status: 500,
      }
    );
  }
}