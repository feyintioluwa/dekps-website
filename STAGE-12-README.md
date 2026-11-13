# Stage 12 — Published result corrections

1. Run `supabase/stage12-published-corrections.sql` in Supabase SQL Editor.
2. Deploy the new API routes and pages.
3. Teacher: `/teacher/published-corrections` — request a correction to a published mark.
4. Admin: `/admin/published-corrections` — approve or reject.
5. Test with a *test student* whose result is published; confirm the source score, `student_results.subjects`, total, average and grade update on approval, and that rejection changes none of them.

Important: The SQL function updates only the relevant published student's subject snapshot and recomputes total/average/grade. Existing school/teacher remarks remain unchanged, even if the grade changes. Admin should review remarks after approval. No auto-generated remark is silently substituted.

The existing `admin_publish_results` can republish the whole class. Its definitions were supplied by the user and the migration deliberately avoids calling it on every approval, to prevent unrelated student results from changing.

A teacher can request correction for a previously published term, including locked terms. Only the admin RPC can modify the published snapshot. The database migration restricts direct access to the request table. Verify the migration and behavior in staging before production.

This patch has not been validated against the live database or a full Next.js build. It does not implement Stage 13 notifications.
