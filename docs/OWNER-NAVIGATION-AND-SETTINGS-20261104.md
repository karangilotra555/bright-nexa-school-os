# Bright Nexa School OS — Owner navigation & Settings architecture
Date: 2026-11-04

## Information architecture
All **24 original** module destinations remain; each appears **once** in the organized sidebar. No historical school record is reset.

| Sidebar group | Destinations |
|---|---|
| Overview | Dashboard |
| People & Admissions | Students; Teachers; Non-Teaching Staff |
| Academics | Class & Section Setup; Attendance; Exams & Marks; Report Cards; Homework & Notices; AI Teacher Tools |
| School Operations | Transport & Routes; Infrastructure & Assets; Parent Messages |
| Finance | Fees; Expenses & Budget |
| Insights & Growth | School Quality Score; Growth Passport; Opportunity Desk |
| Workspace | School Profile; Teachers Online Access; Parents App; Smart Tools |
| Administration | Settings; Contact & Support |

- Search module input lives above sidebar groups. Active destination is highlighted and the mobile menu can collapse.
- Persistent top bar has verified school name, Refresh, Settings and Logout only.
- Quick action School notices routes to the actual Homework & Notices module, not a dead placeholder.
- Settings contains six clear groups, and dashboard no longer exposes backup controls.

## Settings sections
1. **School profile:** verified cloud name, status, academic years and record counts; official school name and contact number can be changed by authenticated owners with confirmed server responses. School Profile sidebar entry also links here.
2. **Accounts & security:** links to existing school roles/class permissions, password change and guardian/teacher portals. Role permissions remain enforced by Supabase RLS, not by sidebar visibility.
3. **Backup & recovery:** passwordless AES-256-GCM folder selection/change, manual and periodic backup, permission refresh, recovery key export/import, encrypted file verification, with clear notes about browser needing to remain open.
4. **Offline access:** separate encrypted read-only offline school copy, opt-in, with separate passphrase; no offline writes or sync claims.
5. **Display & navigation:** compact/comfortable layout and default landing page. These preferences persist only in browser localStorage with per-school, per-auth-user key; **no personal student data or credentials**.
6. **System & support:** verified scope, data hosting and contact directory/academic links.

### Cloud security migration
`20261104082500_owner_profile_settings.sql`
- Restricts existing broad `authenticated` UPDATE on `institutions` to **name** column only.
- Adds owner-role-only row UPDATE policy with 3–120-char name validation; authenticated clients cannot update institution ID or status.
- Permits owner-role-only `school_contact_profiles.contact_mobile` editing with format check; owner email is immutable through this settings UI.
- RLS continues to be authoritative. No service-role key or server secret appears in a public JS bundle.

### Compatibility
- Existing 24 module labels are preserved; data handling for attendance, admissions, fees, staff and generic modules has not been rewritten.
- Root school login, verified teacher/parent portals, school account/password routing and automatic backup encryption are unchanged.
- Offline worker cache version incremented to include UI CSS, grouped navigation and settings modules.
- A connected, authenticated owner browser is required to verify actual profile updates end-to-end. CI tests alone do not prove authenticated UI writes.
