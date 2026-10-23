const TZ = "Africa/Lagos";

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-NG", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtMinutes(startIso: string, endIso: string | null): string {
  if (!endIso) return "-";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "-";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export function percent(score: number | null, total: number | null): number | null {
  if (score === null || total === null || total <= 0) return null;
  return Math.round((score / total) * 1000) / 10;
}
