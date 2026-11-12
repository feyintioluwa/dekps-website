"use client";

import "./dialog.css";

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

export type ToastKind = "ok" | "err" | "info";

/** A one-button message: "Scores saved!" with a Done button. */
export type NoticeOpts = {
  title?: string;
  message: string;
  kind?: ToastKind;
  buttonText?: string;
};

type Ask = (o: ConfirmOpts) => Promise<boolean>;
type Show = (message: string, kind?: ToastKind, title?: string) => void;
type Notice = (o: NoticeOpts) => Promise<void>;

const AskCtx = createContext<Ask>(async () => false);
const ToastCtx = createContext<Show>(() => {});
const NoticeCtx = createContext<Notice>(async () => {});

/** const ask = useConfirm();  if (!(await ask({ message: "Sure?" }))) return; */
export const useConfirm = () => useContext(AskCtx);

/** const toast = useToast();  toast("Saved.", "ok");   (an optional 3rd argument sets the title) */
export const useToast = () => useContext(ToastCtx);

/** const notice = useNotice();  await notice({ title: "Scores saved!", message: "..." }); */
export const useNotice = () => useContext(NoticeCtx);

/* ------------------------------- helpers ------------------------------- */

const ERR = /could not|couldn't|cannot|can't|failed|wrong|not found|invalid|error|unable|missing|does not match|choose|enter |keep one|no student|too many|already|unpublish it first/i;
const OK = /saved|created|published|deleted|removed|added|updated|moved|reset|filled|locked|unlocked|done|success|uploaded|copied|sent|generated|imported|kept/i;

function kindOf(text: string): ToastKind {
  if (ERR.test(text)) return "err";
  if (OK.test(text)) return "ok";
  return "info";
}

const TOAST_TITLE: Record<ToastKind, string> = { ok: "Done", err: "Something went wrong", info: "Notice" };
const NOTICE_TITLE: Record<ToastKind, string> = { ok: "Done!", err: "Something went wrong", info: "Notice" };

type IconKind = "ok" | "warn" | "err" | "info";

function Icon({ kind, size = 28 }: { kind: IconKind; size?: number }) {
  const p = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
  } as const;
  if (kind === "ok") return <svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  if (kind === "warn") return <svg {...p}><path d="M12 3.5l9.5 16.5h-19L12 3.5z" /><path d="M12 10v4.5" /><path d="M12 17.6h.01" /></svg>;
  if (kind === "err") return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.8h.01" /></svg>;
}

type Dlg = { type: "confirm"; o: ConfirmOpts } | { type: "notice"; o: NoticeOpts };

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
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [typed, setTyped] = useState("");
  const [toast, setToast] = useState<{ id: number; text: string; kind: ToastKind; title: string } | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const counter = useRef(0);
  const last = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  const open = useCallback((d: Dlg, res: (v: boolean) => void) => {
    resolver.current?.(false); // a newer question replaces an unanswered one
    resolver.current = res;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTyped("");
    setDlg(d);
  }, []);

  const ask = useCallback<Ask>(
    (opts) => new Promise<boolean>((res) => open({ type: "confirm", o: opts }, res)),
    [open]
  );

  const notice = useCallback<Notice>(
    (opts) => new Promise<void>((res) => open({ type: "notice", o: opts }, () => res())),
    [open]
  );

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setDlg(null);
    // give the keyboard focus back to the button that opened the dialog
    const el = opener.current;
    opener.current = null;
    if (el) setTimeout(() => { if (el.isConnected) el.focus(); }, 0);
  }, []);

  const show = useCallback<Show>((text, kind, title) => {
    const msg = text.trim();
    if (!msg) return;
    // no repeated popup for the same message fired twice in a row
    const now = Date.now();
    if (last.current.text === msg && now - last.current.at < 1500) return;
    last.current = { text: msg, at: now };
    clearTimeout(timer.current);
    counter.current += 1;
    const k = kind ?? kindOf(msg);
    setToast({ id: counter.current, text: msg, kind: k, title: title ?? TOAST_TITLE[k] });
    // short messages ~4-6s, long ones (lists of names etc.) up to 20s
    const ms = Math.min(20000, Math.max(4000, 3000 + msg.length * 45));
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  // Escape closes the dialog
  useEffect(() => {
    if (!dlg) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(dlg.type === "notice");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dlg, close]);

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
    const lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
  }

  const isConfirm = dlg?.type === "confirm";
  const c = dlg?.type === "confirm" ? dlg.o : null;
  const n = dlg?.type === "notice" ? dlg.o : null;
  const need = c?.typeToConfirm;
  const ready = !need || typed.trim().toUpperCase() === need.trim().toUpperCase();
  const iconKind: IconKind = c ? "warn" : (n?.kind ?? "ok");
  const title = c
    ? (c.title ?? (c.danger ? "Please confirm" : "Confirm"))
    : (n?.title ?? NOTICE_TITLE[n?.kind ?? "ok"]);
  const message = c?.message ?? n?.message ?? "";

  return (
    <AskCtx.Provider value={ask}>
      <ToastCtx.Provider value={show}>
        <NoticeCtx.Provider value={notice}>
          {children}

          {dlg && (
            <div className="dk-overlay" onClick={() => close(!isConfirm)}>
              <div
                ref={cardRef}
                className={"dk-card" + (c?.danger ? " danger" : "")}
                role={c?.danger || n?.kind === "err" ? "alertdialog" : "dialog"}
                aria-modal="true"
                aria-labelledby="dk-title"
                aria-describedby="dk-msg"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={trapTab}
              >
                <div className={`dk-icon ${iconKind}`}><Icon kind={iconKind} /></div>
                <h3 className="dk-title" id="dk-title">{title}</h3>
                <p className="dk-msg" id="dk-msg">{message}</p>

                {c && need && (
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

                {c ? (
                  <div className="dk-actions two">
                    <button className="dk-btn cancel" autoFocus={!need && !!c.danger} onClick={() => close(false)}>
                      {c.cancelText ?? "Cancel"}
                    </button>
                    <button className="dk-btn go" autoFocus={!need && !c.danger} disabled={!ready} onClick={() => close(true)}>
                      {c.confirmText ?? "Yes, continue"}
                    </button>
                  </div>
                ) : (
                  <div className="dk-actions">
                    <button className="dk-btn go" autoFocus onClick={() => close(true)}>
                      {n?.buttonText ?? "Done"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {toast && (
            <div key={toast.id} className={`dk-toast ${toast.kind}`} role={toast.kind === "err" ? "alert" : "status"} aria-live={toast.kind === "err" ? "assertive" : "polite"}>
              <span className="dk-ticon"><Icon kind={toast.kind} size={18} /></span>
              <div className="dk-ttext">
                <strong>{toast.title}</strong>
                <span>{toast.text}</span>
              </div>
              <button aria-label="Close message" onClick={() => { clearTimeout(timer.current); setToast(null); }}>×</button>
            </div>
          )}
        </NoticeCtx.Provider>
      </ToastCtx.Provider>
    </AskCtx.Provider>
  );
}
