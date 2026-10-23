export default function Flash({ ok, error }: { ok?: string; error?: string }) {
  const text = (error ?? ok ?? "").slice(0, 300);
  if (!text) return null;

  return (
    <div className={`adm-flash ${error ? "error" : "ok"}`} role="status">
      {text}
    </div>
  );
}
