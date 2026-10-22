# Bright Nexa — Smart School Tools (No Paid AI API)

**Online pilot route:** `/smart-tools.html`, available from School OS sidebar/topbar and Teacher Portal.
**Technology:** deterministic JavaScript algorithms running in the browser; **no OpenAI/Gemini/Groq API, no AI model download, no paid tokens**.

All five requested features are usable with fictional demo data or user-selected CSV/XLSX files. Data is held only in the browser page's memory and is **never sent to an AI provider or a server**. No data is automatically written to the School OS database. Reloading the page or clicking Clear Browser Data removes the loaded data; CSV exports are explicit user actions. Do not share exported files containing student details casually.

## 1. Smart Timetable Generator
Paste/edit two CSV grids:
- Teachers: `teacher,subjects,classes,maxdaily,unavailable` with semicolon-separated lists (`Math;Science`, `Class 6-A;Class 7-A`, `Mon-1;Wed-3`).
- Weekly requirements: `class,subject,periods` (`Class 6-A,Mathematics,5`).
Set weekdays (5/6) and periods per day (4–8); click **Generate Timetable**. Engine prevents double-booking teachers in the same day/period, respects teacher class/subject eligibility, explicit unavailability and daily load caps. Unfilled slots are marked *Study / Open*; infeasible requirements appear as warnings. Download generated CSV or print.

The scheduler is a deterministic **constraint-aware greedy heuristic**, not a mathematical guarantee of the optimal timetable. Schools should review it before publishing. No timetable is silently saved as official.

## 2. Substitute Teacher
Use a previously generated timetable, select absent teacher, day and optionally period. The app returns subject-qualified, available teachers not already teaching in the same period and within maximum daily load; marks uncovered periods if none are available. Download suggestions for Principal approval. **Never auto-assign** staff.

## 3. Student Performance Analyzer
Import Marks CSV/XLSX with `student_id,student_name,subject,marks,max_marks` and optionally `previous_marks,attendance_percent`. Set a review threshold (35/40/50/60%). Returns student averages, weak subjects and available previous-score changes, invalid-row warnings, CSV export. **Not a diagnosis, predictor, automated grading or teacher judgment.**

## 4. Smart Excel/CSV Import
Supports CSV (including quoted commas/line breaks), TSV and the **first worksheet** of normal unencrypted `.xlsx` files via browser-native ZIP decompression and DOMParser (no remote parsing service). Max 4 MB compressed file, max 10,000 data rows / 64 columns. Automatic mapping handles school-style column aliases. Five dataset types: student admissions, staff, fee ledger, attendance, marks. Preview & mapped CSV export; review unknown/missing headers. **Imported data is NOT persisted to cloud.** Formula results in XLSX are read as cached text/values; formulas are neither evaluated nor executed. Browsers without `DecompressionStream('deflate-raw')` should save Excel as CSV first.

## 5. School Error Detector
Run on any of the datasets currently imported. Detects duplicate admission IDs, blank names/classes, duplicate fee receipt numbers, paid amounts greater than total, balance mismatches, duplicate/invalid attendance rows, missing attendance rows for students on dates present in the imported sheet, and invalid marks. Missing attendance is labeled *review* (it may be a holiday or different class timetable); no student is labeled absent automatically. Results can be exported as CSV; source records are unchanged.

## Current limitations and security constraints

- **Rule-based intelligent automation, not generative AI.** No model can infer answers, draft new text, or fix unknown errors.
- Existing online School OS core UI is a separate static demo and not connected end-to-end to tenant-scoped cloud tables. This page **does not** pretend to read or write real school records without authenticating their school.
- The Smart Tools page is reachable by URL without login. Because it processes only explicitly selected browser files and holds no cloud credentials, this does not grant access to any real school's data. For school-wide production import/write/publish, implement server-authorized role-based endpoints and audited approvals first.
- No payment receipts, student accounts or sensitive records are automatically uploaded. Page sets CSP `connect-src 'none'`.
- For Excel imports, preferred workflow is an ordinary `.xlsx` spreadsheet with its data in the **first worksheet**. Protected files, macros, complicated formatting and calculated formula evaluation are not supported.
- Scheduling constraints include teacher skill, class scope, unavailability, double booking and maximum daily periods. Room resources, labs, teacher break contracts, school assemblies and complicated exam rules are **not yet modeled**.
- Test fixtures, scripts and browser behavior must be verified before distributing official school schedules.
