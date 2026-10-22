/**
 * Bright Nexa School OS — Production HTTP, Security & Cryptographic Server
 * 
 * Security Architecture:
 * 1. Zero-dependency native Node.js HTTP server + native SQLite (node:sqlite) for ACID durability.
 * 2. Secret Vault: Cryptographically random 256-bit secrets with zero hardcoded fallbacks.
 * 3. Timing-Safe Security: All credentials and secret comparisons use constant-time SHA-256 HMAC timingSafeEqual.
 * 4. Brute-Force & Rate-Limiting Protection: Sliding-window rate limiter per IP and per Admission ID.
 * 5. Asymmetric ECDSA (NIST P-256) Institutional Signing Authority:
 *    - /api/sign: Restricted strictly to authenticated school administrators.
 *    - /api/verify: Public cryptographic verification checking enrollment active status.
 * 6. Authenticated Parent & Student Portal:
 *    - POST /api/auth/login: Constant-time DOB authentication issuing signed session tokens.
 *    - GET /api/portal/me: Authenticated student profile query.
 * 7. Administrative Snapshot Sync:
 *    - POST /api/sync/snapshot: Atomic SQLite transactions for full school roster synchronization.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const ca = require('./scripts/crypto-authority.cjs');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ==========================================
// 1. SECURE SECRET VAULT (ZERO HARDCODED KEYS)
// ==========================================
const SECRETS_FILE = path.join(DATA_DIR, '.server-secrets.json');
let serverSecrets = {};

try {
  if (fs.existsSync(SECRETS_FILE)) {
    serverSecrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('[Vault] Initializing fresh secrets vault...');
}

let SESSION_SECRET = process.env.SESSION_SECRET || serverSecrets.SESSION_SECRET;
let ADMIN_API_KEY = process.env.ADMIN_API_KEY || serverSecrets.ADMIN_API_KEY;

let secretsUpdated = false;
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  serverSecrets.SESSION_SECRET = SESSION_SECRET;
  secretsUpdated = true;
}
if (!ADMIN_API_KEY) {
  ADMIN_API_KEY = crypto.randomBytes(32).toString('hex');
  serverSecrets.ADMIN_API_KEY = ADMIN_API_KEY;
  secretsUpdated = true;
  console.log('[Security] Administrative API key generated and stored in the server vault.');
}

if (secretsUpdated) {
  try {
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(serverSecrets, null, 2), { mode: 0o600 });
  } catch (err) {
    console.warn('[Vault] Could not persist secrets file:', err.message);
  }
}

/**
 * Constant-time comparison immune to timing side-channel attacks.
 */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// ==========================================
// 2. ACID DURABLE DATABASE (NATIVE node:sqlite)
// ==========================================
const DB_PATH = path.join(DATA_DIR, 'school.db');
const db = new DatabaseSync(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS institution (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    session TEXT,
    principalName TEXT,
    logoUrl TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    admissionNumber TEXT UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    rollNumber TEXT,
    className TEXT,
    section TEXT,
    dob TEXT,
    bloodGroup TEXT,
    fatherName TEXT,
    contactNumber TEXT,
    busStop TEXT,
    address TEXT,
    enrollmentStatus TEXT DEFAULT 'ACTIVE',
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    event TEXT NOT NULL,
    ip TEXT,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    attempts INTEGER DEFAULT 0,
    locked_until INTEGER DEFAULT 0,
    last_attempt INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_student_adm ON students(admissionNumber);
  CREATE INDEX IF NOT EXISTS idx_student_status ON students(enrollmentStatus);
`);

// Seed default institutional info if empty
const instRow = db.prepare('SELECT * FROM institution WHERE id = ?').get('default');
if (!instRow) {
  db.prepare(`
    INSERT INTO institution (id, name, tagline, address, phone, email, session, principalName, logoUrl, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'default',
    'BRIGHT NEXA INTERNATIONAL ACADEMY',
    'Empowering Future Innovators • Affiliated to CBSE',
    'Shivalik Enclave, Haridwar',
    '+91 7500058655',
    'info@brightnexa.edu.in',
    '2026-2027',
    'DR. K. GILOTRA',
    'app-icon-512.png',
    new Date().toISOString()
  );
}

// Seed official demo student records if table is brand new
const studentCountRow = db.prepare('SELECT COUNT(*) as count FROM students').get();
if (studentCountRow.count === 0) {
  const insertStudent = db.prepare(`
    INSERT INTO students (id, admissionNumber, name, rollNumber, className, section, dob, bloodGroup, fatherName, contactNumber, busStop, address, enrollmentStatus, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialStudents = [
    { id: "1", adm: "BMS-2026-001", name: "AARAV SHARMA", roll: "01", cls: "Class VI", sec: "A", dob: "12-03-2014", blood: "O+", father: "MR. RAJESH SHARMA", phone: "9876543210", bus: "Route 3 (Gate No 2)", addr: "Sector 4, BHEL, Haridwar" },
    { id: "2", adm: "BMS-2026-002", name: "ANANYA VERMA", roll: "02", cls: "Class VI", sec: "A", dob: "24-07-2014", blood: "B+", father: "MR. SUNIL VERMA", phone: "9812345678", bus: "Route 1 (Main Chowk)", addr: "Shivalik Nagar, Haridwar" },
    { id: "3", adm: "DEMO-2026-003", name: "ROHAN MEHTA", roll: "03", cls: "Class VI", sec: "B", dob: "05-11-2013", blood: "A+", father: "MR. AMIT MEHTA", phone: "9988776655", bus: "Route 2 (Station)", addr: "Ranipur More, Haridwar" },
    { id: "4", adm: "DEMO-2026-004", name: "PRIYA CHOUDHARY", roll: "04", cls: "Class VII", sec: "A", dob: "18-01-2013", blood: "AB+", father: "MR. VIKRAM SINGH", phone: "9765432109", bus: "Route 4 (Post Office)", addr: "Jwalapur, Haridwar" }
  ];

  db.exec('BEGIN TRANSACTION');
  const now = new Date().toISOString();
  for (const s of initialStudents) {
    insertStudent.run(s.id, s.adm, s.name, s.roll, s.cls, s.sec, s.dob, s.blood, s.father, s.phone, s.bus, s.addr, 'ACTIVE', now, now);
  }
  db.exec('COMMIT');
}

function getInstitution() {
  const row = db.prepare('SELECT * FROM institution WHERE id = ?').get('default');
  return row || { name: "BRIGHT NEXA INTERNATIONAL ACADEMY", session: "2026-2027" };
}

function logAudit(event, ip, details) {
  try {
    db.prepare('INSERT INTO audit_logs (timestamp, event, ip, details) VALUES (?, ?, ?, ?)').run(
      new Date().toISOString(),
      event,
      ip || 'unknown',
      typeof details === 'object' ? JSON.stringify(details) : String(details)
    );
  } catch (err) {
    console.warn('[AuditLog] Error recording log:', err.message);
  }
}

// ==========================================
// 3. BRUTE-FORCE RATE LIMITER
// ==========================================
function checkRateLimit(key, maxAttempts = 5, windowSec = 900) { // 15 mins default
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT * FROM rate_limits WHERE key = ?').get(key);

  if (!row) {
    db.prepare('INSERT INTO rate_limits (key, attempts, locked_until, last_attempt) VALUES (?, 0, 0, ?)').run(key, now);
    return { allowed: true, remaining: maxAttempts, locked: false };
  }

  if (row.locked_until > now) {
    return { allowed: false, remaining: 0, locked: true, retryAfter: row.locked_until - now };
  }

  // Reset window if last attempt was older than windowSec
  if (now - row.last_attempt > windowSec) {
    db.prepare('UPDATE rate_limits SET attempts = 0, locked_until = 0, last_attempt = ? WHERE key = ?').run(now, key);
    return { allowed: true, remaining: maxAttempts, locked: false };
  }

  return { allowed: row.attempts < maxAttempts, remaining: Math.max(0, maxAttempts - row.attempts), locked: false };
}

function recordRateLimitFailure(key, maxAttempts = 5, lockDurationSec = 900) {
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT * FROM rate_limits WHERE key = ?').get(key);
  const attempts = (row ? row.attempts : 0) + 1;
  const lockedUntil = attempts >= maxAttempts ? now + lockDurationSec : 0;

  db.prepare(`
    INSERT INTO rate_limits (key, attempts, locked_until, last_attempt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      attempts = excluded.attempts,
      locked_until = excluded.locked_until,
      last_attempt = excluded.last_attempt
  `).run(key, attempts, lockedUntil, now);

  return { attempts, locked: lockedUntil > 0, retryAfter: lockDurationSec };
}

function resetRateLimit(key) {
  db.prepare('DELETE FROM rate_limits WHERE key = ?').run(key);
}

// ==========================================
// 4. SESSION TOKEN GENERATION & VERIFICATION
// ==========================================
function createSessionToken(student) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: student.admissionNumber || student.id,
    name: student.name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 3600)
  })).toString('base64url');
  
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(`${header}.${payload}`).digest('base64url');
  if (!timingSafeCompare(sig, expectedSig)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// MIME Types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Request payload exceeds 1MB limit'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON format'));
      }
    });
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();
}

function verifyAdminAuth(req) {
  const headerKey = req.headers['x-admin-key'];
  const authHeader = req.headers['authorization'];
  let keyToTest = '';

  if (headerKey) {
    keyToTest = headerKey.trim();
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    keyToTest = authHeader.slice(7).trim();
  }

  return keyToTest && timingSafeCompare(keyToTest, ADMIN_API_KEY);
}

// ==========================================
// HTTP SERVER & ROUTING ENGINE
// ==========================================
// Parent portal uses the existing signed student session and admin sync key.
const handleParentApi = require('./parent-portal.cjs')({
  db, getInstitution, verifySessionToken, verifyAdminAuth, parseJsonBody, sendJson, logAudit
});

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const clientIp = getClientIp(req);
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Parent portal: scoped student reads, leave requests, admin publishing.
  if (pathname.startsWith('/api/parent/')) {
    return await handleParentApi(req, res, pathname, clientIp);
  }

  // -------------------------------------------------------------
  // 1. Health & Security Status
  // -------------------------------------------------------------
  if (pathname === '/api/school-profile' && req.method === 'GET') {
    const inst = getInstitution();
    const institution = Object.fromEntries(['name','tagline','address','phone','email','session','principalName','logoUrl'].map(key => [key, inst[key] || '']));
    return sendJson(res, 200, { institution });
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    const inst = getInstitution();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM students').get();
    return sendJson(res, 200, {
      status: "healthy",
      service: "bright-nexa-school-os-api",
      version: "2.0.0",
      database: "sqlite3_acid",
      institution: inst.name,
      session: inst.session,
      enrolledStudents: countRow.count,
      certificateAuthority: ca.CERTIFICATE_ID,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  }

  // -------------------------------------------------------------
  // 2. Public Cryptographic QR Verification (ECDSA P-256)
  // -------------------------------------------------------------
  if (pathname === '/api/verify' && req.method === 'GET') {
    const adm = (parsedUrl.searchParams.get('adm') || '').trim();
    const sig = (parsedUrl.searchParams.get('sig') || '').trim();

    if (!adm) {
      return sendJson(res, 400, { error: "Admission ID is required for verification." });
    }

    const student = db.prepare('SELECT * FROM students WHERE admissionNumber = ? OR id = ?').get(adm, adm);
    if (!student) {
      logAudit('VERIFY_NOT_FOUND', clientIp, { adm });
      return sendJson(res, 404, {
        verified: false,
        status: "RECORD_NOT_FOUND",
        message: `No active student found matching Admission ID "${adm}".`,
        admissionNumber: adm
      });
    }

    const inst = getInstitution();
    const verResult = sig ? ca.verifyStudentSignature(student, inst, sig) : { verified: false, algorithm: 'NONE', certificateId: null };

    // Check enrollment active status
    const isActive = student.enrollmentStatus === 'ACTIVE';

    if (verResult.verified && !isActive) {
      logAudit('VERIFY_REVOKED_STATUS', clientIp, { adm: student.admissionNumber, status: student.enrollmentStatus });
      return sendJson(res, 200, {
        verified: false,
        status: "ENROLLMENT_REVOKED",
        message: `Credential Revoked: Student is no longer actively enrolled (Status: ${student.enrollmentStatus}).`,
        certificateId: verResult.certificateId,
        algorithm: verResult.algorithm,
        student: {
          name: student.name,
          admissionNumber: student.admissionNumber,
          className: student.className,
          section: student.section,
          rollNumber: student.rollNumber,
          enrollmentStatus: student.enrollmentStatus
        }
      });
    }

    logAudit('VERIFY_CHECK', clientIp, { adm: student.admissionNumber, verified: verResult.verified, algorithm: verResult.algorithm });

    return sendJson(res, 200, {
      verified: verResult.verified && isActive,
      status: verResult.verified ? (isActive ? "OFFICIALLY_VERIFIED" : "ENROLLMENT_REVOKED") : "SIGNATURE_MISMATCH",
      certificateId: verResult.certificateId || ca.CERTIFICATE_ID,
      algorithm: verResult.algorithm || "ECDSA-P256-SHA256",
      student: {
        name: student.name,
        admissionNumber: student.admissionNumber,
        className: student.className,
        section: student.section,
        rollNumber: student.rollNumber,
        enrollmentStatus: student.enrollmentStatus
      }
    });
  }

  // -------------------------------------------------------------
  // 3. Parent Portal Authentication API (Constant-Time + Rate Limited)
  // -------------------------------------------------------------
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    // Artificial jitter to mitigate automated timing & brute force (200ms)
    await new Promise(r => setTimeout(r, 200));

    try {
      const { admissionNumber, dob } = await parseJsonBody(req);
      const cleanAdm = (admissionNumber || '').trim();
      const cleanDob = (dob || '').trim();

      if (!cleanAdm || !cleanDob) {
        return sendJson(res, 400, { error: "Both Admission Number and Date of Birth are strictly required." });
      }

      // Check IP rate limit
      const ipLim = checkRateLimit(`ip:${clientIp}`, 10, 900);
      if (!ipLim.allowed) {
        logAudit('LOGIN_RATE_LIMITED_IP', clientIp, { ip: clientIp });
        return sendJson(res, 429, {
          error: "Too many login attempts from this network. Access temporarily suspended for 15 minutes."
        }, { 'Retry-After': String(ipLim.retryAfter || 900) });
      }

      // Check Admission ID rate limit
      const admLim = checkRateLimit(`adm:${cleanAdm.toUpperCase()}`, 5, 900);
      if (!admLim.allowed) {
        logAudit('LOGIN_RATE_LIMITED_ADM', clientIp, { adm: cleanAdm });
        return sendJson(res, 429, {
          error: `Account temporarily locked due to 5 consecutive failed login attempts. Please retry after ${Math.ceil((admLim.retryAfter || 900) / 60)} minutes.`
        }, { 'Retry-After': String(admLim.retryAfter || 900) });
      }

      const student = db.prepare('SELECT * FROM students WHERE admissionNumber = ? OR id = ?').get(cleanAdm, cleanAdm);

      if (!student) {
        recordRateLimitFailure(`ip:${clientIp}`);
        recordRateLimitFailure(`adm:${cleanAdm.toUpperCase()}`);
        logAudit('LOGIN_FAILED_NOT_FOUND', clientIp, { adm: cleanAdm });
        return sendJson(res, 401, {
          error: "Authentication Failed: No student record found matching this Admission Number."
        });
      }

      // Check if student has registered DOB
      const studentDobNorm = ca.normalizeDate(student.dob || '');
      if (!studentDobNorm) {
        logAudit('LOGIN_BLOCKED_NO_DOB', clientIp, { adm: student.admissionNumber });
        return sendJson(res, 403, {
          error: "Access Restricted: Date of Birth is not registered for this student record in the institutional database. For student data privacy and security, please contact the school administration office to register the student's date of birth before portal access can be granted."
        });
      }

      const enteredDobNorm = ca.normalizeDate(cleanDob);
      const isMatch = enteredDobNorm && timingSafeCompare(enteredDobNorm, studentDobNorm);

      if (!isMatch) {
        const resFail = recordRateLimitFailure(`adm:${cleanAdm.toUpperCase()}`);
        recordRateLimitFailure(`ip:${clientIp}`);
        logAudit('LOGIN_FAILED_WRONG_DOB', clientIp, { adm: student.admissionNumber, attempts: resFail.attempts });
        return sendJson(res, 401, {
          error: `Authentication Failed: The Date of Birth entered does not match our institutional records for this student. (${5 - resFail.attempts} attempts remaining before account lockout)`
        });
      }

      // Success: Reset rate limit counters
      resetRateLimit(`adm:${cleanAdm.toUpperCase()}`);
      resetRateLimit(`ip:${clientIp}`);

      const token = createSessionToken(student);
      logAudit('LOGIN_SUCCESS', clientIp, { adm: student.admissionNumber });

      return sendJson(res, 200, {
        token: token,
        student: {
          id: student.id,
          name: student.name,
          rollNumber: student.rollNumber,
          admissionNumber: student.admissionNumber,
          className: student.className,
          section: student.section,
          fatherName: student.fatherName,
          contactNumber: student.contactNumber,
          bloodGroup: student.bloodGroup,
          dob: student.dob,
          address: student.address,
          busStop: student.busStop,
          enrollmentStatus: student.enrollmentStatus
        }
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // -------------------------------------------------------------
  // 4. Authenticated Student Session Query
  // -------------------------------------------------------------
  if (pathname === '/api/portal/me' && req.method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
      return sendJson(res, 401, { error: "Authentication token required. Format: Authorization: Bearer <token>" });
    }

    const token = authHeader.slice(7).trim();
    const session = verifySessionToken(token);
    if (!session) {
      return sendJson(res, 401, { error: "Session token is invalid or expired. Please log in again." });
    }

    const student = db.prepare('SELECT * FROM students WHERE admissionNumber = ? OR id = ?').get(session.sub, session.sub);
    if (!student) {
      return sendJson(res, 404, { error: "Enrolled student record no longer exists." });
    }

    return sendJson(res, 200, {
      student: {
        id: student.id,
        name: student.name,
        rollNumber: student.rollNumber,
        admissionNumber: student.admissionNumber,
        className: student.className,
        section: student.section,
        fatherName: student.fatherName,
        contactNumber: student.contactNumber,
        bloodGroup: student.bloodGroup,
        dob: student.dob,
        address: student.address,
        busStop: student.busStop,
        enrollmentStatus: student.enrollmentStatus
      }
    });
  }

  // -------------------------------------------------------------
  // 5. Authenticated Institutional Signature Generator (ECDSA P-256)
  // -------------------------------------------------------------
  if (pathname === '/api/sign' && req.method === 'POST') {
    if (!verifyAdminAuth(req)) {
      logAudit('UNAUTHORIZED_SIGN_ATTEMPT', clientIp, { path: req.url });
      return sendJson(res, 401, {
        error: "Unauthorized: Generating cryptographic institutional signatures requires valid administrative credentials."
      });
    }

    try {
      const { student, institution } = await parseJsonBody(req);
      if (!student) {
        return sendJson(res, 400, { error: "Student payload required." });
      }

      // Check if student exists in official database
      const adm = (student.admissionNumber || student.id || '').trim();
      const existing = db.prepare('SELECT * FROM students WHERE admissionNumber = ? OR id = ?').get(adm, adm);
      const studentToSign = existing || student;
      const inst = institution || getInstitution();

      const sig = ca.signStudentPayload(studentToSign, inst);
      logAudit('ECDSA_SIGN_ISSUED', clientIp, { adm: studentToSign.admissionNumber || studentToSign.id });

      return sendJson(res, 200, {
        signature: sig,
        certificateId: ca.CERTIFICATE_ID,
        algorithm: "ECDSA-P256-SHA256",
        studentAdmissionNumber: studentToSign.admissionNumber
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // -------------------------------------------------------------
  // 6. Administrative Roster Synchronization (ACID SQLite)
  // -------------------------------------------------------------
  if (pathname === '/api/sync/snapshot' && req.method === 'POST') {
    if (!verifyAdminAuth(req)) {
      logAudit('UNAUTHORIZED_SYNC_ATTEMPT', clientIp, { path: req.url });
      return sendJson(res, 401, { error: "Unauthorized: Invalid administrative synchronization key." });
    }

    try {
      const payload = await parseJsonBody(req);
      const now = new Date().toISOString();

      db.exec('BEGIN TRANSACTION');

      if (payload.institution) {
        const inst = payload.institution;
        db.prepare(`
          INSERT INTO institution (id, name, tagline, address, phone, email, session, principalName, logoUrl, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            tagline = excluded.tagline,
            address = excluded.address,
            phone = excluded.phone,
            email = excluded.email,
            session = excluded.session,
            principalName = excluded.principalName,
            logoUrl = excluded.logoUrl,
            updated_at = excluded.updated_at
        `).run(
          'default',
          inst.name || 'BRIGHT NEXA INTERNATIONAL ACADEMY',
          inst.tagline || '',
          inst.address || '',
          inst.phone || '',
          inst.email || '',
          inst.session || '2026-2027',
          inst.principalName || '',
          inst.logoUrl || 'app-icon-512.png',
          now
        );
      }

      let count = 0;
      if (Array.isArray(payload.students)) {
        const upsertStudent = db.prepare(`
          INSERT INTO students (id, admissionNumber, name, rollNumber, className, section, dob, bloodGroup, fatherName, contactNumber, busStop, address, enrollmentStatus, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(admissionNumber) DO UPDATE SET
            name = excluded.name,
            rollNumber = excluded.rollNumber,
            className = excluded.className,
            section = excluded.section,
            dob = excluded.dob,
            bloodGroup = excluded.bloodGroup,
            fatherName = excluded.fatherName,
            contactNumber = excluded.contactNumber,
            busStop = excluded.busStop,
            address = excluded.address,
            enrollmentStatus = excluded.enrollmentStatus,
            updated_at = excluded.updated_at
        `);

        for (let idx = 0; idx < payload.students.length; idx++) {
          const s = payload.students[idx];
          const adm = s.admissionNumber || `BMS-2026-${String(idx + 1).padStart(3, '0')}`;
          const id = s.id || String(idx + 1);
          upsertStudent.run(
            id,
            adm,
            (s.name || `STUDENT ${idx + 1}`).toUpperCase(),
            s.rollNumber ? String(s.rollNumber).padStart(2, '0') : String(idx + 1).padStart(2, '0'),
            s.className || "Class VI",
            s.section || "A",
            s.dateOfBirth || s.dob || "",
            s.bloodGroup || "",
            (s.fatherName || s.guardianName || "").toUpperCase(),
            s.parentMobile || s.contactNumber || s.phone || "",
            s.busStop || s.transportRoute || "",
            s.address || "",
            s.enrollmentStatus || "ACTIVE",
            now,
            now
          );
          count++;
        }
      }

      db.exec('COMMIT');
      logAudit('SYNC_SNAPSHOT_SUCCESS', clientIp, { count });

      return sendJson(res, 200, {
        success: true,
        message: `Durable ACID synchronization completed: ${count} student records committed.`,
        institution: getInstitution().name,
        timestamp: now
      });
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      return sendJson(res, 400, { error: err.message });
    }
  }

  // -------------------------------------------------------------
  // 7. Static Asset Streaming with Security Headers
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'API endpoint not found.' });
  let decodedPath;
  try { decodedPath = decodeURIComponent(pathname).replace(/\\/g, '/'); }
  catch (_) { return sendJson(res, 400, { error: 'Invalid path.' }); }
  const segments = decodedPath.split('/').filter(Boolean);
  const privateRoots = new Set(['data','node_modules','tests','app-extracted','resources','docs']);
  if (segments.some(segment => segment.startsWith('.')) || privateRoots.has((segments[0] || '').toLowerCase()) ||
      /(?:^|\/)(?:server\.js|package(?:-lock)?\.json|render\.yaml|Dockerfile)$/i.test(decodedPath) ||
      /\.(?:db|sqlite3?|key|pem|cjs)$/i.test(decodedPath)) {
    return sendJson(res, 403, { error: 'Protected asset.' });
  }
  let filePath = path.resolve(__dirname, '.' + (decodedPath === '/' ? '/index.html' : decodedPath));

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  // Never stream server secrets or private keys through static file server
  if (filePath.includes('.server-secrets') || filePath.includes('.institution-private') || filePath.includes('.key')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied: Protected Asset');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (pathname.endsWith('.html') || pathname.startsWith('/assets/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }
      filePath = path.join(__dirname, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[Bright Nexa Server] Production ACID SQLite Backend running on port ${server.address().port}`);
  console.log(`[Certificate Authority] Active: ${ca.CERTIFICATE_ID}`);
});

module.exports = { server, db, ADMIN_API_KEY, SESSION_SECRET };
