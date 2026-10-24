"use client";

import { CSSProperties, useCallback, useEffect, useState } from "react";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type Row = { id: string; name: string; isOpen: boolean; code: string | null; openedAt: string | null };

const btn: CSSProperties = {
  border: "2px solid transparent", borderRadius: 8, padding: "10px 20px", fontSize: ".9rem",
  fontWeight: 600, fontFamily: "inherit", cursor: "pointer", minWidth: 130,
};
const openBtn: CSSProperties = { ...btn, background: "var(--navy)", color: "#fff" };
const lockBtn: CSSProperties = { ...btn, background: "var(--red)", color: "#fff" };
const newBtn: CSSProperties = { ...btn, background: "#fff", color: "var(--navy)", borderColor: "var(--navy)" };
const copyBtn: CSSProperties = {
  ...btn, minWidth: 0, padding: "6px 14px", fontSize: ".8rem",
  background: "var(--gold)", color: "var(--navy)", marginTop: 8,
};

export default function TestAccessPage() {
  const key = useAdminKey();
  const ask = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/test-access", { headers: { "x-admin-key": key } });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error ?? "Could not load classes.");
    setRows(d.classes);
  }, [key]);

  useEffect(() => { load(); }, [load]);

  async function set(id: string, open: boolean) {
    setBusy(id); setMsg("");
    try {
      const r = await fetch("/api/admin/test-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": key },
        body: JSON.stringify({ classId: id, open }),
      });
      if (!r.ok) setMsg("Could not save. Try again.");
      await load();
    } catch { setMsg("Could not reach the server."); }
    setBusy("");
  }

  async function copy(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* copy not available */ }
  }

  return (
    <div>
      <p style={{ marginBottom: 18, color: "var(--muted)", fontSize: ".92rem" }}>
        Open a class to get a fresh code. Write it on the board. Students enter it on their dashboard to unlock tests and exams. Assignments are never locked.
      </p>
      {msg && <p style={{ color: "var(--red)", fontWeight: 600, marginBottom: 12 }}>{msg}</p>}

      {rows.map((r) => (
        <div
          key={r.id}
          style={{
            background: "#fff", border: "1px solid var(--line)",
            borderLeft: `6px solid ${r.isOpen ? "var(--gold)" : "var(--line)"}`,
            borderRadius: 12, padding: 18, marginBottom: 14,
            display: "flex", flexWrap: "wrap", alignItems: "center",
            justifyContent: "space-between", gap: 16,
          }}
        >
          <div style={{ minWidth: 140 }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--navy)" }}>{r.name}</div>
            <span
              style={{
                display: "inline-block", marginTop: 6, padding: "3px 12px", borderRadius: 999,
                fontSize: ".78rem", fontWeight: 700,
                background: r.isOpen ? "#e8f6ee" : "#eef1f5",
                color: r.isOpen ? "#1a8f4c" : "var(--muted)",
              }}
            >
              {r.isOpen ? "● Open" : "● Locked"}
            </span>
          </div>

          {r.isOpen && r.code && (
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "1.9rem", fontWeight: 800, letterSpacing: 8, fontFamily: "monospace",
                  color: "var(--navy)", background: "var(--bg)", border: "2px dashed var(--gold)",
                  borderRadius: 10, padding: "8px 16px 8px 24px",
                }}
              >
                {r.code}
              </div>
              <button style={copyBtn} onClick={() => copy(r.id, r.code as string)}>
                {copied === r.id ? "Copied ✓" : "Copy code"}
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {r.isOpen ? (
              <>
                <button style={newBtn} disabled={busy === r.id} onClick={() => set(r.id, true)}>
                  {busy === r.id ? "Please wait…" : "New code"}
                </button>
                <button
                  style={lockBtn} disabled={busy === r.id}
                  onClick={async () => {
                    if (await ask({
                      title: `Lock ${r.name}?`,
                      message: "The code will stop working. Students already in a test can still finish.",
                      confirmText: "Lock class", danger: true,
                    })) set(r.id, false);
                  }}
                >
                  Lock class
                </button>
              </>
            ) : (
              <button style={openBtn} disabled={busy === r.id} onClick={() => set(r.id, true)}>
                {busy === r.id ? "Please wait…" : "Open class"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}