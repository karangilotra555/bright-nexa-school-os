'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const { bnCascadeClassroomChanges } = require('../bn-store-sync.js');

test('bnCascadeClassroomChanges isolates senior stream boundaries for teachers and timetable', () => {
  const oldClasses = [
    { id: 'c11-sci', name: 'Class 11', section: 'A', academicStream: 'Science' },
    { id: 'c11-comm', name: 'Class 11', section: 'A', academicStream: 'Commerce' }
  ];
  const newClasses = [
    { id: 'c11-sci', name: 'Class 11', section: 'A-Medical', academicStream: 'Science' },
    { id: 'c11-comm', name: 'Class 11', section: 'A', academicStream: 'Commerce' }
  ];

  const operations = {
    teachers: [
      { id: 't-sci', name: 'Physics Sir', assignedClasses: ['Class 11-A (Science)'] },
      { id: 't-comm', name: 'Accounts Maam', assignedClasses: ['Class 11-A (Commerce)'] }
    ],
    timetable: [
      { id: 'tt-sci', className: 'Class 11', section: 'A', academicStream: 'Science', subject: 'Physics' },
      { id: 'tt-comm', className: 'Class 11', section: 'A', academicStream: 'Commerce', subject: 'Accounts' }
    ]
  };

  const result = bnCascadeClassroomChanges(oldClasses, newClasses, [], operations);

  const sciTeacher = result.updatedOperations.teachers.find(t => t.id === 't-sci');
  assert.deepEqual(sciTeacher.assignedClasses, ['Class 11-A-Medical (Science)'], 'Science teacher must be updated to new section');

  const commTeacher = result.updatedOperations.teachers.find(t => t.id === 't-comm');
  assert.deepEqual(commTeacher.assignedClasses, ['Class 11-A (Commerce)'], 'Commerce teacher must NOT be changed by Science class update');

  const sciTt = result.updatedOperations.timetable.find(t => t.id === 'tt-sci');
  assert.equal(sciTt.section, 'A-Medical');
  assert.equal(sciTt.academicStream, 'Science');

  const commTt = result.updatedOperations.timetable.find(t => t.id === 'tt-comm');
  assert.equal(commTt.section, 'A', 'Commerce timetable must retain Section A');
  assert.equal(commTt.academicStream, 'Commerce');
});

function edgeStreamFixture({ teacherAssignments = [], subjects = ['Physics'] } = {}) {
  const writes = [];
  const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/school-invite-staff/index.ts'), 'utf8')
    .replace(/^import[^\n]+\n/, '');

  const schoolClasses = [
    { id: 'cls-sci', name: '11', section: 'A', academic_stream: 'Science' },
    { id: 'cls-comm', name: '11', section: 'A', academic_stream: 'Commerce' }
  ];

  const teacher = {
    id: 'faculty-sci-1',
    email: 'science.teacher@example.test',
    name: 'Science Teacher',
    status: 'Active',
    joiningDate: '2026-11-01',
    employmentType: 'Permanent',
    mobile: '9876543210',
    assignedClasses: teacherAssignments,
    subjects
  };

  const admin = {
    async rpc(name, data) {
      writes.push(['database', 'provision', data]);
      return { data: 'member-1' };
    },
    from(table) {
      const filter = {};
      const query = {
        select() { return query; },
        eq(k, v) { filter[k] = v; return query; },
        async single() {
          if (table === 'school_workspaces') {
            return { data: { revision: 1, snapshot: { operations: { teachers: [teacher] } } } };
          }
          return { data: null };
        },
        async maybeSingle() {
          if (table === 'school_users' && filter.role === 'school_admin') {
            return { data: { id: 'admin-1', institution_id: 'school-uuid', role: 'school_admin', status: 'active' } };
          }
          if (table === 'school_users') return { data: null };
          if (table === 'school_staff_profiles') return { data: null };
          return { data: null };
        },
        then(resolve) {
          if (table === 'school_classes') {
            resolve({ data: schoolClasses, error: null });
          } else {
            resolve({ data: [], error: null });
          }
        }
      };
      return query;
    },
    auth: {
      admin: {
        async listUsers() { return { data: { users: [] } }; },
        async createUser(data) {
          writes.push(['auth', 'create', data]);
          return { data: { user: { id: 'auth-user-1', ...data } } };
        },
        async getUserById(id) { return { data: { user: { id } } }; }
      }
    }
  };

  const context = {
    Deno: { env: { get: k => k }, serve: h => { context.handler = h; } },
    Response, crypto, TextEncoder,
    createClient: (_url, key) => key === 'SUPABASE_ANON_KEY'
      ? { auth: { getUser: async () => ({ data: { user: { id: 'admin-auth' } } }) } }
      : admin
  };

  vm.runInNewContext(transformSync(source, { loader: 'ts' }).code, context);

  return {
    writes,
    async ensure() {
      const answer = await context.handler(new Request('https://test.invalid', {
        method: 'POST',
        headers: { authorization: 'Bearer test' },
        body: JSON.stringify({
          action: 'ensure_teacher_account',
          role: 'teacher',
          facultyId: teacher.id,
          email: teacher.email
        })
      }));
      return { status: answer.status, body: await answer.json() };
    }
  };
}

test('edge function resolves stream-specific class assignment without ambiguous clash', async () => {
  const f = edgeStreamFixture({ teacherAssignments: ['11-A (Science)'], subjects: ['Physics'] });
  const result = await f.ensure();
  assert.equal(result.status, 201, 'Should provision successfully: ' + JSON.stringify(result.body));
  assert.equal(result.body.initialMobilePassword, true);
  const provisionCall = f.writes.find(w => w[0] === 'database' && w[1] === 'provision');
  assert.ok(provisionCall, 'Must call bn_create_teacher_app_membership');
  assert.deepEqual(JSON.parse(JSON.stringify(provisionCall[2].p_assignments)), [{ class_id: 'cls-sci', subject: 'Physics' }]);
});

test('edge function throws ambiguous class error when unstreamed label matches multiple stream classes', async () => {
  const f = edgeStreamFixture({ teacherAssignments: ['11-A'], subjects: ['Physics'] });
  const result = await f.ensure();
  assert.equal(result.status, 422);
  assert.match(result.body.error, /ambiguous class assignment.*11-A/i);
});
