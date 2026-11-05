"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const NIGERIA_UNLOCK_PRICE = "₦7,500";

type InitializePaymentResponse = {
  success?: boolean;
  alreadyUnlocked?: boolean;
  reference?: string;
  authorizationUrl?: string;
  error?: string;
};

type VerifyPaymentResponse = {
  success?: boolean;
  verified?: boolean;
  cvUnlocked?: boolean;
  error?: string;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!responseText.trim()) {
    throw new Error("CVCommit received an empty response from the payment server.");
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    console.error(
      "CVCommit received a non-JSON payment response:",
      responseText.slice(0, 1500)
    );

    throw new Error("CVCommit received an invalid response from the payment server.");
  }
}

export default function UpgradePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isCheckingCV, setIsCheckingCV] = useState(true);
  const [activeCVHash, setActiveCVHash] = useState("");
  const [isStartingPayment, setIsStartingPayment] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function checkActiveCVAndPayment() {
      const storedHash =
        sessionStorage.getItem("careerOSActiveCVHash")?.trim() ?? "";

      if (cancelled) {
        return;
      }

      setActiveCVHash(storedHash);

      if (!storedHash) {
        setIsCheckingCV(false);
        return;
      }

      const searchParams = new URLSearchParams(window.location.search);
      const paymentReference =
        searchParams.get("reference")?.trim() ||
        searchParams.get("trxref")?.trim() ||
        "";

      if (!paymentReference) {
        setIsCheckingCV(false);
        return;
      }

      setIsVerifyingPayment(true);
      setPaymentError("");

      try {
        const response = await fetch("/api/payments/paystack/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reference: paymentReference,
            cvHash: storedHash,
          }),
        });

        const data =
          await readJsonResponse<VerifyPaymentResponse>(response);

        if (cancelled) {
          return;
        }

        if (
          !response.ok ||
          data.success !== true ||
          data.verified !== true ||
          data.cvUnlocked !== true
        ) {
          throw new Error(
            data.error ||
              "CVCommit could not verify this payment. Please try again."
          );
        }

        router.replace("/fix");
        router.refresh();
      } catch (error) {
        console.error("CVCommit Paystack verification error:", error);

        if (!cancelled) {
          setPaymentError(
            error instanceof Error
              ? error.message
              : "CVCommit could not verify this payment. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setIsVerifyingPayment(false);
          setIsCheckingCV(false);
        }
      }
    }

    void checkActiveCVAndPayment();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      sessionStorage.clear();
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("CVCommit sign out error:", error);
      alert("CVCommit could not sign you out. Please try again.");
      setIsSigningOut(false);
    }
  }

  async function handleUnlockCV() {
    if (
      isStartingPayment ||
      isVerifyingPayment ||
      isSigningOut
    ) {
      return;
    }

    if (!activeCVHash) {
      setPaymentError(
        "CVCommit could not identify your active CV. Please return to your results and try again."
      );
      return;
    }

    setIsStartingPayment(true);
    setPaymentError("");

    try {
      const response = await fetch(
        "/api/payments/paystack/initialize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cvHash: activeCVHash,
          }),
        }
      );

      const data =
        await readJsonResponse<InitializePaymentResponse>(response);

      if (!response.ok || data.success !== true) {
        throw new Error(
          data.error ||
            "CVCommit could not start the payment. Please try again."
        );
      }

      if (data.alreadyUnlocked === true) {
        router.replace("/fix");
        router.refresh();
        return;
      }

      if (!data.authorizationUrl) {
        throw new Error(
          "Paystack did not return a checkout link. Please try again."
        );
      }

      window.location.assign(data.authorizationUrl);
    } catch (error) {
      console.error("CVCommit Paystack initialization error:", error);

      setPaymentError(
        error instanceof Error
          ? error.message
          : "CVCommit could not start the payment. Please try again."
      );

      setIsStartingPayment(false);
    }
  }

  if (isCheckingCV) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-950">
            {isVerifyingPayment
              ? "Verifying your payment"
              : "Checking your CV"}
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {isVerifyingPayment
              ? "Confirming your Paystack payment and activating this CV..."
              : "Making sure this unlock is connected to your active CV..."}
          </p>
        </div>
      </main>
    );
  }

  if (!activeCVHash) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-xl">
            !
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-zinc-950">
            No active CV found
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            CVCommit needs an analyzed CV before it can create a CV-specific
            unlock. Upload and analyze your CV first, then return here from
            your results.
          </p>

          <Link
            href="/upload"
            className="mt-7 inline-flex rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Upload a CV
          </Link>
        </div>
      </main>
    );
  }

  const paymentBusy =
    isStartingPayment ||
    isVerifyingPayment ||
    isSigningOut;

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <nav className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight sm:text-2xl"
          >
            CV<span className="text-blue-600">Commit</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/results"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              Back to Results
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={paymentBusy}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-7xl px-5 pb-20 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-violet-700">
            CVCommit CV Unlock
          </div>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl">
            Turn your CV analysis into a stronger CV
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
            Unlock CVCommit&apos;s improvement tools for this CV. Strengthen
            weak sections, choose the changes you want, preview the improved
            version, and download your finished CV.
          </p>
        </div>

        {paymentError ? (
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left">
            <p className="text-sm font-semibold text-red-700">
              Payment could not be completed
            </p>

            <p className="mt-1 text-sm leading-6 text-red-600">
              {paymentError}
            </p>
          </div>
        ) : null}

        <div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
              Your free analysis
            </p>

            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              You already know what needs improvement.
            </h2>

            <p className="mt-4 text-sm leading-7 text-zinc-600">
              CVCommit Free gives you the diagnosis. Unlocking this CV gives
              you the tools to act on those recommendations and create the
              improved version.
            </p>

            <div className="mt-7 space-y-3">
              <IncludedRow text="CV score and score breakdown" />
              <IncludedRow text="Strengths and weaknesses" />
              <IncludedRow text="Skills and career recommendations" />
              <IncludedRow text="Practical improvement action plan" />
            </div>

            <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
              <p className="text-sm font-bold text-blue-900">
                Your original CV stays safe
              </p>

              <p className="mt-2 text-sm leading-6 text-blue-800/80">
                CVCommit does not overwrite your original CV. You decide which
                suggested improvements are applied.
              </p>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-3xl bg-zinc-950 p-7 text-white shadow-xl sm:p-9">
            <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-600/20 blur-3xl" />

            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex rounded-full bg-violet-500/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-violet-300 ring-1 ring-violet-400/20">
                    Unlock this CV
                  </div>

                  <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
                    Your improved CV
                  </h2>
                </div>

                <div className="text-right">
                  <p className="text-3xl font-bold tracking-tight">
                    {NIGERIA_UNLOCK_PRICE}
                  </p>

                  <p className="mt-1 text-xs font-medium text-zinc-400">
                    one-time payment
                  </p>
                </div>
              </div>

              <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-400">
                Pay once to unlock the improvement and export tools for this
                CV. No monthly subscription and no recurring charge.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <UnlockFeature
                  title="AI-assisted rewrites"
                  text="Generate stronger alternatives for weak CV sections."
                />

                <UnlockFeature
                  title="Apply your choices"
                  text="Choose which suggested improvements you want to use."
                />

                <UnlockFeature
                  title="Improved CV preview"
                  text="Review the finished version before downloading it."
                />

                <UnlockFeature
                  title="DOCX & PDF downloads"
                  text="Export an editable Word file and a ready-to-use PDF."
                />
              </div>

              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.05] p-5">
                <div className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-sm font-bold text-emerald-300">
                    ✓
                  </div>

                  <div>
                    <p className="font-semibold text-white">
                      Permanent unlock for this CV
                    </p>

                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      Once this CV is unlocked, you can return to its unlocked
                      CVCommit tools without purchasing the same CV again.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleUnlockCV}
                disabled={paymentBusy}
                className="mt-8 flex w-full items-center justify-center rounded-2xl bg-blue-600 px-6 py-4 text-sm font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStartingPayment
                  ? "Opening Paystack..."
                  : isVerifyingPayment
                    ? "Verifying payment..."
                    : `Unlock This CV — ${NIGERIA_UNLOCK_PRICE}`}
              </button>

              <p className="mt-3 text-center text-xs leading-5 text-zinc-500">
                Secure one-time payment powered by Paystack. No subscription.
              </p>
            </div>
          </section>
        </div>

        <section className="mx-auto mt-6 max-w-6xl rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                What you&apos;re paying for
              </p>

              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                Clear value. No hidden subscription.
              </h2>

              <p className="mt-4 text-sm leading-7 text-zinc-600">
                The unlock is for improving and exporting this CV through
                CVCommit. Your free analysis remains available without
                purchasing the unlock.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ValueCard
                number="01"
                title="Improve"
                text="Turn identified weaknesses into stronger CV content."
              />

              <ValueCard
                number="02"
                title="Control"
                text="Review suggestions and apply only the changes you approve."
              />

              <ValueCard
                number="03"
                title="Preview"
                text="See the improved CV before creating your final files."
              />

              <ValueCard
                number="04"
                title="Export"
                text="Download the improved CV in both DOCX and PDF formats."
              />
            </div>
          </div>
        </section>

        <div className="mx-auto mt-8 max-w-6xl text-center">
          <p className="text-xs leading-6 text-zinc-400">
            CVCommit does not guarantee interviews or employment. It helps you
            improve the clarity, positioning, and presentation of your CV based
            on the information you provide.
          </p>
        </div>
      </section>
    </main>
  );
}

function IncludedRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-600">
        ✓
      </div>

      <span className="text-sm font-medium text-zinc-700">
        {text}
      </span>
    </div>
  );
}

function UnlockFeature({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
        ✓
      </div>

      <h3 className="mt-4 font-semibold text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {text}
      </p>
    </div>
  );
}

function ValueCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5">
      <span className="text-xs font-bold text-blue-600">
        {number}
      </span>

      <h3 className="mt-3 font-bold text-zinc-950">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zinc-600">
        {text}
      </p>
    </div>
  );
}
