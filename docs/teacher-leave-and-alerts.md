# Teacher leave and Android period alerts

Teacher App has Leave and My attendance under More. Admin opens the queue from Teaching Staff attendance or the School Timetable. Reports & Payroll uses approved leave alongside the existing monthly salary and paid-leave allowance. Partial leave uses the share of the school day between the first and last teaching bell. A missing bell schedule flags the affected estimate for review.

Set the room number in each weekly draft and publish. Today, substitute assignments and notifications use that published schedule. Admin can refine cover drafts through the existing AI provider and publish covers per date.

## Release setup

1. Apply both new migrations before publishing the website. They preserve existing attendance and salary records.
2. Use a Firebase Android registration for com.brightnexa.school with FCM enabled. Set repository Actions variables FCM_APP_ID, FCM_API_KEY, FCM_SENDER_ID and FCM_PROJECT_ID from the matching Android client configuration. Install the updated APK and enable alerts in Teacher App → Timetable.
3. Deploy the school-teacher-period-alerts Edge Function. Set the TEACHER_PERIOD_FCM_SERVICE_ACCOUNT secret to an FCM sender credential for the same Firebase project. Generate TEACHER_PERIOD_SCHEDULER_SECRET, put the same value in Vault as teacher_period_scheduler_secret, and set school_project_url to the Supabase project URL. Enable Supabase Cron and pg_net and apply supabase/teacher-period-alert-cron.sql.
4. In a test school, check planned and emergency requests, approval, cover publication, salary impact and teacher attendance. Lock an Android test phone and verify a period-end notification includes the next class, room and actual start time. Verify school/teacher switching and sign-out clear old notifications.

To pause push delivery, unschedule the bright-nexa-teacher-period-alerts job. This preserves registrations and attendance, leave and cover records. App rollback is independent of the additive database changes.
