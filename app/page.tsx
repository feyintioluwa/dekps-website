
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./home.css";

type Notice = {
  id: string;
  title: string;
  body: string;
  postedAt: string;
};

export default function Home() {
  // The results button shows only when the current term has published results.
  const [resultsOpen, setResultsOpen] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    fetch("/api/home", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setResultsOpen(!!d?.resultsOpen))
      .catch(() => {});

    fetch("/api/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.session) setSessionLabel(d.session);
      })
      .catch(() => {});

    fetch("/api/notices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setNotices(Array.isArray(d?.notices) ? d.notices : []);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="hm">
      <header className="hm-top">
        <div className="hm-top-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/kps-logo.png"
            alt="De Kings Perfection Private School Logo"
          />
          <h1>DE KINGS PERFECTION PRIVATE SCHOOL</h1>
        </div>
      </header>

      <main className="hm-main">
        <section className="hm-hero">
          <span className="hm-session">
            {sessionLabel
              ? `${sessionLabel.replace("/", " / ")} `
              : ""}
            ACADEMIC SESSION
          </span>

          <h2>Academic and Moral Excellence</h2>

          <p>
            Welcome to De Kings Perfection Private School.
            Parents and students can check results securely online.
          </p>

          <div className="hm-actions">
            <Link className="hm-btn" href="/dashboard">
              Student Dashboard
            </Link>

            {resultsOpen && (
              <Link
                className="hm-btn hm-btn-outline"
                href="/results"
              >
                Check Student Result
              </Link>
            )}
          </div>
        </section>

        {notices.length > 0 && (
          <section
            className="hm-notice-section"
            aria-labelledby="hm-notices-title"
          >
            <div className="hm-section-heading">
              <h2 id="hm-notices-title">
                School Announcements
              </h2>
              <p>Latest notices from the school.</p>
            </div>

            <div className="hm-cards hm-notices">
              {notices.map((n) => (
                <article className="hm-card" key={n.id}>
                  <h3>{n.title}</h3>

                  <small className="hm-notice-date">
                    {n.postedAt
                      ? new Date(n.postedAt).toLocaleDateString()
                      : ""}
                  </small>

                  <p className="hm-notice-body">
                    {n.body}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section
          className={`hm-cards hm-info-cards${
            notices.length > 0 ? " hm-info-after-notices" : ""
          }`}
          aria-label="School information"
        >
          <article className="hm-card">
            <h3>Results Portal</h3>
            <p>
              Use your Student Login ID and 4-digit PIN
              to view and print your result.
            </p>
          </article>

          <article className="hm-card">
            <h3>Our Motto</h3>
            <p>
              Academic and Moral Excellence in every child.
            </p>
          </article>

          <article className="hm-card">
            <h3>Visit Us</h3>
            <p>
              13, Abosule Street, Agbado Crossing,
              Ogun State.
            </p>
          </article>
        </section>
      </main>

      <footer className="hm-foot">
        <strong>De Kings Perfection Private School</strong>
        <div>
          {sessionLabel ? `${sessionLabel} ` : ""}
          Academic Session
        </div>
      </footer>
    </div>
  );
}
