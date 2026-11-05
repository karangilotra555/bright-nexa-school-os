# Student app login

The installed Parents APK opens `/parents.html`. ID is the student admission number. Initial password is the 10-digit registered guardian mobile from `school_student_profiles.guardian_phone`. Missing mobile records cannot create an account; existing records are never guessed or overwritten.

`school-student-login` resolves the active student in the selected institution. The current default is the existing Haridwar Public School. Other deployments can pass `?school=<institution UUID>`. Internal synthetic Auth email identifiers are never displayed or emailed. Passwords are hashed by Supabase Auth, not saved in app storage.

First login requires a password change before records are accessible. Profile provides subsequent password changes. Old mobile passwords never reset an existing account. Server-controlled app metadata and the three existing private parent RLS helpers prevent initial JWTs from reading student records after password rotation. Password changes revoke refresh sessions and reject stale initial-password JWTs.

Login attempts are throttled in a service-only private table: 10 per admission number and 60 per source IP in 15 minutes. The Edge Function authenticates initial credentials itself and verifies Auth user JWTs for password changes. Service credentials stay in the function environment.

Deploy `supabase/parent-admission-auth.sql`, deploy the Edge Function with `verify_jwt=false` (the function performs its own authentication), then deploy `docs/`. Staff authentication and institution boundaries remain intact.

Rollback: restore the previous portal and disable the new Edge Function. Do not delete student records, guardian links or existing users. The additive private throttle table can remain; legacy guardian tokens have no initial-password flag.
