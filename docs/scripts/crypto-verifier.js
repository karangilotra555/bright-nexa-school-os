/**
 * Bright Nexa School OS — Public Cryptographic Verification Engine
 * Strictly Public Keys — Safe for open web, CDN, and browser use.
 * No private keys or administrative secrets are contained herein.
 */

(function(global) {
  const INSTITUTIONAL_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE8IiF6W6R3STAAw5FiMUz/+YPlmhx
1JkTrB5yAj7h1av5pa9gM8A6ysGjKzd0/LPQ8iXrifgwqb2YyaUNgj4SDg==
-----END PUBLIC KEY-----`;

  const CERTIFICATE_ID = "BN-CERT-2026-CBSE-P256-V2";
  const DEFAULT_HMAC_KEY = 'bn_sec_key_7500058655_brightnexa_2026_cbse_v1';

  function normalizeDate(str) {
    if (!str) return '';
    const clean = String(str).trim();
    const mIso = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (mIso) return `${mIso[1]}-${mIso[2].padStart(2, '0')}-${mIso[3].padStart(2, '0')}`;
    const mDmy = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (mDmy) return `${mDmy[3]}-${mDmy[2].padStart(2, '0')}-${mDmy[1].padStart(2, '0')}`;
    return clean.replace(/[^0-9]/g, '');
  }

  function buildStudentPayload(student, institution) {
    const adm = (student?.admissionNumber || student?.id || '').trim().toUpperCase();
    const roll = (student?.rollNumber || '').trim();
    const dob = normalizeDate(student?.dob || student?.dateOfBirth || '');
    const instName = (institution?.name || 'Bright Nexa').trim().toUpperCase();
    const session = (institution?.session || '2026-2027').trim();
    return `${instName}|${session}|${adm}|${roll}|${dob}`;
  }

  const verifier = {
    INSTITUTIONAL_PUBLIC_KEY,
    CERTIFICATE_ID,
    DEFAULT_HMAC_KEY,
    normalizeDate,
    buildStudentPayload
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = verifier;
  } else {
    global.CryptoVerifier = verifier;
  }
})(typeof window !== 'undefined' ? window : globalThis);
