"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminKey } from "../AdminShell";

type Row = { id: string; name: string; isOpen: boolean; code: string | null; openedAt: string | null };

export default function TestAccessPage() {
  const key = useAdminKey();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/test-access", { headers: { "x-admin-key": key } });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error ?? "Could not load classes.");
    setRows(d.classes);
  }, [key]);

  useEffect(() => { load(); }, [load]);

  async function set(id: string, open: boolean) {
    setBusy(id); setMsg("");
    const r = await fetch("/api/admin/test-access", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": key },
      body: JSON.stringify({ classId: id, open }),
    });
    if (!r.ok) setMsg("Could not save. Try again.");
    await load();
    setBusy("");
  }

  return (
    <div>
      <p style={{ marginBottom: 14, color: "#687385" }}>
        Open a class to get a fresh code. Write it on the board. Students enter it on their dashboard to unlock tests and exams. Assignments are never locked.
      </p>
      {msg && <p style={{ color: "#b00020", marginBottom: 10 }}>{msg}</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ background: "#fff", border: "1px solid #dde3ec", borderRadius: 10, padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <b>{r.name}</b>
            <div style={{ color: r.isOpen ? "#0a7a3b" : "#687385", fontSize: ".9rem" }}>{r.isOpen ? "Open" : "Locked"}</div>
          </div>
          {r.isOpen && r.code && (
            <div style={{ fontSize: "1.8rem", letterSpacing: 6, fontWeight: 700, fontFamily: "monospace" }}>{r.code}</div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy === r.id} onClick={() => set(r.id, true)}>{r.isOpen ? "New code" : "Open"}</button>
            {r.isOpen && <button disabled={busy === r.id} onClick={() => { if (confirm(`Lock ${r.name}?`)) set(r.id, false); }}>Lock</button>}
          </div>
        </div>
      ))}
    </div>
  );
}