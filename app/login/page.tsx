"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import Turnstile, { captchaEnabled } from "@/components/auth/turnstile";

const ALLOWED_NEXT_ROUTES = [
  "/upload",
  "/analysis",
  "/results",
  "/fix",
  "/preview",
  "/upgrade",
];

function getSafeNextPath(): string {
  if (typeof window === "undefined") {
    return "/upload";
  }

  const searchParams = new URLSearchParams(window.location.search);
  const next = searchParams.get("next");

  if (!next) {
    return "/upload";
  }

  /*
   * Only allow internal CVCommit application routes.
   * This prevents an external redirect from being
   * injected through the ?next= parameter.
   */
  const isAllowed = ALLOWED_NEXT_ROUTES.some(
    (route) =>
      next === route ||
      next.startsWith(`${route}/`) ||
      next.startsWith(`${route}?`)
  );

  return isAllowed ? next : "/upload";
}

function getSignupHref(): string {
  if (typeof window === "undefined") {
    return "/signup";
  }

  const searchParams = new URLSearchParams(window.location.search);
  const next = searchParams.get("next");

  if (!next) {
    return "/signup";
  }

  const isAllowed = ALLOWED_NEXT_ROUTES.some(
    (route) =>
      next === route ||
      next.startsWith(`${route}/`) ||
      next.startsWith(`${route}?`)
  );

  if (!isAllowed) {
    return "/signup";
  }

  return `/signup?next=${encodeURIComponent(next)}`;
}

export default function LoginPage() {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    if (captchaEnabled && !captchaToken) {
      setErrorMessage("Please complete the security check.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        options: { captchaToken: captchaToken || undefined },
        password,
      });

      if (error) {
        if (
          error.message.toLowerCase().includes("invalid login credentials")
        ) {
          setErrorMessage(
            "Invalid email or password. If you cannot remember your password, use “Forgot password?” below."
          );
        } else {
          setErrorMessage(error.message);
        }

        return;
      }

      const nextPath = getSafeNextPath();

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      console.error("CVCommit login error:", error);

      setErrorMessage(
        "CVCommit could not sign you in. Please try again."
      );
    } finally {
      setIsSubmitting(false);
      setCaptchaToken("");
      setCaptchaReset((n) => n + 1);
    }
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();

    setErrorMessage("");
    setSuccessMessage("");

    if (!trimmedEmail) {
      setErrorMessage(
        "Enter your email address first, then click “Forgot password?”."
      );

      return;
    }

    if (captchaEnabled && !captchaToken) {
      setErrorMessage(
        "Please complete the security check, then click “Forgot password?” again."
      );
      return;
    }

    setIsResetting(true);

    try {
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        {
          redirectTo,
          captchaToken: captchaToken || undefined,
        }
      );

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setSuccessMessage(
        "Password reset email sent. Check your inbox and spam folder, then use the link in the email to choose a new password."
      );
    } catch (error) {
      console.error("CVCommit password reset request error:", error);

      setErrorMessage(
        "CVCommit could not send the password reset email. Please try again."
      );
    } finally {
      setIsResetting(false);
      setCaptchaToken("");
      setCaptchaReset((n) => n + 1);
    }
  }

  const signupHref = getSignupHref();

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block text-2xl font-bold tracking-tight"
          >
            CV<span className="text-blue-600">Commit</span>
          </Link>

          <h1 className="mt-8 text-3xl font-bold tracking-tight">
            Welcome back
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Sign in to continue to your CVCommit account.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-zinc-800"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-zinc-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-4">
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-zinc-800"
                >
                  Password
                </label>

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isResetting}
                  className="text-sm font-semibold text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResetting ? "Sending..." : "Forgot password?"}
                </button>
              </div>

              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-2xl border border-zinc-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <Turnstile onToken={setCaptchaToken} resetSignal={captchaReset} />

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
              >
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div
                role="status"
                className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-700"
              >
                {successMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || isResetting || (captchaEnabled && !captchaToken)}
              className="w-full rounded-full bg-zinc-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Log In"}
            </button>
          </form>

          <div className="mt-6 border-t border-zinc-100 pt-6 text-center text-sm text-zinc-600">
            Don&apos;t have an account?{" "}
            <Link
              href={signupHref}
              className="font-semibold text-blue-600 hover:text-blue-700"
            >
              Create one
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-500">
          CVCommit is a product by Tioluwa Designs.
        </p>
      </div>
    </main>
  );
}