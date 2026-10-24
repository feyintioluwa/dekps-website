"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./home.css";

export default function Home() {
  // The results button shows only when the current term has published results
  const [resultsOpen, setResultsOpen] = useState(false);
  useEffect(() => {
    fetch("/api/home", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setResultsOpen(!!d?.resultsOpen))
      .catch(() => {});
  }, []);

  return (
    <div className="hm">
      <header className="hm-top">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/kps-logo.png" alt="De Kings Perfection Private School Logo" />
          <h1>DE KINGS PERFECTION PRIVATE SCHOOL</h1>
        </div>
      </header>

      <section className="hm-hero">
        <span>2026 / 2027 ACADEMIC SESSION</span>
        <h2>Academic and Moral Excellence</h2>
        <p>Welcome to De Kings Perfection Private School. Parents and students can check results securely online.</p>
        <div className="hm-actions">
          <Link className="hm-btn" href="/cbt">Take Test / Exam</Link>
          <Link className="hm-btn" href="/assignments">Assignments</Link>
          {resultsOpen && <Link className="hm-btn" href="/results">Check Student Result</Link>}
        </div>
      </section>

      <section className="hm-cards">
        <div className="hm-card"><h3>Results Portal</h3><p>Use your Student Login ID and 4-digit PIN to view and print your result.</p></div>
        <div className="hm-card"><h3>Our Motto</h3><p>Academic and Moral Excellence in every child.</p></div>
        <div className="hm-card"><h3>Visit Us</h3><p>13, Abosule Street, Agbado Crossing, Ogun State.</p></div>
      </section>

      <footer className="hm-foot">
        <strong>De Kings Perfection Private School</strong>
        <div>2026/2027 Academic Session</div>
      </footer>
    </div>
  );
}
