# Bright Nexa Leadership Mobile — release note (draft PR)

This is a new Owner + Principal mobile portal, not a replacement for the existing ERP or Teacher/Parent App.

- Open leadership.html (HTTPS), or install the standalone PWA from the browser menu. Uses the shared Bright Nexa Supabase identity with verified active school_admin or principal membership.
- Home: live student/teacher counts where RLS permits; pending/emergency leave queue; rule-based operations brief. Missing data displays a dash, never an invented count.
- Leaves: approval and decline after explicit confirmation. Cover planner: candidate eligibility comes from Supabase; nothing publishes without manual confirmation.
- Session: existing encrypted installed-device refresh-token store; no school data cache. Principal cannot enter the full ERP, finance or owner-only settings through this portal.
- Deployment prerequisite: apply supabase/migrations/20261118093000_principal_leave_approvals.sql after the November 17 teacher-leave migrations. This changes only four security-definer RPC permissions, allowing Principal to review and plan teacher leave and covers.
- Principal UI is not enough without database migration. Live verification requires real Principal login, leave review and approval, cross-tenant denial, and Teacher App cover refresh.
- Existing sw.js is shared; keep the Leadership route in its NavigationRoute denylist or it may redirect to the ERP index.
- Not included in v1: Play Store APK build, background push notifications, full payroll, autonomous AI decision-making, read/write offline records or live deployment.
- Rollback: revert the app and SW PR commit; for database permissions restore the four original November 17 function definitions. Do not roll back/drop leave data.
