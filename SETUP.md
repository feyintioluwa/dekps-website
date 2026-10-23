# DKPS 2026/2027 update: how to apply (one step at a time)

1. Unzip this over your dkps-website folder (it overwrites app/layout.tsx, app/page.tsx,
   app/results/page.tsx, app/api/result/route.ts and adds the new files).
2. Add to .env.local AND Vercel env vars:  ADMIN_KEY=<a long secret you choose>
3. Supabase SQL editor: open supabase/2026-2027-setup.sql and run STEP A, then B.
4. Run the SELECT in STEP C to see your class names, then run one
   `update public.classes set id_prefix = '...' where name = '...'` per class
   (e.g. Basic 2 -> DKPSPRY2).
5. Run STEP D (the function).
6. Check bcrypt:  select pin_hash from public.students limit 1;  -> must start with $2
   (if not, tell me what it looks like).
7. npm run dev -> open /admin/students, enter ADMIN_KEY, paste names, create, print.
8. Do NOT put real student names in git. /admin/students has no other login, protected only by ADMIN_KEY.

## Tests & Exams (CBT)
1. Supabase SQL editor: run supabase/cbt-setup.sql.
2. Teachers/admin: /admin/cbt (same ADMIN_KEY). Create a test/exam, paste questions, press Publish.
3. Students: /cbt with the same Login ID + PIN as the results portal.
Notes: students get ONE attempt; answers autosave; time is enforced by the server;
"Finalize overdue" marks anyone who closed the browser. Only EXAM scores are copied into
the scores table (kind 'exam'). Test scores stay in attempts so they don't overwrite CA.

## Broadsheet, electives, CBT extras (v3)
1. Run:  npm install xlsx
2. Supabase SQL editor: run supabase/broadsheet-setup.sql
3. /admin is the menu. Order of use each term:
   a. /admin/electives  (SSS only) tick the subjects + students, pick stream, Apply.
      A student with NO elective rows gets the whole class subject list.
   b. /admin/broadsheet  choose term + class -> Download template -> teachers fill CA/Exam ->
      Upload -> Save scores -> Publish (type term name e.g. "First Term" and session "2026/2027").
      Total / average / grade are computed from CA + Exam.
4. Several teachers: set ADMIN_KEY to a comma list, e.g.  ADMIN_KEY=key-mrs-a,key-mr-b
   (individual named logins via Supabase Auth would be a separate, bigger step).
5. CBT: exams can pull random questions from tests of the same subject; each student sees
   questions in their own random order.
Assumes scores.kind values are 'ca' and 'exam'. If saving fails, tell me the error.

## Admin portal (v4)
Open /admin: sign in once with ADMIN_KEY, then use the sidebar (Dashboard, Students, SSS Subjects,
Scores & Results, Tests & Exams). The key is remembered for the browser tab only.

## SQL: run order (each file pasted whole, one at a time)
1. supabase/2026-2027-setup.sql  (you already did this part by hand)
2. supabase/broadsheet-setup.sql
3. supabase/cbt-setup.sql
