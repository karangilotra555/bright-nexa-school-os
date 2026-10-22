# Bright Nexa Parents — Phase 1 pilot

## Status (2026-10-22)
Implemented in the same Node.js + SQLite School OS server:
- Mobile-first `/parents.html` with installable `/parents.webmanifest`
- Parent login via the **existing** `POST /api/auth/login` endpoint
- Authenticated `GET /api/parent/dashboard` (student identity, attendance, fees, class-specific homework, notices, leave history)
- Authenticated `POST /api/parent/leave` (parent submits leave request)
- School-admin-only `POST /api/parent/admin/publish` and `GET /api/parent/admin/leaves`
- Parent portal tests + GitHub Actions checks

### Pilot access
Start the existing School OS server with **Node 22+**, then open `/parents.html` on the same host. Log in using a school-enrolled student's admission number and date of birth; this is an **internal pilot authentication method**, not a public rollout recommendation.

Do **not** ask parents to use this version yet. A DOB is not a secret: verified guardian ownership and OTP/password sign-up must be added first.

### Publishing from School OS
The backend does not fabricate fee balances or attendance. The school's trusted admin sync client must publish data using its **server-side/admin configuration** — never expose the admin API key in JavaScript or the parent application:

```http
POST /api/parent/admin/publish
X-Admin-Key: <SECRET_ADMIN_KEY>
Content-Type: application/json
```

```json
{
  "attendance": [
    {"admissionNumber":"<EXISTING_STUDENT_ADMISSION>","day":"2026-10-22","status":"PRESENT"}
  ],
  "fees": [
    {"admissionNumber":"<EXISTING_STUDENT_ADMISSION>","dueRupees":24650}
  ],
  "homework": [
    {"id":"homework-unique-id","className":"Class I","section":"A","subject":"Math","title":"Page 12 exercises","dueDate":"2026-10-23"}
  ],
  "notices": [
    {"id":"notice-unique-id","title":"School Notice","body":"Message from school"}
  ]
}
```

Attendance statuses: PRESENT, ABSENT, LATE, LEAVE. All four arrays are optional, updates upsert by stable IDs, and invalid batches roll back atomically. Students must already exist in the synced School OS roster.

**Phase 1 limitation:** The school desktop application's attendance/fees/homework publish actions are NOT yet wired automatically to this endpoint. Existing `/api/sync/snapshot` handles student roster only. Live mobile updates require this separate publish operation for now. Parent-submitted leave requests are recorded in the same SQLite database and can be fetched by the admin API, but are not yet shown in the School OS dashboard.

### Before production / Phase 2
1. Guardian phone verification / OTP or secure password registration; protect sensitive child records.
2. Institute-wide `school_id` scoping for every table, access token and admin credential before serving multiple schools.
3. School desktop outbox: attendance, fees, homework and notices -> incremental publish; retry offline changes and resolve conflicts.
4. School dashboard inbox for leave requests, with approve/reject and updated parent status.
5. Proper hosted persistent database and HTTPS; deploy server separately from local-only desktop, plan costs and backups.
6. Android push notifications with approved device enrollment and rate limits.
7. End-to-end UI and Android PWA install test on a staging hostname.

## Verification
```sh
node --check server.js
node --check parent-portal.cjs
node --test tests/parent-portal.test.cjs
npm test
```
