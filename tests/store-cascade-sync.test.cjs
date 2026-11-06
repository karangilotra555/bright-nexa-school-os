const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeClassName,
  normalizeSection,
  isClassMatch,
  isSectionMatch,
  isStudentInClass,
  bnCascadeClassroomChanges,
  bnCascadeStudentChanges,
  buildDynamicClassList,
  buildDynamicSectionList
} = require('../bn-store-sync.js');

test('normalizeClassName handles prefixes, Roman numerals and ordinals', () => {
  assert.equal(normalizeClassName('Class 6'), '6');
  assert.equal(normalizeClassName('Grade 6'), '6');
  assert.equal(normalizeClassName('6th'), '6');
  assert.equal(normalizeClassName('VI'), '6');
  assert.equal(normalizeClassName('6 - A'), '6');
  assert.equal(normalizeClassName('Class 10'), '10');
  assert.equal(normalizeClassName('X'), '10');
  assert.equal(normalizeClassName('Nursery'), 'nursery');
  assert.equal(normalizeClassName('Batch 2026'), '2026');
});

test('isClassMatch equates variations of the same class name', () => {
  assert.equal(isClassMatch('6', 'Class 6'), true);
  assert.equal(isClassMatch('Class 6', '6th'), true);
  assert.equal(isClassMatch('VI', '6'), true);
  assert.equal(isClassMatch('Class 7', 'Class 8'), false);
});

test('isStudentInClass accurately links student to class record', () => {
  const student = { id: 's1', name: 'Aarav', className: '6', section: 'A' };
  const classRecord = { id: 'c1', name: 'Class 6', section: 'A' };
  assert.equal(isStudentInClass(student, classRecord), true);

  const studentWithPrefix = { id: 's2', name: 'Rohan', className: 'Class 6', section: 'A' };
  const classNumeric = { id: 'c2', name: '6', section: 'A' };
  assert.equal(isStudentInClass(studentWithPrefix, classNumeric), true);

  const wrongSection = { id: 's3', name: 'Priya', className: '6', section: 'B' };
  assert.equal(isStudentInClass(wrongSection, classRecord), false);
});

test('bnCascadeClassroomChanges propagates class renames across all entities', () => {
  const oldClasses = [
    { id: 'c1', name: '6', section: 'A' },
    { id: 'c2', name: '7', section: 'A' }
  ];
  const newClasses = [
    { id: 'c1', name: 'Class 6', section: 'A-Alpha' },
    { id: 'c2', name: '7', section: 'A' }
  ];

  const students = [
    { id: 's1', name: 'Aarav Sharma', className: '6', section: 'A' },
    { id: 's2', name: 'Rahul Verma', className: '7', section: 'A' }
  ];

  const operations = {
    feeStructures: [
      { id: 'fs1', className: '6', category: 'Tuition Fee', amount: 1500 },
      { id: 'fs2', className: '7', category: 'Tuition Fee', amount: 1600 }
    ],
    attendance: [
      { id: 'att1', studentId: 's1', className: '6', section: 'A', status: 'Present' }
    ],
    teachers: [
      { id: 't1', name: 'Sunita Sharma', assignedClasses: ['6-A', '7-A'] }
    ]
  };

  const result = bnCascadeClassroomChanges(oldClasses, newClasses, students, operations);
  assert.equal(result.changesCount, 1);

  // Student 1 updated
  assert.equal(result.updatedStudents[0].className, 'Class 6');
  assert.equal(result.updatedStudents[0].section, 'A-Alpha');
  // Student 2 untouched
  assert.equal(result.updatedStudents[1].className, '7');
  assert.equal(result.updatedStudents[1].section, 'A');

  // Fee structure updated
  assert.equal(result.updatedOperations.feeStructures[0].className, 'Class 6');
  assert.equal(result.updatedOperations.feeStructures[1].className, '7');

  // Attendance updated
  assert.equal(result.updatedOperations.attendance[0].className, 'Class 6');
  assert.equal(result.updatedOperations.attendance[0].section, 'A-Alpha');

  // Teacher assignedClasses updated
  assert.deepEqual(result.updatedOperations.teachers[0].assignedClasses, ['Class 6-A-Alpha', '7-A']);
});

test('bnCascadeStudentChanges updates attendance, fee payments, and marks', () => {
  const updatedStudent = {
    id: 's1',
    name: 'Aarav S. Sharma',
    admissionNumber: 'BMS-001-NEW',
    rollNumber: '06-A',
    className: 'Class 6',
    section: 'A'
  };

  const operations = {
    attendance: [
      { id: 'a1', studentId: 's1', studentName: 'Aarav Sharma', rollNumber: '06', className: '6' }
    ],
    feePayments: [
      { id: 'fp1', studentId: 's1', studentName: 'Aarav Sharma', admissionNumber: 'BMS-001', receiptNumber: 'REC-1' }
    ],
    marks: [
      { id: 'm1', studentId: 's1', studentName: 'Aarav Sharma', className: '6' }
    ]
  };

  const result = bnCascadeStudentChanges(updatedStudent, null, operations);
  assert.equal(result.touched, true);

  assert.equal(result.updatedOperations.attendance[0].studentName, 'Aarav S. Sharma');
  assert.equal(result.updatedOperations.attendance[0].rollNumber, '06-A');
  assert.equal(result.updatedOperations.attendance[0].className, 'Class 6');

  assert.equal(result.updatedOperations.feePayments[0].studentName, 'Aarav S. Sharma');
  assert.equal(result.updatedOperations.feePayments[0].admissionNumber, 'BMS-001-NEW');

  assert.equal(result.updatedOperations.marks[0].studentName, 'Aarav S. Sharma');
  assert.equal(result.updatedOperations.marks[0].className, 'Class 6');
});

test('buildDynamicClassList produces sorted dynamic class array', () => {
  const configured = [
    { name: 'Class 6', section: 'A' },
    { name: 'Special Batch', section: '1' }
  ];
  const students = [
    { className: '6' },
    { className: 'Nursery' }
  ];

  const list = buildDynamicClassList(configured, students);
  assert.ok(list.includes('Class 6') || list.includes('6'));
  assert.ok(list.includes('Special Batch'));
  assert.ok(list.includes('Nursery'));
  assert.ok(list.includes('10'));

  // Standard nursery and grades appear first in order
  assert.equal(list[0], 'Nursery');
});

test('isClassMatch links variations for Exam and Marks modules', () => {
  assert.equal(isClassMatch('Class 2', '2'), true);
  assert.equal(isClassMatch('2', '2-D'), true);
  assert.equal(isClassMatch('Class 6', '6th'), true);
  assert.equal(isClassMatch('Class 9', 'Class 10'), false);
});

test('bnCascadeClassroomChanges isolates academicStream so Science and Commerce students in same grade are not co-modified', () => {
  const oldClasses = [
    { id: 'c11-sci', name: 'Class 11', section: 'A', academicStream: 'Science' },
    { id: 'c11-comm', name: 'Class 11', section: 'A', academicStream: 'Commerce' }
  ];
  const newClasses = [
    { id: 'c11-sci', name: 'Class 11', section: 'A-Medical', academicStream: 'Science' },
    { id: 'c11-comm', name: 'Class 11', section: 'A', academicStream: 'Commerce' }
  ];

  const students = [
    { id: 's-sci', name: 'Rohan Sharma', className: 'Class 11', section: 'A', academicStream: 'Science' },
    { id: 's-comm', name: 'Ananya Gupta', className: 'Class 11', section: 'A', academicStream: 'Commerce' }
  ];

  const operations = {
    feeStructures: [
      { id: 'fs-sci', className: 'Class 11', category: 'Science Lab Fee', academicStream: 'Science', amount: 2000 },
      { id: 'fs-comm', className: 'Class 11', category: 'Commerce Accounts Fee', academicStream: 'Commerce', amount: 1500 }
    ],
    attendance: [
      { id: 'att-sci', studentId: 's-sci', className: 'Class 11', section: 'A', academicStream: 'Science', status: 'Present' },
      { id: 'att-comm', studentId: 's-comm', className: 'Class 11', section: 'A', academicStream: 'Commerce', status: 'Present' }
    ]
  };

  const result = bnCascadeClassroomChanges(oldClasses, newClasses, students, operations);

  // Science student updated to A-Medical
  const sciStudent = result.updatedStudents.find(s => s.id === 's-sci');
  assert.equal(sciStudent.section, 'A-Medical');

  // Commerce student MUST remain untouched in section A
  const commStudent = result.updatedStudents.find(s => s.id === 's-comm');
  assert.equal(commStudent.section, 'A', 'Commerce student section must not be changed by Science class update');
  assert.equal(commStudent.academicStream, 'Commerce');

  // Fee structure isolation
  const commFee = result.updatedOperations.feeStructures.find(f => f.id === 'fs-comm');
  assert.equal(commFee.academicStream, 'Commerce');

  // Attendance isolation
  const commAtt = result.updatedOperations.attendance.find(a => a.id === 'att-comm');
  assert.equal(commAtt.section, 'A', 'Commerce attendance must not be mutated by Science class update');
});
