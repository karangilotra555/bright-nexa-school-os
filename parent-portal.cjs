'use strict';
// Bright Nexa Parents — Phase 1 school-scoped pilot API.
// This repository currently supports ONE institution. Do not enable multi-school
// operation until every table/session/sync key is scoped by verified school ID.
module.exports = function createParentPortal({ db, getInstitution, verifySessionToken, verifyAdminAuth, parseJsonBody, sendJson, logAudit }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS parent_attendance (
      admission_number TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY (admission_number, day)
    );
    CREATE TABLE IF NOT EXISTS parent_fees (
      admission_number TEXT PRIMARY KEY, due_rupees INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS parent_homework (
      id TEXT PRIMARY KEY, class_name TEXT NOT NULL, section TEXT NOT NULL,
      subject TEXT NOT NULL, title TEXT NOT NULL, due_date TEXT,
      published_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS parent_notices (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
      published_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS parent_leave_requests (
      id TEXT PRIMARY KEY, admission_number TEXT NOT NULL, from_day TEXT NOT NULL,
      to_day TEXT NOT NULL, reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_parent_leaves_admission ON parent_leave_requests(admission_number);
  `);

  const isoDay = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    !Number.isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
  const clean = (v, n=160) => typeof v === 'string' ? v.trim().slice(0,n) : '';
  const fail = (res, status, msg) => { sendJson(res, status, {error:msg}); return true; };
  const sessionStudent = req => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!match) return null;
    const session = verifySessionToken(match[1].trim());
    if (!session) return null;
    return db.prepare("SELECT * FROM students WHERE (admissionNumber = ? OR id = ?) AND enrollmentStatus = 'ACTIVE'").get(session.sub,session.sub) || null;
  };
  function displayStudent(s) {
    return {
      name:s.name, admissionNumber:s.admissionNumber, rollNumber:s.rollNumber,
      className:s.className, section:s.section, fatherName:s.fatherName,
      busStop:s.busStop, bloodGroup:s.bloodGroup
    };
  }
  return async function handleParentApi(req,res,pathname,clientIp) {
    if (!pathname.startsWith('/api/parent/')) return false;
    if (pathname === '/api/parent/dashboard' && req.method === 'GET') {
      const s = sessionStudent(req);
      if (!s) return fail(res,401,'Please log in again.');
      const adm = s.admissionNumber;
      const attendance = db.prepare("SELECT day,status FROM parent_attendance WHERE admission_number = ? ORDER BY day DESC LIMIT 60").all(adm);
      const stats = db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status IN ('PRESENT','LATE') THEN 1 ELSE 0 END) present FROM parent_attendance WHERE admission_number = ?").get(adm);
      const fee = db.prepare('SELECT due_rupees,updated_at FROM parent_fees WHERE admission_number = ?').get(adm);
      const homework = db.prepare('SELECT id,subject,title,due_date,published_at FROM parent_homework WHERE class_name = ? AND section = ? ORDER BY published_at DESC LIMIT 20').all(s.className,s.section);
      const notices = db.prepare('SELECT id,title,body,published_at FROM parent_notices ORDER BY published_at DESC LIMIT 20').all();
      const leaves = db.prepare('SELECT id,from_day,to_day,reason,status,created_at FROM parent_leave_requests WHERE admission_number = ? ORDER BY created_at DESC LIMIT 10').all(adm);
      const inst = getInstitution();
      sendJson(res,200,{
        school:{name:inst.name,session:inst.session,logoUrl:inst.logoUrl || ''},
        student:displayStudent(s),
        attendance:{percent: stats.total ? Math.round((stats.present / stats.total)*10000)/100 : null, recordedDays:stats.total, recent:attendance},
        fees:{dueRupees:fee ? fee.due_rupees : null,updatedAt:fee ? fee.updated_at : null},
        homework,notices,leaves,
        lastLoaded:new Date().toISOString()
      });
      return true;
    }
    if (pathname === '/api/parent/leave' && req.method === 'POST') {
      const s = sessionStudent(req);
      if (!s) return fail(res,401,'Please log in again.');
      try {
        const p = await parseJsonBody(req);
        const fromDay = clean(p.fromDay,10),toDay=clean(p.toDay,10),reason=clean(p.reason,500);
        if (!isoDay(fromDay) || !isoDay(toDay) || fromDay > toDay ||
            !reason || reason.length < 5) return fail(res,400,'Choose valid dates and provide a reason of at least 5 characters.');
        const today = new Date().toISOString().slice(0,10);
        const n = db.prepare('SELECT COUNT(*) n FROM parent_leave_requests WHERE admission_number=? AND substr(created_at,1,10)=?').get(s.admissionNumber,today).n;
        if (n >= 3) return fail(res,429,'Maximum three leave requests per day.');
        const id = require('node:crypto').randomUUID();
        db.prepare('INSERT INTO parent_leave_requests (id,admission_number,from_day,to_day,reason,status,created_at) VALUES (?,?,?,?,?,?,?)')
          .run(id,s.admissionNumber,fromDay,toDay,reason,'PENDING',new Date().toISOString());
        logAudit('PARENT_LEAVE_REQUEST',clientIp,{admission:s.admissionNumber,id});
        sendJson(res,201,{success:true,id,status:'PENDING'});
        return true;
      } catch(e) { return fail(res,400,'Invalid leave request.'); }
    }
    if (pathname === '/api/parent/admin/leaves' && req.method === 'GET') {
      if (!verifyAdminAuth(req)) return fail(res,401,'Admin credentials required.');
      sendJson(res,200,{leaves:db.prepare('SELECT * FROM parent_leave_requests ORDER BY created_at DESC LIMIT 300').all()});
      return true;
    }
    // School desktop calls this AFTER syncing its main roster. Updates are atomic,
    // non-destructive upserts. Missing fields are not invented for parents.
    if (pathname === '/api/parent/admin/publish' && req.method === 'POST') {
      if (!verifyAdminAuth(req)) return fail(res,401,'Admin credentials required.');
      let inTransaction=false;
      try {
        const p=await parseJsonBody(req);
        const sets=['attendance','fees','homework','notices'];
        for (const k of sets) if (p[k] !== undefined && (!Array.isArray(p[k]) || p[k].length>1000)) return fail(res,400,'Invalid or oversized '+k+' dataset.');
        const now=new Date().toISOString();
        let updated=0;
        db.exec('BEGIN IMMEDIATE TRANSACTION'); inTransaction=true;
        const belongs=adm=>!!db.prepare("SELECT 1 FROM students WHERE admissionNumber=? AND enrollmentStatus='ACTIVE'").get(adm);
        const attStmt=db.prepare('INSERT INTO parent_attendance(admission_number,day,status,updated_at) VALUES (?,?,?,?) ON CONFLICT(admission_number,day) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at');
        for (const a of p.attendance||[]) {
          if (!belongs(a.admissionNumber) || !isoDay(a.day) || !['PRESENT','ABSENT','LATE','LEAVE'].includes(a.status)) throw Error('Invalid attendance entry');
          attStmt.run(a.admissionNumber,a.day,a.status,now); updated++;
        }
        const feeStmt=db.prepare('INSERT INTO parent_fees(admission_number,due_rupees,updated_at) VALUES(?,?,?) ON CONFLICT(admission_number) DO UPDATE SET due_rupees=excluded.due_rupees,updated_at=excluded.updated_at');
        for (const f of p.fees||[]) {
          if (!belongs(f.admissionNumber) || !Number.isSafeInteger(f.dueRupees) || f.dueRupees<0 || f.dueRupees>100000000) throw Error('Invalid fee entry');
          feeStmt.run(f.admissionNumber,f.dueRupees,now); updated++;
        }
        const hwStmt=db.prepare('INSERT INTO parent_homework(id,class_name,section,subject,title,due_date,published_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET class_name=excluded.class_name,section=excluded.section,subject=excluded.subject,title=excluded.title,due_date=excluded.due_date,published_at=excluded.published_at');
        for (const h of p.homework||[]) {
          if (!clean(h.id,80) || !clean(h.className,80) || !clean(h.section,40) || !clean(h.subject,100) || !clean(h.title,250) || (h.dueDate && !isoDay(h.dueDate))) throw Error('Invalid homework entry');
          hwStmt.run(clean(h.id,80),clean(h.className,80),clean(h.section,40),clean(h.subject,100),clean(h.title,250),h.dueDate||null,now); updated++;
        }
        const noticeStmt=db.prepare('INSERT INTO parent_notices(id,title,body,published_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,published_at=excluded.published_at');
        for (const n of p.notices||[]) {
          if (!clean(n.id,80) || !clean(n.title,250) || !clean(n.body,2000)) throw Error('Invalid notice entry');
          noticeStmt.run(clean(n.id,80),clean(n.title,250),clean(n.body,2000),now); updated++;
        }
        db.exec('COMMIT'); inTransaction=false;
        logAudit('PARENT_DATA_PUBLISHED',clientIp,{updated});
        sendJson(res,200,{success:true,updated,publishedAt:now});
        return true;
      } catch(e) {
        if (inTransaction) try {db.exec('ROLLBACK');}catch(_) {}
        return fail(res,400,'Publish rejected; no changes committed. '+e.message);
      }
    }
    return fail(res,404,'Parent portal endpoint not found.');
  };
};
