# DKPS Teacher Profile Photos + Dashboard Polish

1. Back up your working project or commit it first.
2. Copy the supplied `app/` and `supabase/` files into the matching project folders.
3. In your Supabase project's SQL Editor, run `supabase/teacher-profile-photos.sql` once. This creates a private bucket and a photo-path table. It does not modify existing teacher records.
4. Run `npm install` (if needed) and `npm run build` locally.
5. Sign in as a teacher. On `/teacher/profile`, upload a JPG, PNG or WebP photo up to 2 MB; confirm it appears on the dashboard avatar. Test replacing and removing it. Test mobile.
6. Only commit after build and upload/remove tests pass.

**Security:** Upload/delete/read routes check the existing teacher session, and photo paths are scoped to the authenticated teacher ID. Files are stored in a private Supabase Storage bucket; image display uses short-lived signed URLs. Do not expose `SUPABASE_SECRET_KEY` to the browser.

**Notes:** Profile photos require the SQL migration. The signed image URL expires after 10 minutes; refreshing the page retrieves a fresh one. No image cropping is included. Existing dashboard behavior and score logic are untouched.
