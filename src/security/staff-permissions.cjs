'use strict';

/**
 * Bright Nexa School OS — School-scoped staff authorization policy.
 *
 * IMPORTANT: This is a reusable server-side policy, NOT a teacher login service.
 * Invoke from authenticated server endpoints with a VERIFIED staff membership.
 * Never trust role, schoolId, permissions or assignments sent by the browser.
 *
 * Fail closed: missing tenant, role, active status or teacher assignment = deny.
 */

const ACTIONS = Object.freeze([
  'students.read_basic',
  'students.read_contact',
  'admissions.manage',
  'attendance.read',
  'attendance.write',
  'homework.read',
  'homework.write',
  'exams.read',
  'exams.write',
  'fees.read',
  'fees.write',
  'staff.read',
  'staff.manage',
  'salary.read',
  'salary.write',
  'transport.read',
  'transport.write',
  'announcements.write',
  'roles.manage'
]);

const roleActions = {
  SCHOOL_ADMIN: ACTIONS,
  PRINCIPAL: [
    'students.read_basic','students.read_contact','admissions.manage',
    'attendance.read','attendance.write','homework.read','homework.write',
    'exams.read','exams.write','fees.read',
    'staff.read','staff.manage','transport.read','announcements.write'
  ],
  CLASS_TEACHER: [
    'students.read_basic','attendance.read','attendance.write',
    'homework.read','homework.write','exams.read','exams.write'
  ],
  SUBJECT_TEACHER: [
    'students.read_basic','homework.read','homework.write','exams.read','exams.write'
  ],
  ACCOUNTANT: ['students.read_basic','fees.read','fees.write'],
  FRONT_DESK: ['students.read_basic','students.read_contact','admissions.manage'],
  TRANSPORT_STAFF: ['students.read_basic','transport.read','transport.write']
};

const ROLE_ACTIONS = Object.freeze(Object.fromEntries(
  Object.entries(roleActions).map(([role, actions]) => [role, Object.freeze([...actions])])
));

const TEACHER_ROLES = new Set(['CLASS_TEACHER', 'SUBJECT_TEACHER']);
const TEACHER_SCOPE_ACTIONS = new Set([
  'students.read_basic','attendance.read','attendance.write',
  'homework.read','homework.write','exams.read','exams.write'
]);
const SUBJECT_SCOPED_ACTIONS = new Set([
  'homework.read','homework.write','exams.read','exams.write'
]);

const norm = value => typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : '';

function authorizeStaff(actor, request) {
  const deny = reason => ({ allowed:false, reason });
  if (!actor || !request || typeof actor !== 'object' || typeof request !== 'object') return deny('INVALID_REQUEST');
  if (actor.verified !== true || actor.status !== 'ACTIVE') return deny('UNVERIFIED_OR_INACTIVE');
  if (!actor.schoolId || !request.schoolId || norm(actor.schoolId) !== norm(request.schoolId)) return deny('WRONG_SCHOOL');
  if (!Array.isArray(ACTIONS) || !ACTIONS.includes(request.action)) return deny('UNKNOWN_ACTION');
  const baseActions = ROLE_ACTIONS[actor.role];
  if (!baseActions) return deny('UNKNOWN_ROLE');
  if (!baseActions.includes(request.action)) return deny('ROLE_DENIED');

  // Optional custom permission restriction. Never grant something outside the role.
  // Used by the school admin to turn specific rights OFF for an individual staff member.
  if (Array.isArray(actor.allowedActions) && !actor.allowedActions.includes(request.action)) {
    return deny('CUSTOM_PERMISSION_DENIED');
  }
  if (Array.isArray(actor.deniedActions) && actor.deniedActions.includes(request.action)) {
    return deny('CUSTOM_PERMISSION_DENIED');
  }

  if (TEACHER_ROLES.has(actor.role) && TEACHER_SCOPE_ACTIONS.has(request.action)) {
    if (!norm(request.className) || !norm(request.section)) return deny('CLASS_SCOPE_REQUIRED');
    if (!Array.isArray(actor.assignments) || actor.assignments.length === 0) return deny('NO_ASSIGNMENT');
    const assignments = actor.assignments.filter(a =>
      a && a.active === true &&
      norm(a.schoolId) === norm(actor.schoolId) &&
      norm(a.className) === norm(request.className) &&
      norm(a.section) === norm(request.section)
    );
    if (assignments.length === 0) return deny('OUTSIDE_ASSIGNED_CLASS');
    if (actor.role === 'SUBJECT_TEACHER' && SUBJECT_SCOPED_ACTIONS.has(request.action)) {
      if (!norm(request.subject)) return deny('SUBJECT_SCOPE_REQUIRED');
      if (!assignments.some(a => norm(a.subject) === norm(request.subject))) return deny('OUTSIDE_ASSIGNED_SUBJECT');
    }
  }
  return { allowed:true, reason:'ALLOWED' };
}

function requireStaffAccess(actor, request) {
  const decision = authorizeStaff(actor, request);
  if (!decision.allowed) {
    const error = new Error('Staff access denied: ' + decision.reason);
    error.code = 'STAFF_ACCESS_DENIED';
    error.statusCode = 403;
    throw error;
  }
  return true;
}

function filterAuthorizedRecords(actor, action, rows, resolveScope) {
  if (!Array.isArray(rows) || typeof resolveScope !== 'function') throw new TypeError('rows and resolveScope required');
  // The caller must return the row's authoritative server-side scope;
  // NEVER build record scope from user-supplied filters.
  return rows.filter(row => {
    const scope = resolveScope(row);
    return scope && authorizeStaff(actor, { ...scope, action }).allowed;
  });
}

module.exports = {
  ACTIONS, ROLE_ACTIONS, authorizeStaff, requireStaffAccess, filterAuthorizedRecords
};
