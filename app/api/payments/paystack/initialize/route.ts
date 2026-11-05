import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { createClient } from "@/lib/supabase/server";
import { getCareerOSCVAccess } from "@/lib/access/server-access";

import {
  initializePaystackTransaction,
} from "@/lib/payments/paystack";

type InitializeRequestBody = {
  cvHash?: unknown;
};

export async function POST(request: Request) {
  try {
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
            "Sign in before unlocking this CV.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      (await request.json()) as InitializeRequestBody;

    const cvHash =
      typeof body.cvHash === "string"
        ? body.cvHash.trim()
        : "";

    if (!cvHash) {
      return NextResponse.json(
        {
          success: false,
          error:
            "CVCommit could not identify the CV you want to unlock.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * SHA-256 hashes are 64 hexadecimal characters.
     */
    if (
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
     * Do not charge again if this exact CV
     * is already unlocked for the user.
     */
    const existingAccess =
      await getCareerOSCVAccess(
        cvHash
      );

    if (
      existingAccess.hasPaidAccess ===
      true
    ) {
      return NextResponse.json({
        success: true,
        alreadyUnlocked: true,
        cvHash,
      });
    }

    const email =
      user.email?.trim();

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Your account does not have an email address available for payment.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Create our own unique Paystack reference.
     *
     * We never accept a payment reference generated
     * by the browser.
     */
    const reference =
      `cvc_${Date.now()}_${randomUUID()
        .replace(/-/g, "")
        .slice(0, 20)}`;

    const origin =
      new URL(
        request.url
      ).origin;

    const callbackUrl =
      `${origin}/upgrade?reference=${encodeURIComponent(
        reference
      )}`;

    const transaction =
      await initializePaystackTransaction({
        email,
        reference,
        callbackUrl,
        userId:
          user.id,
        cvHash,
      });

    return NextResponse.json({
      success: true,

      alreadyUnlocked:
        false,

      reference:
        transaction.reference,

      authorizationUrl:
        transaction.authorization_url,

      accessCode:
        transaction.access_code,
    });
  } catch (error) {
    console.error(
      "CVCommit Paystack initialization error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "CVCommit could not start the payment.",
      },
      {
        status: 500,
      }
    );
  }
}