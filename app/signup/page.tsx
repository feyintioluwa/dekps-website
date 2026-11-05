"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import Turnstile, { captchaEnabled } from "@/components/auth/turnstile";

export default function SignupPage() {
  const supabase = useMemo(() => createClient(), []);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!fullName.trim() || !email.trim() || !password) {
      setErrorMessage(
        "Complete all fields before creating your account."
      );
      return;
    }

    if (captchaEnabled && !captchaToken) {
      setErrorMessage("Please complete the security check.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage(
        "Your password must be at least 8 characters."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          captchaToken: captchaToken || undefined,
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        setSuccessMessage(
          "Your CVCommit account has been created successfully. You are now signed in."
        );
      } else {
        setSuccessMessage(
          "Your CVCommit account has been created. Check your email to confirm your account before signing in."
        );
      }
    } catch (error) {
      console.error("CVCommit signup error:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "CVCommit could not create your account."
      );
    } finally {
      setIsSubmitting(false);
      setCaptchaToken("");
      setCaptchaReset((n) => n + 1);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <nav className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight sm:text-2xl"
          >
            CV<span className="text-blue-600">Commit</span>
          </Link>

          <Link
            href="/login"
            className="text-sm font-semibold text-zinc-600 transition hover:text-zinc-950"
          >
            Sign in
          </Link>
        </div>
      </nav>

      <section className="mx-auto flex min-h-[calc(100vh-73px)] max-w-7xl items-center justify-center px-5 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-7 shadow-xl sm:p-9">
          <div className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-700">
            CVCommit Account
          </div>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-zinc-950">
            Create your account
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Create your free account and check your CV with CVCommit.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="fullName"
                className="text-sm font-semibold text-zinc-800"
              >
                Full name
              </label>

              <input
                id="fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="text-sm font-semibold text-zinc-800"
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
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="text-sm font-semibold text-zinc-800"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                placeholder="Minimum 8 characters"
              />
            </div>

            <Turnstile onToken={setCaptchaToken} resetSignal={captchaReset} />

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
              >
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700"
              >
                {successMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || (captchaEnabled && !captchaToken)}
              className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Creating account..."
                : "Create free account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-blue-600 hover:text-blue-700"
            >
              Sign in
            </Link>
          </p>

          <p className="mt-6 border-t border-zinc-100 pt-6 text-center text-xs text-zinc-400">
            CVCommit is a product by Tioluwa Designs.
          </p>
        </div>
      </section>
    </main>
  );
}