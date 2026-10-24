"use client";

import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";

type Opts = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  typeToConfirm?: string; // e.g. "DELETE": the button stays off until it is typed
};
type Ask = (o: Opts) => Promise<boolean>;

const Ctx = createContext<Ask>(async () => false);
export const useConfirm = () => useContext(Ctx);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [o, setO] = useState<Opts | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback<Ask>(
    (opts) =>
      new Promise<boolean>((res) => {
        resolver.current = res;
        setTyped("");
        setO(opts);
      }),
    []
  );

  function close(v: boolean) {
    resolver.current?.(v);
    resolver.current = null;
    setO(null);
  }

  const need = o?.typeToConfirm;
  const ready = !need || typed.trim().toUpperCase() === need.toUpperCase();

  return (
    <Ctx.Provider value={ask}>
      {children}
      {o && (
        <div
          onClick={() => close(false)}
          onKeyDown={(e) => { if (e.key === "Escape") close(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(7,31,61,.55)", zIndex: 1000,
            display: "grid", placeItems: "center", padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 14, width: "min(440px,100%)", overflow: "hidden",
              boxShadow: "0 20px 50px rgba(0,0,0,.35)", fontFamily: "Poppins, Arial, sans-serif",
            }}
          >
            <div style={{ height: 6, background: o.danger ? "var(--red, #9e1824)" : "var(--gold, #d4ad58)" }} />
            <div style={{ padding: 22 }}>
              <h3 style={{ color: "var(--navy, #071f3d)", marginBottom: 8 }}>
                {o.title ?? (o.danger ? "Please confirm" : "Confirm")}
              </h3>
              <p style={{ color: "#18212f", whiteSpace: "pre-wrap", fontSize: ".92rem", lineHeight: 1.5 }}>{o.message}</p>
              {need && (
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={`Type ${need} to confirm`}
                  style={{
                    width: "100%", marginTop: 14, height: 44, border: "1px solid var(--line, #dfe4ea)",
                    borderRadius: 8, padding: "0 12px", font: "inherit",
                  }}
                />
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button
                  onClick={() => close(false)}
                  style={{
                    padding: "10px 18px", borderRadius: 8, fontWeight: 600, cursor: "pointer", font: "inherit",
                    background: "#fff", color: "var(--navy, #071f3d)", border: "2px solid var(--navy, #071f3d)",
                  }}
                >
                  {o.cancelText ?? "Cancel"}
                </button>
                <button
                  disabled={!ready}
                  onClick={() => close(true)}
                  style={{
                    padding: "10px 18px", borderRadius: 8, fontWeight: 600, font: "inherit", border: "2px solid transparent",
                    cursor: ready ? "pointer" : "not-allowed", opacity: ready ? 1 : 0.5,
                    background: o.danger ? "var(--red, #9e1824)" : "var(--navy, #071f3d)", color: "#fff",
                  }}
                >
                  {o.confirmText ?? "Yes, continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}