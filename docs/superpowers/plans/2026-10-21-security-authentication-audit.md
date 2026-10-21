# Production Security, Server-Side Authentication & Cryptographic QR Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 3 critical audit findings by implementing a secure Node.js server-side authentication API, strict handling of missing DOBs without dummy fallbacks, and asymmetric public-key (ECDSA/RSA) & server-side verification for QR codes.

**Architecture:** 
1. Build a high-performance, zero-external-dependency Node.js HTTP server (`server.js`) providing `/api/auth/login`, `/api/verify`, `/api/portal/me`, and `/api/sync/snapshot`, keeping student databases strictly private and server-side.
2. Replace symmetric HMAC keys in browser localStorage with an Asymmetric Cryptographic Signing Authority (ECDSA P-256 / SHA-256): Private signing key held only by administrative authority / server; Public verification key published for independent, tamper-proof client/third-party verification.
3. Completely remove dummy default dates (`12-03-2014`) for students missing DOBs, explicitly marking unassigned DOBs on ID cards as "Not Registered" and blocking portal login for records without registered DOB with clear administrative guidance.

**Tech Stack:** Node.js (v18+), native `crypto`, `http`, `fs`, `path`, ECDSA (P-256) / HMAC-SHA256, Vanilla JS / HTML5 Web Crypto API, Electron.

**Spec:** User audit findings:
1. Parent Portal authentication: Login browser-side hai; server authentication nahi (Critical)
2. Student DOB handling: Missing DOB ke liye sample date 12-03-2014 fill ho sakti hai (High)
3. QR verification: Signing key browser localStorage mein hai; verification independently trusted nahi (High)

## Global Constraints
- No dummy dates (`12-03-2014`) may ever be auto-filled for real students with missing DOB.
- Client browsers must never receive the full unauthenticated directory of students.
- Private signing keys must never be exposed to public web verification clients.
- Public QR code verification must remain independently verifiable by any scanner or public web client using the official Public Key.
- Parity must be strictly preserved across root, `docs/`, `app-extracted/dist/`, and Electron `resources/app.asar`.

## Review Focus
1. Student with no registered DOB attempts to log into Parent Portal: Access must be strictly blocked with guidance notice.
2. Parent Portal login attempt from an external phone without local storage: Must authenticate via `/api/auth/login` and load only the student's own record.
3. Tampered QR code signature scan: Public verification view must reject signature as invalid using the asymmetric public key.
4. Attempt to dump `students` array in browser console: Unauthenticated visitors cannot see student database in memory.
5. ID Card bulk generator with incomplete student profiles: Unregistered DOB displays "Not Registered", never dummy sample dates.

---

### Task 1: Complete Elimination of Dummy Date Fallbacks for Missing DOB

**Files:**
- Modify: `id-card-a4.html`
- Modify: `student-portal.html`
- Modify: `docs/id-card-a4.html`
- Modify: `docs/student-portal.html`
- Modify: `app-extracted/dist/id-card-a4.html`
- Modify: `app-extracted/dist/student-portal.html`

- [ ] Remove `|| "12-03-2014"` from student mapping in `id-card-a4.html`.
- [ ] If `s.dob` or `s.dateOfBirth` is missing/empty, set `dob: ""` and render `D.O.B: Not Registered` on the card footer.
- [ ] In `student-portal.html`, remove any fallback to `"12-03-2014"` for live students.
- [ ] In `student-portal.html` login handler, explicitly check if `!studentDobNorm` (student record in school database has no registered DOB). If missing, block login and show: `"Access Restricted: Date of Birth is not registered for this student record in the institutional database. Please contact school administration."`
- [ ] Write Node automated test proving that a student with empty DOB cannot be logged in with `12-03-2014` or any other date.

---

### Task 2: Asymmetric Cryptographic Signing & Verification Authority (ECDSA P-256)

**Files:**
- Create: `scripts/crypto-authority.cjs`
- Modify: `id-card-a4.html`
- Modify: `student-portal.html`
- Sync to `docs/` and `app-extracted/dist/`

- [ ] Create `scripts/crypto-authority.cjs` implementing ECDSA P-256 / SHA-256 keypair generation, document signing, and public key verification using standard DER / IEEE P1363 signatures.
- [ ] Define institutional Public Key constant and certificate identifier (`BN-PUBKEY-2026-CBSE-P256`).
- [ ] In `id-card-a4.html`, generate cryptographic signatures using the private signing authority.
- [ ] In `student-portal.html`, implement independent asymmetric verification using Web Crypto API (`window.crypto.subtle.verify`) or pure JS ECDSA verifier with the institutional Public Key.
- [ ] Demonstrate that public verification does NOT require the private key, making independent third-party verification 100% trustworthy and tamper-proof.

---

### Task 3: Secure Node.js Server-Side Authentication API

**Files:**
- Create: `server.js`
- Modify: `package.json`
- Modify: `student-portal.html`
- Sync to `docs/` and `app-extracted/dist/`

- [ ] Build `server.js` with zero external dependencies:
  - Static file server for HTML, CSS, JS, images, fonts.
  - `POST /api/auth/login`: Validates `admissionNumber` and `dob` server-side, issues signed session token, returns single student payload.
  - `GET /api/portal/me`: Validates session token, returns authenticated student data.
  - `GET /api/verify`: Validates QR code signature and returns public verification data only.
  - `POST /api/sync/snapshot`: Admin endpoint with secret key to update live student database.
- [ ] Update `package.json` with `"start": "node server.js"`.
- [ ] Update `student-portal.html` to authenticate via `/api/auth/login` when running online/server mode, with secure fallback.
- [ ] Write integration test verifying `/api/auth/login` rejects wrong DOB and accepts correct DOB without exposing other student records.

---

### Task 4: Packaging, Testing, Git Commit, and Render Deployment

**Files:**
- Sync: `docs/`, `app-extracted/dist/`
- Repack: `resources/app.asar`
- Deploy: Render Web Service / Git remote

- [ ] Run comprehensive automated test suite testing all 3 fixes.
- [ ] Sync all updated files across `docs/` and `app-extracted/dist/`.
- [ ] Repack `resources/app.asar` using `@electron/asar`.
- [ ] Commit all changes to git and push to `origin main`.
- [ ] Trigger Render deployment and verify live server responses.
