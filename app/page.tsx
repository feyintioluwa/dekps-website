
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

const navigation = [
  { label: "Home", href: "#home" },
  { label: "About", href: "#about" },
  { label: "Academics", href: "#academics" },
  { label: "School Life", href: "#school-life" },
  { label: "Contact", href: "#contact" },
];

export default function Home() {
  const [resultsOpen, setResultsOpen] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

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
      .then((d) =>
        setNotices(Array.isArray(d?.notices) ? d.notices : [])
      )
      .catch(() => {});
  }, []);

  return (
    <div className="hm" id="home">
      <div className="hm-utility">
        <div className="hm-container">
          <span>Academic and Moral Excellence</span>
          <div>
            <Link href="/dashboard">Student Portal</Link>
            <Link href="/teacher">Staff Portal</Link>
          </div>
        </div>
      </div>

      <header className="hm-header">
        <div className="hm-container hm-header-inner">
          <Link
            href="/"
            className="hm-brand"
            aria-label="DKPS homepage"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/kps-logo.png"
              alt="DKPS school crest"
            />
            <span>
              <strong>DE KINGS PERFECTION</strong>
              <small>PRIVATE SCHOOL</small>
            </span>
          </Link>

          <button
            className="hm-menu-toggle"
            type="button"
            aria-label={
              menuOpen ? "Close navigation" : "Open navigation"
            }
            aria-expanded={menuOpen}
            aria-controls="hm-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? "✕" : "☰"}
          </button>

          <nav
            id="hm-nav"
            className={`hm-nav ${menuOpen ? "hm-nav-open" : ""}`}
            aria-label="Main navigation"
          >
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}

            <Link
              className="hm-nav-portal"
              href="/dashboard"
              onClick={() => setMenuOpen(false)}
            >
              Portal Login <span aria-hidden="true">↗</span>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section
          className="hm-hero"
          aria-labelledby="hm-hero-heading"
        >
          <div className="hm-hero-photo" aria-hidden="true" />

          <div className="hm-container hm-hero-content">
            <span className="hm-eyebrow">
              <span className="hm-eyebrow-line" />
              WELCOME TO DE KINGS PERFECTION PRIVATE SCHOOL
            </span>

            <h1 id="hm-hero-heading">
              A foundation for <em>greatness.</em>
            </h1>

            <p>
              Where a love for learning meets strong values,
              confidence, and the opportunity for every child
              to thrive.
            </p>

            <div className="hm-hero-actions">
              <a
                href="#about"
                className="hm-button hm-button-gold"
              >
                Discover DKPS <span aria-hidden="true">↗</span>
              </a>

              <Link
                href="/dashboard"
                className="hm-button hm-button-outline"
              >
                Student Portal <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <div className="hm-hero-bottom">
            <div className="hm-container">
              <span>LEARNING</span>
              <i />
              <span>CHARACTER</span>
              <i />
              <span>EXCELLENCE</span>
            </div>
          </div>
        </section>

        <section className="hm-intro hm-section" id="about">
          <div className="hm-container hm-intro-grid">
            <div>
              <span className="hm-section-kicker">
                GET TO KNOW US
              </span>

              <h2>
                Inspiring minds.
                <br />
                <em>Shaping futures.</em>
              </h2>
            </div>

            <div className="hm-intro-copy">
              <p>
                At De Kings Perfection Private School, we
                believe education is about more than the
                classroom. We are committed to nurturing
                curiosity, encouraging good character, and
                helping children grow with confidence.
              </p>

              <p>
                Our guiding principle is simple:{" "}
                <strong>Academic and Moral Excellence.</strong>
              </p>

              <a className="hm-text-link" href="#academics">
                Explore our approach{" "}
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>

        <section
          className="hm-academics hm-section"
          id="academics"
        >
          <div className="hm-container">
            <div className="hm-section-heading">
              <div>
                <span className="hm-section-kicker">
                  THE DKPS EXPERIENCE
                </span>

                <h2>
                  Learning with <em>purpose.</em>
                </h2>
              </div>

              <p>
                Building the skills, values, and confidence
                children need for the future.
              </p>
            </div>

            <div className="hm-feature-grid">
              <article className="hm-feature">
                <div
                  className="hm-feature-image hm-feature-learning"
                  role="img"
                  aria-label="Illustrative stock photograph of a learning environment"
                />

                <div className="hm-feature-body">
                  <span>01 / LEARNING</span>
                  <h3>Academic Growth</h3>
                  <p>
                    Encouraging curiosity, creativity, and a
                    strong foundation for lifelong learning.
                  </p>
                </div>
              </article>

              <article className="hm-feature">
                <div
                  className="hm-feature-image hm-feature-character"
                  role="img"
                  aria-label="Illustrative stock photograph of students working together"
                />

                <div className="hm-feature-body">
                  <span>02 / VALUES</span>
                  <h3>Character &amp; Values</h3>
                  <p>
                    Helping children develop integrity,
                    respect, responsibility, and kindness.
                  </p>
                </div>
              </article>

              <article className="hm-feature">
                <div
                  className="hm-feature-image hm-feature-future"
                  role="img"
                  aria-label="Illustrative stock photograph of students in a school setting"
                />

                <div className="hm-feature-body">
                  <span>03 / OPPORTUNITY</span>
                  <h3>Room to Thrive</h3>
                  <p>
                    Creating an encouraging environment where
                    every child can discover their potential.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section
          className="hm-portal-section"
          id="school-life"
        >
          <div className="hm-container hm-portal-grid">
            <div>
              <span className="hm-section-kicker hm-section-kicker-light">
                YOUR SCHOOL, CONNECTED
              </span>

              <h2>
                Everything you need,
                <br />
                <em>in one place.</em>
              </h2>

              <p>
                Access learning resources, assignments,
                examinations, and academic information
                through our secure school portals.
              </p>
            </div>

            <div className="hm-portal-links">
              <Link href="/dashboard">
                <span>
                  <small>FOR STUDENTS &amp; PARENTS</small>
                  <strong>Student Dashboard</strong>
                </span>
                <b aria-hidden="true">↗</b>
              </Link>

              <Link href="/teacher">
                <span>
                  <small>FOR EDUCATORS</small>
                  <strong>Teacher Portal</strong>
                </span>
                <b aria-hidden="true">↗</b>
              </Link>

              {resultsOpen && (
                <Link href="/results">
                  <span>
                    <small>AVAILABLE NOW</small>
                    <strong>Check Student Results</strong>
                  </span>
                  <b aria-hidden="true">↗</b>
                </Link>
              )}
            </div>
          </div>
        </section>

        {notices.length > 0 && (
          <section
            className="hm-section hm-notices"
            id="notices"
          >
            <div className="hm-container">
              <span className="hm-section-kicker">
                LATEST UPDATES
              </span>

              <h2>
                School <em>announcements.</em>
              </h2>

              <div className="hm-notice-grid">
                {notices.map((notice) => (
                  <article
                    className="hm-notice"
                    key={notice.id}
                  >
                    <time dateTime={notice.postedAt}>
                      {Number.isNaN(
                        Date.parse(notice.postedAt)
                      )
                        ? "School update"
                        : new Date(
                            notice.postedAt
                          ).toLocaleDateString("en-GB", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                    </time>

                    <h3>{notice.title}</h3>
                    <p>{notice.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        <section
          className="hm-contact hm-section"
          id="contact"
        >
          <div className="hm-container hm-contact-inner">
            <div>
              <span className="hm-section-kicker">
                FIND US
              </span>

              <h2>
                Come and <em>say hello.</em>
              </h2>

              <p>
                We look forward to welcoming you to
                De Kings Perfection Private School.
              </p>
            </div>

            <div className="hm-address">
              <span>OUR LOCATION</span>

              <address>
                13, Abosule Street,
                <br />
                Agbado Crossing, Ogun State.
              </address>

              <a
                href="https://www.google.com/maps/search/?api=1&query=13+Abosule+Street+Agbado+Crossing+Ogun+State"
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions{" "}
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="hm-footer">
        <div className="hm-container hm-footer-main">
          <div className="hm-footer-brand">
            <strong>
              DE KINGS PERFECTION
              <br />
              PRIVATE SCHOOL
            </strong>

            <p>Academic and Moral Excellence.</p>
          </div>

          <div>
            <span>EXPLORE</span>
            <a href="#about">About DKPS</a>
            <a href="#academics">Academics</a>
            <a href="#contact">Contact</a>
          </div>

          <div>
            <span>PORTALS</span>
            <Link href="/dashboard">Student Portal</Link>
            <Link href="/teacher">Teacher Portal</Link>

            {resultsOpen && (
              <Link href="/results">Check Results</Link>
            )}
          </div>
        </div>

        <div className="hm-container hm-footer-bottom">
          <span>
            © 2026 De Kings Perfection Private School
          </span>

          <span>
            {sessionLabel
              ? `${sessionLabel} Academic Session`
              : "Academic and Moral Excellence"}
          </span>
        </div>
      </footer>
    </div>
  );
}
