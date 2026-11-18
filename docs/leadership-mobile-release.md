# Bright Nexa Leadership Mobile

In the shared Bright Nexa Android app, use Teacher / Staff Login with the existing school staff email and password. The app uses the verified school membership to open the Owner, Principal or Teacher workspace. The same Android app also provides Student / Parent Login.

- **Home** shows recorded attendance, timetable coverage, the leave queue and a read-only summary of posted fee payments. Missing or incomplete data stays blank.
- **Leave and covers** uses Supabase to find eligible substitutes. Review the proposal before approving leave or publishing covers. Open the School Timetable from the desktop ERP and choose a date range to see or print the effective published schedule, including substitutes.
- **Urgent circulars** save an official notice to the school feed. Eligible Parent and Teacher installations that enable school alerts can receive an Android notification. The lock-screen notification directs the recipient to the authenticated notice.

## Release order

1. Confirm the target is the Bright Nexa School OS Supabase project and that its November 17 teacher leave and attendance functions are present.
2. Apply these migrations in order.
   - `20261118093000_principal_leave_approvals.sql`
   - `20261118100000_leadership_pulse_notice_finance.sql`
   - `20261118102000_school_dated_timetable.sql`
   - `20261118110000_urgent_circular_android_alerts.sql`
3. Configure and deploy the school alert sender for the same Firebase project as the shared APK. Follow [Teacher leave and alerts](teacher-leave-and-alerts.md) for the credentials, worker, scheduler and APK requirements.
4. Verify production functions and school-scoped permissions. Validate on disposable fixtures that a teacher and parent receive their own school's notification on locked devices, that a second school receives nothing, and that a published cover appears on the desktop dated schedule and printout.
5. Publish the hosted app and shared Android APK from the verified release commit. Check the hosted Android entry with both a verified Owner and a verified Principal.

The previous app release can be restored independently of the database. Preserve leave, cover and notice records when changing a release. If the alert worker needs to be paused, use the scheduler controls in the alert setup guide.
