# Bright Nexa School OS — permanent regression protection rules
Updated: 2026-11-13

The owner requires that once a working feature is fixed, later changes MUST NOT silently remove, hide, rebuild, or break it. Keep existing look and layout, sidebar and menu sequence, navigation routes, forms and fields, saved records, buttons, data exports, mobile workflows and backend authorization.

## Protected workflows
- Teacher: Add Teacher, professional details, photos, Save Teacher with visible validation, View Faculty Profile, **Edit Teacher visible in the profile header**, legacy footer Edit Profile, Delete Profile, Create / Sync Teacher App Access, assigned classes and subjects.
- Student: admission edit/save, photo preview and cloud upload, student/parent access and correct record visibility.
- Access: Owner/School Admin/staff web permissions, assigned Teacher mobile permissions, email confirmation, secure invited-account activation, logout and password recovery.
- Cloud: Supabase remains primary persistent database. Never report a local or unverified save as published. Retain recovery data on timeout/conflict; verify readback and avoid duplicates.
- Teacher/student photo compression must not erase or replace the original user-selected photo with a broken placeholder.
- Preserve previously completed features in class management, timetable, attendance, fees, reports, notices, assignments and sidebar navigation.

## Release requirements
1. Fix root cause in the actual component; avoid covering a broken control with a false-success message.
2. Update source, hosted bundle, docs/ mirror, desktop dist/ mirror and SW precache revisions consistently.
3. Add executable regression checks to scripts/verify-release-snapshot.cjs for each newly fixed issue.
4. Confirm release gate succeeds and Render is actually live on the intended commit.
5. Read back any affected Supabase data before claiming real-world save success.
6. Do not delete existing school data, overwrite unsynced browser drafts, relax RLS, or redesign modules to fix a local bug.

Current regression protection enforces teacher Edit header + footer, Teacher App access, Delete Profile, Save Teacher validation, bundle/doc mirrors and Workbox integrity. Extend the tests when future features are fixed.
