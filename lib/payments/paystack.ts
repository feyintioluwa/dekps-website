const PAYSTACK_BASE_URL = "https://api.paystack.co";

export const CV_UNLOCK_AMOUNT_NGN = 7500;

export const CV_UNLOCK_AMOUNT_KOBO =
  CV_UNLOCK_AMOUNT_NGN * 100;

export const CV_UNLOCK_CURRENCY = "NGN";

type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

export type PaystackTransaction = {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  customer?: {
    email?: string;
  };
  metadata?: Record<string, unknown> | null;
};

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data?: PaystackTransaction;
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

async function readPaystackResponse<T>(
  response: Response
): Promise<T> {
  const responseText =
    await response.text();

  if (!responseText.trim()) {
    throw new Error(
      "Paystack returned an empty response."
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(
      "Paystack returned an invalid response."
    );
  }
}

export async function initializePaystackTransaction({
  email,
  reference,
  callbackUrl,
  userId,
  cvHash,
}: {
  email: string;
  reference: string;
  callbackUrl: string;
  userId: string;
  cvHash: string;
}) {
  const secretKey =
    getPaystackSecretKey();

  const response =
    await fetch(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${secretKey}`,
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          email,
          amount:
            CV_UNLOCK_AMOUNT_KOBO.toString(),
          currency:
            CV_UNLOCK_CURRENCY,
          reference,
          callback_url:
            callbackUrl,

          metadata: {
            product:
              "CVCommit",
            type:
              "cv_unlock",
            user_id:
              userId,
            cv_hash:
              cvHash,
          },
        }),

        cache:
          "no-store",
      }
    );

  const data =
    await readPaystackResponse<PaystackInitializeResponse>(
      response
    );

  if (
    !response.ok ||
    data.status !== true ||
    !data.data
  ) {
    throw new Error(
      data.message ||
        "Paystack could not initialize the payment."
    );
  }

  return data.data;
}

export async function verifyPaystackTransaction(
  reference: string
) {
  const secretKey =
    getPaystackSecretKey();

  const response =
    await fetch(
      `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${secretKey}`,
        },

        cache:
          "no-store",
      }
    );

  const data =
    await readPaystackResponse<PaystackVerifyResponse>(
      response
    );

  if (
    !response.ok ||
    data.status !== true ||
    !data.data
  ) {
    throw new Error(
      data.message ||
        "Paystack could not verify the payment."
    );
  }

  return data.data;
}

export function isValidCVUnlockTransaction(
  transaction: PaystackTransaction,
  expectedUserId: string,
  expectedCVHash: string
) {
  const metadata =
    transaction.metadata ?? {};

  return (
    transaction.status ===
      "success" &&
    transaction.amount ===
      CV_UNLOCK_AMOUNT_KOBO &&
    transaction.currency ===
      CV_UNLOCK_CURRENCY &&
    metadata.type ===
      "cv_unlock" &&
    metadata.user_id ===
      expectedUserId &&
    metadata.cv_hash ===
      expectedCVHash
  );
}