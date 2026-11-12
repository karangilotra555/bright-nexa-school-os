'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProjection } = require('../school-workspace-cloud.js');

const school = (classes = [], students = [], extras = {}) => ({
  institution: { institution: { id: 'school-1', name: 'School', session: '2026-2027' } },
  students,
  operations: { classes, ...extras }
});
const classroom = (id, name = 'LKG', section = 'A') =>
  ({ id, name, section, academicSession: '2026-2027', subjects: [] });

test('new school can start with no pre-created classes', () => {
  assert.deepEqual(buildProjection(school(), () => []).classes, []);
});

test('class and section are separate master records', () => {
  const data = buildProjection(school([
    classroom('a', 'Nursery', 'A'), classroom('b', 'Nursery', 'B')
  ]), () => []);
  assert.deepEqual(data.classes.map(row => [row.name, row.section]), [
    ['Nursery', 'A'], ['Nursery', 'B']
  ]);
});

test('same class and section cannot be duplicated by spaces or letter case', () => {
  assert.throws(() => buildProjection(school([
    classroom('a', ' LKG ', 'A'), classroom('b', 'lkg', ' A ')
  ]), () => []), /Duplicate class name \/ section \/ year/);
});

test('clearing all classes with students fails before cloud push', () => {
  const student = { id: 'student-1', admissionNumber: 'ADM1',
    name: 'Test Student', status: 'active', classId: 'c1' };
  assert.throws(() => buildProjection(school([], [student]), () => []),
    /Cannot remove all classes.*No Supabase save was attempted/);
});

test('clearing all classes with homework history fails before cloud push', () => {
  assert.throws(() => buildProjection(school([], [], {
    homework: [{ id: 'h1', classId: 'c1', title: 'Reading', subject: 'English' }]
  }), () => []), /Cannot remove all classes/);
});

test('class editing preserves unrelated student entries when class still exists', () => {
  const student = { id: 'student-1', admissionNumber: 'ADM1',
    name: 'Test Student', status: 'active', classId: 'c1' };
  const data = buildProjection(school([classroom('c1')], [student]), () => []);
  assert.equal(data.students.length, 1);
  assert.equal(data.students[0].classLocalId, 'c1');
});

test('local-only class teacher selection cannot be falsely published', () => {
  const selected = { ...classroom('c1'), classTeacherId: 'local-teacher-1' };
  assert.throws(() => buildProjection(school([selected]), () => []),
    /not a verified Supabase teacher assignment.*No cloud save was attempted/);
});
