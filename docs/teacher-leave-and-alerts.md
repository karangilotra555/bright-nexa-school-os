# Teacher leave and Android period alerts

Teacher App has Leave and My attendance under More. Admin opens the queue from Teaching Staff attendance or the School Timetable. Reports & Payroll uses approved leave alongside the existing monthly salary and paid-leave allowance. Partial leave uses the share of the school day between the first and last teaching bell. A missing bell schedule flags the affected estimate for review.

Set the room number in each weekly draft and publish. Today, substitute assignments and notifications use that published schedule. Admin can refine cover drafts through the existing AI provider and publish covers per date.

## Release setup

1. Apply both new migrations before publishing the website. They preserve existing attendance and salary records.
2. Use a Firebase Android registration for com.brightnexa.school with FCM enabled. Set repository Actions variables FCM_APP_ID, FCM_API_KEY, FCM_SENDER_ID and FCM_PROJECT_ID from the matching Android client configuration. Install the updated APK and enable alerts in Teacher App → Timetable.
3. Deploy the school-teacher-period-alerts Edge Function. Set the TEACHER_PERIOD_FCM_SERVICE_ACCOUNT secret to an FCM sender credential for the same Firebase project. Generate TEACHER_PERIOD_SCHEDULER_SECRET, put the same value in Vault as teacher_period_scheduler_secret, and set school_project_url to the Supabase project URL. Enable Supabase Cron and pg_net and apply supabase/teacher-period-alert-cron.sql.
4. In a test school, check planned and emergency requests, approval, cover publication, salary impact and teacher attendance. Lock an Android test phone and verify a period-end notification includes the next class, room and actual start time. Verify school/teacher switching and sign-out clear old notifications.

To pause push delivery, unschedule the bright-nexa-teacher-period-alerts job. This preserves registrations and attendance, leave and cover records. App rollback is independent of the additive database changes.

## Urgent circular Android alerts

1. Apply `20261118110000_urgent_circular_android_alerts.sql` after the two Leadership migrations. It creates private device registrations and a bounded delivery queue. Publishing an urgent circular commits the notice, its audit entry and eligible device deliveries together.
2. Redeploy `school-teacher-period-alerts` with `verify_jwt = false` and its dedicated `x-scheduler-secret` check. Use the same `TEACHER_PERIOD_FCM_SERVICE_ACCOUNT` and `TEACHER_PERIOD_SCHEDULER_SECRET` Edge secrets, `teacher_period_scheduler_secret` and `school_project_url` in Vault, and the existing `bright-nexa-teacher-period-alerts` minute job. Put secret values in the provider's secret settings. Keep them out of source and build logs. If the job is absent, apply `supabase/teacher-period-alert-cron.sql` after provisioning Cron, pg_net and Vault entries.
3. Build and publish the signed `school-app-v0.5.3` update for `com.brightnexa.school` from the existing APK workflow and Firebase Android client variables. Keep the existing signing certificate and verify the release asset before distributing. On the supported hosted Android app, sign in and tap **Enable urgent alerts** from Parent **Messages** or Teacher **School notices**, then allow Android notifications. Each portal has its own opt-in.
4. From a test school, publish one urgent circular to enrolled Teacher and Parent devices with Android notifications enabled and screens locked. Check a different school's installed devices, disabled guardians and signed-out installations as negative cases. Tap each alert and verify it opens the appropriate signed-in inbox. Confirm a retry leaves one card and Teacher period, leave and cover notifications still work. The queue retries within a 20-minute window. The Leadership view reports Firebase acceptance separately from phone receipt.

To pause only urgent delivery, redeploy the previous Edge Function revision while leaving the minute job enabled for Teacher alerts. This preserves existing circulars and scheduling records. To roll back queue writes, restore the previous `bn_leadership_publish_urgent_notice` implementation from `20261118100000_leadership_pulse_notice_finance.sql` and leave the additive private tables in place for inspection. Older app versions can still read the school notice feed.
