"use client";

import {
  createContext,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

/* ----------------------------- public types ----------------------------- */

export type ConfirmOpts = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** Red styling for destructive actions. */
  danger?: boolean;
  /** The confirm button stays off until this text is typed (e.g. "DELETE"). */
  typeToConfirm?: string;
};

type Ask = (o: ConfirmOpts) => Promise<boolean>;
export type ToastKind = "ok" | "err" | "info";
type Show = (message: string, kind?: ToastKind) => void;

const AskCtx = createContext<Ask>(async () => false);
const ToastCtx = createContext<Show>(() => {});

/** const ask = useConfirm();  if (!(await ask({ message: "Sure?" }))) return; */
export const useConfirm = () => useContext(AskCtx);
/** const toast = useToast();  toast("Saved.", "ok"); */
export const useToast = () => useContext(ToastCtx);

/* ------------------------------- helpers ------------------------------- */

const ERR = /could not|couldn't|cannot|can't|failed|wrong|not found|invalid|error|unable|missing|does not match|choose|enter |keep one|no student|too many|already|unpublish it first/i;
const OK = /saved|created|published|deleted|removed|added|updated|moved|reset|filled|locked|unlocked|done|success|uploaded|copied|sent|generated|imported|kept/i;

function kindOf(text: string): ToastKind {
  if (ERR.test(text)) return "err";
  if (OK.test(text)) return "ok";
  return "info";
}

const CSS = `
.dk-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:rgba(7,31,61,.6);font-family:Poppins,Arial,Helvetica,sans-serif;animation:dk-fade .15s ease-out}
.dk-card{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.35);animation:dk-pop .18s ease-out}
.dk-bar{height:6px;background:var(--gold,#d4ad58)}
.dk-card.danger .dk-bar{background:var(--red,#9e1824)}
.dk-body{padding:22px}
.dk-title{margin:0 0 8px;color:var(--navy,#071f3d);font-size:1.15rem;font-weight:800}
.dk-msg{margin:0;color:#18212f;font-size:.92rem;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.dk-input{width:100%;height:46px;margin-top:14px;padding:0 12px;border:1px solid var(--line,#dfe4ea);border-radius:8px;font:inherit;outline:none}
.dk-input:focus{border-color:var(--blue,#1e5c98);box-shadow:0 0 0 3px rgba(30,92,152,.14)}
.dk-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
.dk-btn{min-height:44px;padding:0 20px;border-radius:8px;font:inherit;font-weight:700;cursor:pointer;border:2px solid var(--navy,#071f3d)}
.dk-btn.cancel{background:#fff;color:var(--navy,#071f3d)}
.dk-btn.cancel:hover{background:#edf3fa}
.dk-btn.go{background:var(--navy,#071f3d);color:#fff}
.dk-btn.go:hover:not(:disabled){background:var(--navy-light,#0c315d)}
.dk-card.danger .dk-btn.go{background:var(--red,#9e1824);border-color:var(--red,#9e1824)}
.dk-card.danger .dk-btn.go:hover:not(:disabled){background:#7d121c}
.dk-btn:disabled{opacity:.45;cursor:not-allowed}
.dk-btn:focus-visible{outline:3px solid rgba(212,173,88,.8);outline-offset:2px}
.dk-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:1100;display:flex;align-items:flex-start;gap:12px;width:max-content;max-width:min(560px,calc(100vw - 28px));padding:13px 14px 13px 16px;background:#fff;color:#18212f;border-radius:10px;border-left:6px solid var(--navy,#071f3d);box-shadow:0 12px 32px rgba(7,31,61,.28);font-family:Poppins,Arial,Helvetica,sans-serif;font-size:.9rem;line-height:1.45;font-weight:600;animation:dk-up .2s ease-out}
.dk-toast.ok{border-left-color:#138a57}
.dk-toast.err{border-left-color:var(--red,#9e1824)}
.dk-toast span{flex:1;white-space:pre-wrap;overflow-wrap:anywhere}
.dk-toast button{flex:none;border:0;background:none;color:#667085;font-size:1.25rem;line-height:1;cursor:pointer;padding:0 2px}
@keyframes dk-fade{from{opacity:0}to{opacity:1}}
@keyframes dk-pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes dk-up{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@media (max-width:520px){
  .dk-actions{flex-direction:column-reverse}
  .dk-btn{width:100%}
}
@media (prefers-reduced-motion:reduce){.dk-overlay,.dk-card,.dk-toast{animation:none}}
`;

/* ------------------------------- provider ------------------------------- */

export function DialogProvider({
  children,
  watchMessages = false,
}: {
  children: ReactNode;
  /**
   * Admin area: also show a toast whenever a page shows one of its
   * top-of-page `.adm-msg` messages, so you never have to scroll up.
   */
  watchMessages?: boolean;
}) {
  const [o, setO] = useState<ConfirmOpts | null>(null);
  const [typed, setTyped] = useState("");
  const [toast, setToast] = useState<{ id: number; text: string; kind: ToastKind } | null>(null);

  const resolver = useRef<((v: boolean) => void) | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const counter = useRef(0);

  const ask = useCallback<Ask>(
    (opts) =>
      new Promise<boolean>((res) => {
        resolver.current?.(false); // a newer question replaces an unanswered one
        resolver.current = res;
        setTyped("");
        setO(opts);
      }),
    []
  );

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setO(null);
  }, []);

  const show = useCallback<Show>((text, kind) => {
    const msg = text.trim();
    if (!msg) return;
    clearTimeout(timer.current);
    counter.current += 1;
    setToast({ id: counter.current, text: msg, kind: kind ?? kindOf(msg) });
    // short messages ~4-6s, long ones (lists of names etc.) up to 20s
    const ms = Math.min(20000, Math.max(4000, 3000 + msg.length * 45));
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // Escape closes the dialog
  useEffect(() => {
    if (!o) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [o, close]);

  // Admin pages: mirror their .adm-msg box as a toast
  useEffect(() => {
    if (!watchMessages) return;
    const seen = new WeakMap<Element, string>();
    const check = () => {
      document.querySelectorAll(".adm-msg").forEach((el) => {
        const text = (el.textContent ?? "").trim();
        if (text && seen.get(el) !== text) {
          seen.set(el, text);
          show(text);
        }
      });
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    check();
    return () => mo.disconnect();
  }, [watchMessages, show]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // keep Tab inside the dialog
  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !cardRef.current) return;
    const items = Array.from(
      cardRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input")
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const need = o?.typeToConfirm;
  const ready = !need || typed.trim().toUpperCase() === need.trim().toUpperCase();

  return (
    <AskCtx.Provider value={ask}>
      <ToastCtx.Provider value={show}>
        {children}
        <style>{CSS}</style>

        {o && (
          <div className="dk-overlay" onClick={() => close(false)}>
            <div
              ref={cardRef}
              className={"dk-card" + (o.danger ? " danger" : "")}
              role={o.danger ? "alertdialog" : "dialog"}
              aria-modal="true"
              aria-labelledby="dk-title"
              aria-describedby="dk-msg"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={trapTab}
            >
              <div className="dk-bar" />
              <div className="dk-body">
                <h3 className="dk-title" id="dk-title">
                  {o.title ?? (o.danger ? "Please confirm" : "Confirm")}
                </h3>
                <p className="dk-msg" id="dk-msg">{o.message}</p>

                {need && (
                  <input
                    className="dk-input"
                    autoFocus
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && ready) close(true); }}
                    placeholder={`Type ${need} to confirm`}
                    aria-label={`Type ${need} to confirm`}
                  />
                )}

                <div className="dk-actions">
                  <button className="dk-btn cancel" autoFocus={!need && !!o.danger} onClick={() => close(false)}>
                    {o.cancelText ?? "Cancel"}
                  </button>
                  <button
                    className="dk-btn go"
                    autoFocus={!need && !o.danger}
                    disabled={!ready}
                    onClick={() => close(true)}
                  >
                    {o.confirmText ?? "Yes, continue"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div key={toast.id} className={`dk-toast ${toast.kind}`} role="status" aria-live="polite">
            <span>{toast.text}</span>
            <button aria-label="Close message" onClick={() => { clearTimeout(timer.current); setToast(null); }}>×</button>
          </div>
        )}
      </ToastCtx.Provider>
    </AskCtx.Provider>
  );
}
