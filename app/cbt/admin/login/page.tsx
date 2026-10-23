"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function CbtAdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/cbt/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        router.push("/cbt/admin");
        router.refresh();
      } else {
        setMessage("Incorrect password. Please try again.");
      }
    } catch {
      setMessage("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f6f9",
        padding: 20,
      }}
    >
      <div className="cbt-card">
        <div className="cbt-heading">
          <div className="cbt-icon">🛡️</div>
          <div>
            <h2>CBT Admin Login</h2>
            <p>Restricted to school administrators.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Admin Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter admin password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="cbt-message" role="alert">
            {message}
          </div>

          <button type="submit" className="cbt-button" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="cbt-note">
          <span>ⓘ</span>
          <p>
            Default password is <strong>admin1234</strong>. Change it by setting
            the <code>CBT_ADMIN_PASSWORD</code> environment variable before
            going live.
          </p>
        </div>
      </div>
    </main>
  );
}
