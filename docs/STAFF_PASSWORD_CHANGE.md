# Staff password self-service

The cloud Teacher/Staff Portal offers **My Account → Change Password** to signed-in School Admin, Principal, Teachers and other invited staff. This changes only the signed-in user's own Supabase Auth password; no staff role, tenant assignment or class permission is edited.

## Behavior
1. Staff authenticates with their current password, enters a different new password (minimum 12, maximum 256 characters) and confirms it.
2. The portal reauthenticates the staff email/password directly against Supabase Auth to confirm the existing credential and get a fresh auth session. The response's identity must match the current signed-in user.
3. Supabase Auth updates the authenticated account password via `PUT /auth/v1/user`, including `current_password`.
4. The portal revokes the temporary confirmation session and the current session, deletes session storage, clears the form and requires the user to log in again.
5. Password inputs are never sent to our Render School OS backend or stored in `localStorage` / `sessionStorage`. Browser to Supabase Auth transport uses HTTPS.

**Note:** The actual Supabase Auth provider may require a separate OTP/nonce if "Secure password change" is configured. Such an error will be surfaced; the UI never bypasses the provider's requirements.

## Scope limitations
- This is a self-change with knowledge of the current password, **not forgotten-password recovery**.
- The separate legacy Desktop School OS uses different local credentials; this does not change its master recovery flow.
- The Student/Parent admission-number + DOB login is not a secure long-term authentication system. Do not add a low-entropy 4-digit PIN to a public parent service. Production guardians need verified invitation / OTP enrollment, their own accounts, rate limiting and student linkage with tenant-scoped access policies.
- Real staff login/password-change end-to-end testing still requires a verified school admin test account; automated tests inspect the UI and auth flow but cannot validate an account that does not yet exist.
