# Stage 13 — Admin correction notifications

Requires Stage 12 migration and routes to be installed and working.

## Install
Copy the two `app/` files into your DKPS project, preserving paths. No SQL migration.

## Behavior
- Admin sidebar shows a Correction Requests link and a pending-request badge.
- Badge checks the existing authenticated Stage 12 admin endpoint on navigation and every 30 seconds.
- Requests remain listed once in the Stage 12 review page; approving/rejecting removes them from the pending count.
- Teacher correction history now highlights pending, approved and rejected states.
- A failed request displays no badge, never a false zero.

## Verify
Run `npm run build`. Submit a sample correction as a teacher, sign in as admin, check badge and open Correction Requests. Approve/reject, confirm count drops and teacher sees status after refresh.

## Limitation
This is an in-app pending-requests notification, not email, push, or a per-admin read/unread inbox. The Stage 12 API returns at most 200 requests, so the badge counts pending requests in that returned window, not necessarily all historical pending requests.
