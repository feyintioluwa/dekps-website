import crypto from "crypto";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  CV_UNLOCK_AMOUNT_NGN,
  CV_UNLOCK_CURRENCY,
  CV_UNLOCK_AMOUNT_KOBO,
} from "@/lib/payments/paystack";

type RawObject = Record<string, unknown>;

type PaystackWebhookEvent = {
  event?: unknown;
  data?: unknown;
};

function getPaystackSecretKey() {
  const secretKey =
    process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "Missing PAYSTACK_SECRET_KEY."
    );
  }

  return secretKey;
}

function isRecord(
  value: unknown
): value is RawObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function POST(
  request: Request
) {
  try {
    const rawBody =
      await request.text();

    const signature =
      request.headers.get(
        "x-paystack-signature"
      );

    if (!signature) {
      return new NextResponse(
        "Missing signature",
        {
          status: 401,
        }
      );
    }

    const secretKey =
      getPaystackSecretKey();

    const expectedSignature =
      crypto
        .createHmac(
          "sha512",
          secretKey
        )
        .update(rawBody)
        .digest("hex");

    const providedBuffer =
      Buffer.from(
        signature
      );

    const expectedBuffer =
      Buffer.from(
        expectedSignature
      );

    if (
      providedBuffer.length !==
        expectedBuffer.length ||
      !crypto.timingSafeEqual(
        providedBuffer,
        expectedBuffer
      )
    ) {
      console.warn(
        "CVCommit Paystack webhook rejected invalid signature."
      );

      return new NextResponse(
        "Invalid signature",
        {
          status: 401,
        }
      );
    }

    let parsed:
      PaystackWebhookEvent;

    try {
      parsed =
        JSON.parse(
          rawBody
        ) as PaystackWebhookEvent;
    } catch {
      return new NextResponse(
        "Invalid JSON",
        {
          status: 400,
        }
      );
    }

    if (
      parsed.event !==
      "charge.success"
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    if (
      !isRecord(
        parsed.data
      )
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    const transaction =
      parsed.data;

    const reference =
      typeof transaction.reference ===
        "string"
        ? transaction.reference.trim()
        : "";

    const status =
      typeof transaction.status ===
        "string"
        ? transaction.status
        : "";

    const amount =
      typeof transaction.amount ===
        "number"
        ? transaction.amount
        : null;

    const currency =
      typeof transaction.currency ===
        "string"
        ? transaction.currency
        : "";

    const metadata =
      isRecord(
        transaction.metadata
      )
        ? transaction.metadata
        : null;

    const userId =
      metadata &&
      typeof metadata.user_id ===
        "string"
        ? metadata.user_id.trim()
        : "";

    const cvHash =
      metadata &&
      typeof metadata.cv_hash ===
        "string"
        ? metadata.cv_hash.trim()
        : "";

    const paymentType =
      metadata &&
      typeof metadata.type ===
        "string"
        ? metadata.type
        : "";

    if (
      status !== "success" ||
      amount !==
        CV_UNLOCK_AMOUNT_KOBO ||
      currency !==
        CV_UNLOCK_CURRENCY ||
      paymentType !==
        "cv_unlock" ||
      !userId ||
      !cvHash ||
      !reference ||
      !/^[a-f0-9]{64}$/i.test(
        cvHash
      )
    ) {
      console.warn(
        "CVCommit Paystack webhook ignored invalid CV unlock transaction.",
        {
          reference,
          status,
          amount,
          currency,
          paymentType,
          userId,
          cvHash,
        }
      );

      return NextResponse.json({
        received: true,
      });
    }

    const admin =
      createAdminClient();

    const {
      error,
    } =
      await admin
        .from(
          "cv_unlocks"
        )
        .upsert(
          {
            user_id:
              userId,

            cv_hash:
              cvHash,

            payment_reference:
              reference,

            amount:
              CV_UNLOCK_AMOUNT_NGN,

            currency:
              CV_UNLOCK_CURRENCY,

            status:
              "paid",

            unlocked_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "user_id,cv_hash",
          }
        );

    if (error) {
      console.error(
        "CVCommit Paystack webhook failed to save CV unlock:",
        error
      );

      return new NextResponse(
        "Database error",
        {
          status: 500,
        }
      );
    }

    console.log(
      "CVCommit Paystack webhook unlocked CV.",
      {
        reference,
        userId,
        cvHash,
      }
    );

    return NextResponse.json({
      received: true,
    });
  } catch (error) {
    console.error(
      "CVCommit Paystack webhook error:",
      error
    );

    return new NextResponse(
      "Webhook processing failed",
      {
        status: 500,
      }
    );
  }
}