# DKPS Website

The official website and school portal for **De Kings Perfection Private School**, Agbado Crossing, Ogun State, Nigeria.

Parents and students can check results, take computer-based tests and exams, and do assignments online. School staff manage students, scores, terms and tests from a protected admin portal.

> **Status:** in active development for the 2026/2027 academic session. Some features have been tested in real use and others are still being verified; see [Project status](#project-status).

---

## Features

### Students and parents
- **Student dashboard** (`/dashboard`): one sign-in with Login ID and a 4-digit PIN. It shows results, open tests and exams, and assignments.
- **Result portal** (`/results`): view and print the result for a term. Students linked to a previous Login ID can switch between terms and sessions.
- **Tests and exams (CBT)** (`/cbt`): timed multiple-choice tests and exams, marked automatically. One attempt per student, answers saved as they go, and the server enforces the deadline. Correct answers never leave the server.
- **Assignments** (`/assignments`): students read the task, type an answer, attach JPG, PNG or PDF files, and see the teacher's mark and comment.
- Tests and assignments open only from the dashboard.

### School staff (admin portal, `/admin`)
- **Students and PINs**: add students in bulk and get Login IDs and PINs to print.
- **SSS subjects**: set each SSS student's stream and subjects.
- **Scores and results**: download an Excel template, upload CA and exam scores, save them and publish results.
- **Tests and exams**: create tests and exams, paste questions, publish, edit or delete, see results, and build exams from a question bank.
- **Terms and sessions**: add a session with its three terms and choose the current term.

---

## Tech stack

| Area | Technology |
| --- | --- |
| Framework | [Next.js](https://nextjs.org) 16 (App Router, `cacheComponents` enabled) |
| UI | React 19, TypeScript, custom CSS |
| Database and storage | [Supabase](https://supabase.com) (PostgreSQL, Storage) via `@supabase/supabase-js` |
| Excel import and export | `xlsx` |
| Hosting | [Vercel](https://vercel.com) |

All database access goes through server-side API routes using the Supabase service key. The browser never receives the service key.

---

## Getting started

### Requirements
- Node.js 20 or newer
- A Supabase project
- A Vercel account (for deployment)

### 1. Clone and install

```bash
git clone <your-repository-url>
cd dkps-website
npm install
```

### 2. Environment variables

Create a file called `.env.local` in the project root:

```env
SUPABASE_URL=your-supabase-project-url
SUPABASE_SECRET_KEY=your-supabase-service-role-key
ADMIN_KEY=your-admin-password
```

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SECRET_KEY` | The Supabase **service** key. Server only. Never expose it in browser code. |
| `ADMIN_KEY` | The password for the admin portal. You can give several admins their own key by separating keys with commas. |

Never commit `.env.local`. Add the same three variables in Vercel under **Settings, Environment Variables** for the Production environment, then redeploy.

### 3. Set up the database

Run the SQL files in the `supabase/` folder in the Supabase SQL editor:

- `2026-2027-setup.sql`
- `broadsheet-setup.sql`
- `cbt-setup.sql`

After creating or changing database functions, refresh the API cache:

```sql
notify pgrst, 'reload schema';
```

Row Level Security is switched on for every table. The server routes use the service key, so access rules are enforced in the API code as well as in the database.

### 4. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Build for production (run this before pushing to catch errors) |
| `npm start` | Run the production build |
| `npm run lint` | Check the code with ESLint |

---

## Project structure

```
app/
  page.tsx            Home page
  dashboard/          Student dashboard
  results/            Result portal
  cbt/                Student tests and exams
  assignments/        Student assignments
  admin/              Admin portal
    students/         Add students and print credentials
    electives/        SSS streams and subjects
    broadsheet/       Scores upload and publishing
    cbt/              Create and manage tests and exams
    terms/            Terms and sessions
  api/
    admin/            Admin API routes (protected by the admin key)
    cbt/, assignments/, dashboard/, home/, result/, session/
lib/
  admin.ts            Admin key check and Supabase service client
  supabase/           Supabase client helpers
supabase/             SQL setup files
public/assets/        Logo and images
```

---

## How it works

**Login IDs.** A Login ID looks like `DKPS` + level code + class digit + 3-digit number, for example `DKPSPRY2001`. Numbers keep counting up and an ID is never reused, so a new student cannot see an old student's results. Old results stay under old IDs, and an admin can link a new ID to a previous one so a parent can see last session's results.

**PINs.** PINs are random 4-digit numbers, stored as bcrypt hashes and shown once when a student is created. They cannot be recovered; a lost PIN needs a reset. Repeated wrong attempts lock a login for 15 minutes.

**Results.** Staff upload CA and exam scores from Excel and publish. Publishing builds a result row for every active student in the class (total, average and grade, with the school's remarks). Grade bands: A 70 and above, B 60, C 50, D 45, E 40, F below 40.

**Tests and exams.** A test is out of 20 or 40 marks and an exam is out of 60. Exam scores can feed the report card. Tests and exams can be built from a shared question bank.

**Sessions and terms.** The current term decides the session label shown across the site. Staff change it from the Terms page, not in the code.

---

## Security notes

- Keep `SUPABASE_SECRET_KEY` and `ADMIN_KEY` out of the repository and out of any client-side code.
- The admin portal is protected by a shared key that every admin API route checks. Teachers do not yet have individual accounts.
- Student PINs are hashed. Test and exam answers are checked on the server.
- Page-level guards (for example the dashboard-only rule for tests and assignments) are conveniences. The real protection is the server checking the Login ID and PIN on every request.
- Report a security problem to the school administrator rather than opening a public issue.

---

## Deployment

The site is deployed on Vercel from the `main` branch. Every push to `main` starts a new build.

1. Check locally with `npm run build`.
2. Commit and push to GitHub.
3. Open the Vercel dashboard and wait for the newest deployment to show **Ready**.

If a build fails, the previous version stays live. Environment variable changes only apply after a redeploy.

---

## Project status

**Working in real use:** admin sign-in, adding students, term management, creating tests and adding questions, the student dashboard sign-in flow, and the home page.

**Built, still being verified end to end:** taking and submitting a test, Excel upload and publishing, viewing a published result, editing and deleting tests and questions, assignments marking.

**Planned:** student management (edit, deactivate, move class, reset PIN), automatic remarks, admin-key lockout, end-of-session class promotion, teacher accounts, and class notes.

---

## Notes for contributors

- This project uses a recent Next.js whose behaviour differs from older versions. Read `AGENTS.md` and the Next.js docs in `node_modules/next/dist/docs/` before changing framework-level code.
- Avoid calling `Date.now()` directly while rendering; wrap it in a small helper.
- Keep database access in server API routes; do not import the service key into client components.
- Do not delete data from the database without checking first. Prefer deactivating records.

---

## License

All rights reserved by De Kings Perfection Private School unless stated otherwise. Add a license here if the project becomes open source.
