"use client";

import { useEffect, useRef } from "react";

/*
 * Cloudflare Turnstile security check (free CAPTCHA).
 *
 * Set NEXT_PUBLIC_TURNSTILE_SITE_KEY to switch it on. Without the key
 * nothing is shown, and `captchaEnabled` is false.
 *
 * Tokens work ONCE. After every sign-in / sign-up attempt, change
 * `resetSignal` (add 1) so a fresh token is requested.
 */

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const captchaEnabled = Boolean(SITE_KEY);

type Props = {
  onToken: (token: string) => void;
  resetSignal?: number;
};

export default function Turnstile({ onToken, resetSignal = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const firstResetRef = useRef(true);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  // Load the script once and draw the widget
  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    function draw() {
      if (cancelled || !containerRef.current || !window.turnstile) return false;
      if (widgetIdRef.current) return true;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": () => onTokenRef.current(""),
      });
      return true;
    }

    if (!draw()) {
      timer = setInterval(() => {
        if (draw() && timer) clearInterval(timer);
      }, 200);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, []);

  // Ask for a fresh token after each attempt
  useEffect(() => {
    if (firstResetRef.current) {
      firstResetRef.current = false;
      return;
    }
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
