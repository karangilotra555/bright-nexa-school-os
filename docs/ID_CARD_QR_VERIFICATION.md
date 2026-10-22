# Student ID QR verification routing — 22 October 2026

## Routing fix

**Student portal at the verification backend:**
`https://bright-nexa-school-os-api.onrender.com/student-portal.html`

There are two ID-card generator copies:
- `id-card-a4.html`: Node/SQLite hosted file
- `docs/id-card-a4.html`: online Render static School OS file

Both now produce QR codes with the same canonical **API-hosted** student portal URL regardless of whether an admin opens the generator at a static website, on the API server, or from a local file.

The legacy static hostname is *not* the correct authority for `/api/verify`. The student's portal script uses `/api/verify` relative to the page origin, so the QR must open the API-hosted portal.

## Security issue discovered during URL review

The old ID card HTML created a 16-character, browser-side HMAC signature using a publicly hardcoded fallback key and potentially browser-local secrets. The backend `/api/verify` endpoint verifies **server-issued ECDSA P-256**, not this HMAC. Therefore old QR signatures **could not be authenticated by the server** and client-side generated signatures were forgeable.

To avoid printing misleading "digitally verified" credentials, the ID generator no longer emits client-generated HMAC as official proof. Newly generated QR codes are **status/verification-request links only** and the print design says **UNVERIFIED PREVIEW** / **SERVER SIGNATURE PENDING**.

The verifier itself must remain fail-closed: without a valid server-issued signature, a student is **not verified**, even if a student record exists.

## Production follow-up (not yet complete)

A future production issuance flow must authenticate the school admin, verify the school's tenant ID and student enrollment, then create a server-issued cryptographic signature attached to an immutable/canonical credential ID. The QR may only be labeled **officially verified** after the backend has issued that signature. The current single-school Node/SQLite signing service is a legacy pilot; production multi-school credentials should be signed within the cloud tenant-aware architecture.

Do not treat the old HMAC QR or unsigned preview QR as an officially verified student ID. Previously printed QR codes need to be reissued once the real server signing flow exists.
