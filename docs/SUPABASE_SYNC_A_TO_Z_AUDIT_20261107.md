# Bright Nexa School OS — Supabase A-to-Z sync audit (2026-11-07)

**Baseline**: `417ee10cee73ab5f429956a91d8cb4f4141a4950`, Haridwar Public School.
**Scope**: Read-only live PostgreSQL inventory + repository flow review; no real student/fee records modified.

## Confirmed
- Single ERP workspace uses `school_workspaces.snapshot`. On a connected, verified school, React changes to institution/students/operations call `controller.autosave` and the tenant-scoped `school_workspace_push` RPC. This sends the entire JSON snapshot immediately on state changes, subject to network, validation, auth, and version conflict. Confirmation is asynchronous, not instantaneous.
- The RPC additionally projects *only* classes, students + selected profile details, attendance, homework, audience-filtered notices and fee obligations into relational tables. These can support their authorized portals once published.
- Cloud school access is verified against school-admin membership; unsafe automatic sample import and cross-school overwrites remain blocked.
- Current live database at review: **34** student rows, **1** detailed student profile, **0** workspace ID maps, **revision 0**, **0** published class timetables. This is **not** an end-to-end confirmation of an ERP-created student.
- Existing parent/student login checks the real admission record and school-registered guardian phone. No student accounts or passwords were fabricated.
- Existing school role permissions, staff identities, timetable and photo endpoints are separate Supabase paths; these are **not** implemented by the ERP snapshot projection.

## Module matrix

| Module/workflow | ERP snapshot on a confirmed save | Dedicated Supabase/portal integration | Remaining gap |
|---|---|---|---|
| Institution profile and basic settings | Yes | School name; selected fields only | Complete field-level cross-portal publication not proved |
| Classes / sections | Yes | `school_classes` | Multi-device/version tests required |
| Students / admission details | Yes | `school_students`, `school_student_profiles` subset | First login needs guardian phone and successful publication |
| Attendance | Yes | `school_attendance` | Teacher attendance is separately cloud-managed; verify authorization |
| Fees / payments | Yes | Computed `school_fee_entries` projections | Receipt identity, external ledger reconciliation and accountant workflow need verification |
| Homework and general notices | Yes | `school_homework`, `school_notices` | Audience filtering; files handled separately |
| Teachers / staff master, employment, assignments | Yes for local ERP operations | Staff portal has separate school users/profiles/assignments | ERP teacher changes are not projected to staff identities and assignments |
| Exams, marks and report cards | Yes in snapshot | No corresponding live standalone marks table found | Parent/teacher sharing not assured |
| Weekly timetable | Possibly legacy local operations | Separate `school_timetable_*` tables + publish RPC | Publishing is explicit; 0 live published timetables |
| Student photos and private documents | Local fields may exist | Separate Supabase private Storage/RPC | Uploaded files must be verified individually; no blanket image auto-publish |
| Transport / vehicles, inventory, infrastructure, expenses | Yes in ERP operations | No dedicated live relational table for most of these fields | Other portals/modules cannot assume cross-device dedicated record APIs |
| Settings, roles, module permissions | Some local values | Dedicated RLS-controlled `school_role_module_permissions` | Never treat local permissions as authoritative |
| Library | Separate staff page | `school_library_items`, `school_library_loans` | Library storage is independent of ERP snapshot |
| WhatsApp / notifications | Separate queue/API | Supabase WhatsApp tables | Delivery/approval errors need provider-specific checks |
| Backups, exports, Excel, documents | Local/device and separate paths | Not guaranteed by workspace snapshot | Need file-specific verification and restore tests |

## Fixes in this branch
1. Pending/failed/unbound cloud saves show an explicit error, not a silent return.
2. Retry uses the current controller and preserved pending queue rather than reloading the page.
3. A student add no longer claims server success before RPC acknowledgment; success feedback follows a confirmed sync.
4. Sync badge is scoped to **ERP saved to Supabase**, not an unsupported claim that every portal is updated.
5. Root, Pages and packaged UI scripts are mirrored; service-worker revisions and cache migration are advanced, with tests.

## Release gate / incomplete work
- Run automated tests and independently smoke-test owner sign-in, new student with registered guardian mobile, parent first login, class/fee/attendance, and two-device update.
- Test denied writes, expired tokens, offline queue and conflict. Do not delete existing local queues or cloud rows to make a test pass.
- Plan module-by-module canonical relational integration for teachers, exams/marks, transport, assets, attendance source consistency, files and settings. **Do not claim A-to-Z cloud publishing until these contracts and role-specific tests pass.**
