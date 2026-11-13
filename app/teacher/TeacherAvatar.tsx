"use client";

import { useEffect, useState } from "react";

type Props = { name?: string; large?: boolean };
export default function TeacherAvatar({ name, large = false }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/teacher/profile-photo", { cache: "no-store" });
        const result: { url?: string | null } = response.ok ? await response.json() : {};
        if (alive) setUrl(result.url || null);
      } catch { if (alive) setUrl(null); }
    };
    void load();
    window.addEventListener("dkps:teacher:photo-changed", load);
    return () => { alive = false; window.removeEventListener("dkps:teacher:photo-changed", load); };
  }, []);
  return <span className={`tch-avatar-image ${large ? "tch-avatar-image-large" : ""}`} aria-hidden="true">
    {url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" /> : <span>{name?.trim().charAt(0).toUpperCase() || "T"}</span>}
  </span>;
}
