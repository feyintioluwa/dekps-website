import Link from "next/link";
import "./home.css";

export default function Home() {
  return (
    <div className="dkhome">
      <header className="dkhome-hero">
        <div className="dkhome-in">
          <div className="dkhome-brand">
            <span className="dkhome-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/kps-logo.png" alt="De Kings Perfection Private School logo" />
            </span>
            <div>
              <h1>De Kings Perfection Private School</h1>
              <p className="dkhome-place">Agbado Crossing, Ogun State, Nigeria</p>
            </div>
          </div>

          <p className="dkhome-lead">
            Students take their tests and exams and hand in their assignments here, using their own Login ID and PIN.
          </p>

          <div className="dkhome-actions">
            <Link href="/cbt" className="dkhome-btn primary">Take test or exam</Link>
            <Link href="/assignments" className="dkhome-btn ghost">Assignments</Link>
            {/* The "Check student result" button (link: /results) is hidden until results are published. */}
          </div>
        </div>
      </header>

      <main>
        <section className="dkhome-sec">
          <div className="dkhome-in dkhome-about">
            <div>
              <h2>About the school</h2>
              <p>
                De Kings Perfection Private School teaches children from Creche through to Senior Secondary 3, in one
                school community at Agbado Crossing.
              </p>
              <p>
                This website is where students sit their tests and exams on a computer or phone, and where they send in
                written work with photos or PDFs when a teacher sets an assignment. Parents and guardians will find
                published results here too, once the school releases them.
              </p>
            </div>
            <dl className="dkhome-facts">
              <div>
                <dt>Classes</dt>
                <dd>Creche, Nursery, Basic, Junior Secondary and Senior Secondary</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>13 Abosule Street, Agbado Crossing, Ogun State</dd>
              </div>
              <div>
                <dt>Student login</dt>
                <dd>Login ID and 4-digit PIN, given by the school</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="dkhome-sec alt">
          <div className="dkhome-in">
            <h2>What students can do here</h2>
            <div className="dkhome-feats">
              <div>
                <h3>Tests and exams</h3>
                <p>Timed multiple-choice questions, marked automatically. Answers are saved as the student goes, and each student has one attempt.</p>
              </div>
              <div>
                <h3>Assignments</h3>
                <p>Read the task, type an answer, and attach a photo or PDF of written work. The teacher marks it and leaves a comment.</p>
              </div>
              <div>
                <h3>Results</h3>
                <p>Report cards appear on this website once the school publishes them.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="dkhome-sec">
          <div className="dkhome-in dkhome-contact">
            <h2>Contact the school</h2>
            <p>
              13 Abosule Street, Agbado Crossing, Ogun State, Nigeria.
            </p>
            <p>
              If a student has lost a PIN, or a Login ID is not working, please visit the school office. The school can
              issue a new PIN.
            </p>
          </div>
        </section>
      </main>

      <footer className="dkhome-foot">
        <div className="dkhome-in">
          © {new Date().getFullYear()} De Kings Perfection Private School
        </div>
      </footer>
    </div>
  );
}
