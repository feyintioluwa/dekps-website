# DKPS Teacher Mobile Navigation and Header Bell

Replace these three files at the matching paths:
- `app/teacher/TeacherMobileNav.tsx`
- `app/teacher/page.tsx`
- `app/teacher/teacher-header-notifications.css`

Changes: mobile nav Home / Tasks / Scores / Classes / More; notifications bell visible in dashboard header on mobile; removed old Alerts deep-link behavior. Desktop bell and notifications API remain intact. Other teacher pages do not get a bell.

Based on the latest files shared in this conversation. Run `npx eslint app/teacher/page.tsx app/teacher/TeacherMobileNav.tsx` and `npm run build` locally. Full-project build not verified.
