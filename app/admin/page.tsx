"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAdminKey } from "./AdminShell";
import "./students/admin.css";

type Stats = { students: number; classes: number; results: number; assessments: number; attempts: number };

export default function Dashboard() {
  const key = useAdminKey();
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats", { headers: { "x-admin-key": key } })
      .then((r) => r.json()).then(setS).catch(() => {});
  }, [key]);

  const cards: [string, number | string][] = [
    ["Active students", s?.students ?? "…"],
    ["Classes", s?.classes ?? "…"],
    ["Published results", s?.results ?? "…"],
    ["Tests & exams", s?.assessments ?? "…"],
    ["Submitted attempts", s?.attempts ?? "…"],
  ];
  const tiles = [
    ["/admin/students", "👩‍🎓", "Add students", "Paste names, get Login IDs and PINs, print the credentials sheet."],
    ["/admin/electives", "🧪", "SSS subjects", "Set each SSS student's stream and subjects."],
    ["/admin/broadsheet", "📑", "Scores & results", "Download the template, upload CA and Exam scores, publish."],
    ["/admin/cbt", "📝", "Tests & exams", "Create CBT tests and exams, add questions, see results."],
  ];

  return (
    <div>
      <div className="stat-grid">
        {cards.map(([label, v]) => (
          <div className="stat" key={label}><strong>{v}</strong><span>{label}</span></div>
        ))}
      </div>
      <h2 className="sec-title">Quick actions</h2>
      <div className="tile-grid">
        {tiles.map(([href, icon, t, d]) => (
          <Link href={href} className="tile" key={href}>
            <div className="tile-ic">{icon}</div><b>{t}</b><p>{d}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
