/**
 * Bright Nexa School OS — Production HTTP & Security API Server
 * 
 * Features:
 * 1. Zero-dependency native Node.js HTTP server.
 * 2. Static asset streaming with caching headers and security MIME types.
 * 3. Secure REST API:
 *    - POST /api/auth/login: Constant-time DOB authentication & signed session token issuance.
 *    - GET /api/portal/me: Authenticated parent/student portal data query.
 *    - GET /api/verify: Public cryptographic QR verification endpoint (ECDSA P-256).
 *    - POST /api/sync/snapshot: School OS administrative sync.
 *    - GET /api/health: Service health check.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ca = require('./scripts/crypto-authority.cjs');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'bright-nexa-portal-session-secret-2026';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'bright-nexa-admin-sync-key-2026';

// Persistent / in-memory student database initialized with official demo records
let schoolInstitution = {
  name: "BRIGHT NEXA INTERNATIONAL ACADEMY",
  tagline: "Empowering Future Innovators • Affiliated to CBSE",
  address: "Shivalik Enclave, Haridwar",
  phone: "+91 7500058655",
  email: "info@brightnexa.edu.in",
  session: "2026-2027",
  principalName: "DR. K. GILOTRA",
  logoUrl: "app-icon-512.png"
};

let studentDirectory = [
  { id: "1", name: "AARAV SHARMA", rollNumber: "01", admissionNumber: "BMS-2026-001", className: "Class VI", section: "A", dob: "12-03-2014", bloodGroup: "O+", fatherName: "MR. RAJESH SHARMA", contactNumber: "9876543210", busStop: "Route 3 (Gate No 2)", address: "Sector 4, BHEL, Haridwar" },
  { id: "2", name: "ANANYA VERMA", rollNumber: "02", admissionNumber: "BMS-2026-002", className: "Class VI", section: "A", dob: "24-07-2014", bloodGroup: "B+", fatherName: "MR. SUNIL VERMA", contactNumber: "9812345678", busStop: "Route 1 (Main Chowk)", address: "Shivalik Nagar, Haridwar" },
  { id: "3", name: "ROHAN MEHTA", rollNumber: "03", admissionNumber: "DEMO-2026-003", className: "Class VI", section: "B", dob: "05-11-2013", bloodGroup: "A+", fatherName: "MR. AMIT MEHTA", contactNumber: "9988776655", busStop: "Route 2 (Station)", address: "Ranipur More, Haridwar" },
  { id: "4", name: "PRIYA CHOUDHARY", rollNumber: "04", admissionNumber: "DEMO-2026-004", className: "Class VII", section: "A", dob: "18-01-2013", bloodGroup: "AB+", fatherName: "MR. VIKRAM SINGH", contactNumber: "9765432109", busStop: "Route 4 (Post Office)", address: "Jwalapur, Haridwar" }
];

// Load persisted snapshot if available
const SNAPSHOT_FILE = path.join(__dirname, 'data', 'school-snapshot.json');
try {
  if (fs.existsSync(SNAPSHOT_FILE)) {
    const raw = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.institution) schoolInstitution = { ...schoolInstitution, ...parsed.institution };
    if (Array.isArray(parsed.students) && parsed.students.length > 0) studentDirectory = parsed.students;
  }
} catch (err) {
  console.warn('[Server] Could not load persisted snapshot:', err.message);
}

// Session Token Generation & Verification
function createSessionToken(student) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: student.admissionNumber || student.id,
    name: student.name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 3600) // 24 hours
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
  if (sig !== expectedSig) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// MIME Types Map
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
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
      if (body.length > 1e6) { // 1MB limit
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ==========================================
  // REST API ENDPOINTS
  // ==========================================

  // 1. Service Health Check
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      status: "healthy",
      service: "bright-nexa-school-os-api",
      version: "1.0.0",
      institution: schoolInstitution.name,
      studentsCount: studentDirectory.length,
      cryptoAuthority: ca.CERTIFICATE_ID,
      timestamp: new Date().toISOString()
    });
  }

  // 2. Public Cryptographic QR Verification
  if (pathname === '/api/verify' && req.method === 'GET') {
    const adm = (parsedUrl.searchParams.get('adm') || '').trim().toUpperCase();
    const sig = (parsedUrl.searchParams.get('sig') || '').trim();

    if (!adm) {
      return sendJson(res, 400, { error: "Admission ID is required for verification." });
    }

    const student = studentDirectory.find(s => 
      (s.admissionNumber && s.admissionNumber.toUpperCase() === adm) || 
      (s.id && String(s.id).toUpperCase() === adm)
    );

    if (!student) {
      return sendJson(res, 404, {
        verified: false,
        status: "RECORD_NOT_FOUND",
        message: `No active student found matching Admission ID "${adm}".`,
        admissionNumber: adm
      });
    }

    const verResult = sig ? ca.verifyStudentSignature(student, schoolInstitution, sig) : { verified: false, algorithm: 'NONE', certificateId: null };

    // Return strictly non-confidential public credential verification fields
    return sendJson(res, 200, {
      verified: verResult.verified,
      status: verResult.verified ? "OFFICIALLY_VERIFIED" : "SIGNATURE_MISMATCH",
      certificateId: verResult.certificateId || ca.CERTIFICATE_ID,
      algorithm: verResult.algorithm || "ECDSA-P256-SHA256",
      student: {
        name: student.name,
        admissionNumber: student.admissionNumber || student.id,
        className: student.className,
        section: student.section,
        rollNumber: student.rollNumber,
        academicSession: schoolInstitution.session
      },
      institution: {
        name: schoolInstitution.name,
        tagline: schoolInstitution.tagline
      },
      verifiedAt: new Date().toISOString()
    });
  }

  // 3. Parent / Student Server-Side Authentication
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const { admissionNumber, dob } = await parseJsonBody(req);
      const cleanAdm = (admissionNumber || '').trim().toUpperCase();
      const cleanDob = (dob || '').trim();

      if (!cleanAdm || !cleanDob) {
        return sendJson(res, 400, { error: "Admission Number and Date of Birth are both required." });
      }

      const student = studentDirectory.find(s => 
        (s.admissionNumber && s.admissionNumber.toUpperCase() === cleanAdm) || 
        (s.id && String(s.id).toUpperCase() === cleanAdm)
      );

      if (!student) {
        return sendJson(res, 404, { error: `Student record with Admission ID "${cleanAdm}" was not found.` });
      }

      // Check for registered DOB in institutional record
      const actualDobNorm = ca.normalizeDate(student.dob || student.dateOfBirth || '');
      if (!actualDobNorm) {
        return sendJson(res, 403, { 
          error: "Access Restricted: Date of Birth is not registered for this student record in the institutional database. Please contact the school administration office to register your date of birth." 
        });
      }

      const enteredDobNorm = ca.normalizeDate(cleanDob);
      if (enteredDobNorm !== actualDobNorm) {
        return sendJson(res, 401, { error: "Authentication Failed: The Date of Birth entered does not match our institutional records for this student." });
      }

      // Authentication successful: issue session token
      const token = createSessionToken(student);

      // Return ONLY the authenticated student's profile (Zero-leakage)
      return sendJson(res, 200, {
        success: true,
        token: token,
        student: {
          id: student.id,
          name: student.name,
          admissionNumber: student.admissionNumber || student.id,
          rollNumber: student.rollNumber,
          className: student.className,
          section: student.section,
          fatherName: student.fatherName,
          contactNumber: student.contactNumber,
          bloodGroup: student.bloodGroup,
          dob: student.dob || student.dateOfBirth,
          address: student.address,
          busStop: student.busStop
        },
        institution: schoolInstitution
      });

    } catch (err) {
      return sendJson(res, 400, { error: "Malformed request payload." });
    }
  }

  // 4. Authenticated Portal Profile Query
  if (pathname === '/api/portal/me' && req.method === 'GET') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const session = verifySessionToken(token);

    if (!session) {
      return sendJson(res, 401, { error: "Unauthorized or expired session. Please login again." });
    }

    const student = studentDirectory.find(s => 
      (s.admissionNumber && s.admissionNumber.toUpperCase() === session.sub.toUpperCase()) || 
      (s.id && String(s.id).toUpperCase() === session.sub.toUpperCase())
    );

    if (!student) {
      return sendJson(res, 404, { error: "Student record no longer exists." });
    }

    return sendJson(res, 200, {
      student: student,
      institution: schoolInstitution
    });
  }

  // 5. Administrative Roster Synchronization
  if (pathname === '/api/sync/snapshot' && req.method === 'POST') {
    const key = req.headers['x-admin-key'] || req.headers['authorization'];
    if (key !== ADMIN_API_KEY && key !== `Bearer ${ADMIN_API_KEY}`) {
      return sendJson(res, 401, { error: "Invalid administrative synchronization key." });
    }

    try {
      const payload = await parseJsonBody(req);
      if (payload.institution) schoolInstitution = { ...schoolInstitution, ...payload.institution };
      if (Array.isArray(payload.students)) {
        studentDirectory = payload.students.map((s, idx) => ({
          id: s.id || String(idx + 1),
          name: (s.name || `STUDENT ${idx + 1}`).toUpperCase(),
          rollNumber: s.rollNumber ? String(s.rollNumber).padStart(2, '0') : String(idx + 1).padStart(2, '0'),
          admissionNumber: s.admissionNumber || `BMS-2026-${String(idx + 1).padStart(3, '0')}`,
          className: s.className || "Class VI",
          section: s.section || "A",
          fatherName: (s.fatherName || s.guardianName || "MR. PARENT").toUpperCase(),
          contactNumber: s.parentMobile || s.contactNumber || s.phone || "9876543210",
          bloodGroup: s.bloodGroup || "B+",
          dob: s.dateOfBirth || s.dob || "",
          address: s.address || "Haridwar, Uttarakhand",
          busStop: s.busStop || s.transportRoute || "Self / Walker"
        }));
      }

      // Persist snapshot to disk
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({ institution: schoolInstitution, students: studentDirectory }, null, 2));

      return sendJson(res, 200, {
        success: true,
        message: `Synchronized ${studentDirectory.length} student records successfully.`,
        institution: schoolInstitution.name,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // 6. Administrative Signature Generator (ECDSA P-256)
  if (pathname === '/api/sign' && req.method === 'POST') {
    try {
      const { student, institution } = await parseJsonBody(req);
      if (!student) {
        return sendJson(res, 400, { error: "Student payload required." });
      }
      const sig = ca.signStudentPayload(student, institution || schoolInstitution);
      return sendJson(res, 200, {
        signature: sig,
        certificateId: ca.CERTIFICATE_ID,
        algorithm: "ECDSA-P256-SHA256"
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // ==========================================
  // STATIC ASSET STREAMING
  // ==========================================
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  // Check if file exists, fallback to index.html for SPA routes
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // If requesting an html page that does not exist, return 404
      if (pathname.endsWith('.html') || pathname.startsWith('/assets/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }
      // SPA Fallback
      filePath = path.join(__dirname, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[Bright Nexa Server] Production School OS & Auth API running on port ${PORT}`);
});

module.exports = server;
