# Staff and Teacher Online Access — Role Policy (Security Foundation)

Bright Nexa is **cloud-first**. Each school must be a distinct tenant. Every authenticated request must enforce (1) verified identity, (2) school membership, (3) staff role and individual restrictions, and (4) class/section/subject scope where appropriate.

## Role matrix

| Role | Permitted scope |
|------|-----------------|
| School Admin | All named capabilities **within their own school**; can manage staff roles |
| Principal | School's academic records, admissions, attendance, staff and transport; no payroll modification and no role management |
| Class Teacher | Only assigned class + section: basic student roster, attendance, homework and exam scores |
| Subject Teacher | Only assigned class + section; homework and marks restricted to assigned **subject** |
| Accountant | Basic roster and fees; no teacher grades, salaries, role assignment or attendance |
| Front Desk | Basic student/guardian information and admissions |
| Transport Staff | Basic student roster and transport operations |
| Parent | Separate guardian account and strictly their own linked children (not a staff role) |

Access is DENIED by default when school, identity, staff status, role, class assignment or subject assignment is absent or does not match.

## Flexible per-user rights

The school administrator can choose a base role and turn individual actions **off**. Restrictions cannot be used to secretly grant salary or fee access to teachers. To grant an entirely different privilege, a school administrator must assign a suitable role, with audit and re-verification.

Examples:
- Class VI A class teacher → VI A attendance and homework only.
- Class VI A mathematics teacher → math homework/marks for VI A, not English or VI B.
- Accountant → school fee amounts/receipts, not teacher salary.
- Principal → wider academic monitoring but not financial-payroll powers by default.

## Implementation status

`src/security/staff-permissions.cjs` defines the policy (`authorizeStaff`, `requireStaffAccess`, `filterAuthorizedRecords`); `tests/staff-permissions.test.cjs` verifies the denial boundaries.

**This is a policy module, not yet a deployed teacher login or teacher dashboard.** It does NOT make existing React screens secure merely by hiding tabs. The existing `server.js` supports a parent/student login and administrator key, but there is not yet verified teacher identity, tenant-specific membership provisioning or role-protected staff APIs.

### Required before real teachers use this

1. Build school-admin authenticated `Staff → Roles & Access` manager with invited staff members, suspension, and per-user class/subject assignments.
2. Issue secure staff sessions after verified onboarding; load role and assignments from the **database**, never client parameters.
3. Apply this policy to **every** student/fee/attendance/homework/exam/transport API, including exports/searches and writes. Scope database queries by school and teacher assignments before fetching.
4. Add database row-level security and independent school tenancy for the intended cloud deployment; policy checks and database rules must agree.
5. Add audit logs, session revocation and tests for cross-school, cross-class, unauthorized salary/fee reads and bulk exports.
6. Only after steps 1–5 deploy teacher online access, or claim role-controlled data is secure in production.

For now, do not issue teacher access credentials to real schools based on the current role UI alone.
