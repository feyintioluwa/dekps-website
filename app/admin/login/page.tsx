"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "./login.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(true);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setIsError(true);
      setMessage("Invalid email or password.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="staff-login">
      <form className="staff-card" onSubmit={handleSubmit}>
        <div className="staff-brand">
          <img src="/assets/kps-logo.png" alt="De Kings Perfection Private School Logo" />
          <h1>DE KINGS PERFECTION PRIVATE SCHOOL</h1>
          <span>STAFF PORTAL</span>
        </div>

        <div className="staff-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="Enter your email"
            required
          />
        </div>

        <div className="staff-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
          />
        </div>

        <div className={`staff-message ${isError ? "error" : "success"}`} role="alert">
          {message}
        </div>

        <button className="staff-button" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="staff-footer">Authorized staff only</p>
    </main>
  );
}