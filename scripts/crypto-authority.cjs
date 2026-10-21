/**
 * Bright Nexa School OS — Institutional Cryptographic Authority
 * Implements Asymmetric ECDSA (NIST P-256 / SHA-256) Signing & Public Verification
 * 
 * Strict Security Architecture:
 * - Public Key is published for open, trustless verification across web/mobile.
 * - Private Key is NEVER committed to code or public directories.
 * - Private Key is loaded exclusively from environment (INSTITUTION_PRIVATE_KEY) 
 *   or the protected, gitignored vault file (data/.institution-private.key).
 * - Multi-key verifier supports seamless key rotation without breaking existing issued cards.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Published Institutional Public Key (CBSE Standard P-256)
const INSTITUTIONAL_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE8IiF6W6R3STAAw5FiMUz/+YPlmhx
1JkTrB5yAj7h1av5pa9gM8A6ysGjKzd0/LPQ8iXrifgwqb2YyaUNgj4SDg==
-----END PUBLIC KEY-----`;

// Legacy public key for backward-compatibility with previously printed cards
const LEGACY_PUBLIC_KEY_V1 = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEGzcPVvWiJb++/pzedFF0Zrt8c1mq
QVC1myz3qR/TBsB321UvyiwCKJr/cW3NQBrusP4/3jD6H/p37b4dgCQO5w==
-----END PUBLIC KEY-----`;

const CERTIFICATE_ID = "BN-CERT-2026-CBSE-P256-V2";
const VAULT_KEY_PATH = path.join(__dirname, '..', 'data', '.institution-private.key');

/**
 * Retrieve institutional private signing key securely from environment or vault.
 */
function getInstitutionalPrivateKey() {
  if (process.env.INSTITUTION_PRIVATE_KEY && process.env.INSTITUTION_PRIVATE_KEY.trim()) {
    return process.env.INSTITUTION_PRIVATE_KEY.trim();
  }

  try {
    if (fs.existsSync(VAULT_KEY_PATH)) {
      const keyData = fs.readFileSync(VAULT_KEY_PATH, 'utf8').trim();
      if (keyData.includes('BEGIN PRIVATE KEY')) return keyData;
    }
  } catch (err) {
    console.warn('[CryptoAuthority] Warning reading vault key:', err.message);
  }

  // If no private key exists (e.g., fresh setup), generate a secure one and save to vault
  try {
    const { privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const dir = path.dirname(VAULT_KEY_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(VAULT_KEY_PATH, privateKey, { mode: 0o600 });
    return privateKey;
  } catch (genErr) {
    throw new Error('Failed to load or generate institutional private signing key: ' + genErr.message);
  }
}

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

function signStudentPayload(student, institution) {
  const privKey = getInstitutionalPrivateKey();
  const payload = buildStudentPayload(student, institution);
  const signer = crypto.createSign('SHA256');
  signer.update(payload);
  return signer.sign(privKey, 'base64url');
}


function verifyStudentSignature(student, institution, signature) {
  if (!signature) return { verified: false, algorithm: 'NONE', certificateId: null };
  const payload = buildStudentPayload(student, institution);

  // Verify signatures issued by this deployment's configured or persisted key.
  try {
    const activePublicKey = crypto.createPublicKey(getInstitutionalPrivateKey());
    if (crypto.verify('sha256', Buffer.from(payload), activePublicKey, Buffer.from(signature, 'base64url'))) {
      return { verified: true, algorithm: 'ECDSA-P256-SHA256', certificateId: CERTIFICATE_ID };
    }
  } catch (_) {}

  // Previously issued asymmetric credentials remain supported.
  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(payload);
    if (verifier.verify(INSTITUTIONAL_PUBLIC_KEY, signature, 'base64url')) {
      return { verified: true, algorithm: 'ECDSA-P256-SHA256', certificateId: CERTIFICATE_ID };
    }
  } catch (err) {}

  // 2. Backward Compatibility: Verify with Legacy V1 Key
  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(payload);
    if (verifier.verify(LEGACY_PUBLIC_KEY_V1, signature, 'base64url')) {
      return { verified: true, algorithm: 'ECDSA-P256-SHA256-V1', certificateId: 'BN-CERT-2026-CBSE-P256' };
    }
  } catch (err) {}

  // Legacy HMAC keys were shipped publicly and cannot establish authenticity.
  return { verified: false, algorithm: 'UNKNOWN', certificateId: null };
}

module.exports = {
  INSTITUTIONAL_PUBLIC_KEY,
  CERTIFICATE_ID,
  normalizeDate,
  buildStudentPayload,
  signStudentPayload,
  verifyStudentSignature
};
