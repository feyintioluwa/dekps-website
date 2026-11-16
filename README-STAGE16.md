# DKPS Stage 16 — Offline Recovery

## Files
- `lib/teacher-offline-drafts.ts` — browser draft storage, 7-day expiration
- `app/teacher/broadsheet/page.tsx` — automatic unsaved mark backups, explicit restore/discard, conflict-safe protected saves
- `app/teacher/scores/page.tsx` — recover Excel upload and use protected saves in <=400-entry batches

## Required existing API change
In **both** return branches of `app/api/teacher/me/route.ts`, include `id: teacher.id` in the returned `teacher` object. Keep all existing fields and permissions.

## Notes
- Do not automatically upload restored scores. Verify current term, teacher access, locks and approvals on the server.
- Browser localStorage is not encrypted; avoid shared devices. Clear teacher drafts on explicit logout if desired.
- If an Excel save loses connection mid-request, the outcome is uncertain: verify against a fresh template, do not blindly retry.
- Excel upload protected-save baseline is captured when the file is parsed. Any intervening server change returns conflict rather than overwriting.
- Do not deploy before `npm run build` and manual testing with two teachers, term lock, score approval, offline/online, refresh and conflicting edits.
- This package is source patches, not a complete application; place files at the paths shown.
