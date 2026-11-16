'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app-extracted/src/BrightNexaApp.jsx'), 'utf8');

// Extract Xn (obligation calculation function) and dependencies from BrightNexaApp.jsx
const start = source.indexOf('function Vn(e) {');
const end = source.indexOf('function buildPendingFeeReport(', start);
assert.ok(start >= 0 && end > start, 'Fee calculation routines must exist in BrightNexaApp.jsx');
const isolated = source.slice(start, end);

function getCalculateObligations() {
  const context = {
    Math, Number, String, Map, Set, Array,
    // Add any needed globals
  };
  vm.runInNewContext(isolated + '\nthis.calculate = Xn;', context);
  return context.calculate;
}

test('calculateFeeObligations credits payments from externalFeeLedger when local feePayments is empty', () => {
  const calculate = getCalculateObligations();

  const student = { id: 's-1', className: '10', section: 'A', status: 'Active' };
  const institution = { session: '2026-2027' };
  const operations = {
    feeStructures: [
      { id: 'fs-1', category: 'Tuition Fee', className: '10', amount: 4000, frequency: 'Annual', active: true }
    ],
    feePayments: [],
    externalFeeLedger: [
      {
        id: 'ext-1',
        studentId: 's-1',
        kind: 'payment',
        amountRupees: 4000,
        reference: 'RCP-20261116-ABCD',
        description: 'Tuition Fee',
        date: '2026-11-16'
      }
    ]
  };

  const obligations = calculate(operations, student, institution);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].amount, 4000);
  assert.equal(obligations[0].credited, 4000, 'Accountant payment from externalFeeLedger must be credited');
  assert.equal(obligations[0].balance, 0, 'Balance must be 0 after full payment in Staff Portal');
  assert.equal(obligations[0].status, 'Paid');
});

test('calculateFeeObligations respects reversal entries in externalFeeLedger', () => {
  const calculate = getCalculateObligations();

  const student = { id: 's-1', className: '10', section: 'A', status: 'Active' };
  const institution = { session: '2026-2027' };
  const operations = {
    feeStructures: [
      { id: 'fs-1', category: 'Tuition Fee', className: '10', amount: 4000, frequency: 'Annual', active: true }
    ],
    feePayments: [],
    externalFeeLedger: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        studentId: 's-1',
        kind: 'payment',
        amountRupees: 1000,
        reference: 'RCP-20261116-VALID',
        description: 'Tuition Fee',
        date: '2026-11-16'
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        studentId: 's-1',
        kind: 'payment',
        amountRupees: 3000,
        reference: 'RCP-20261116-ORIG',
        description: 'Tuition Fee',
        date: '2026-11-16'
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        studentId: 's-1',
        kind: 'charge',
        amountRupees: 3000,
        reference: 'REV-33333333-3333-3333-3333-333333333333',
        description: 'Correction reversal of 33333333-3333-3333-3333-333333333333',
        date: '2026-11-16'
      }
    ]
  };

  const obligations = calculate(operations, student, institution);
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].amount, 4000);
  assert.equal(obligations[0].credited, 1000, 'Only the valid non-reversed payment must be credited');
  assert.equal(obligations[0].balance, 3000, 'Balance must be 3000 after 1000 credited');
  assert.equal(obligations[0].status, 'Partially Paid');
});

test('workspace projection does not turn an Accountant receipt into a second ledger payment', () => {
  const { buildProjection } = require('../school-workspace-cloud.js');
  const student = {
    id: 's-1', name: 'Student', admissionNumber: 'A1', dateOfBirth: '2015-02-03',
    className: '10', section: 'A', status: 'Active'
  };
  const institution = { id: 'school', name: 'School', session: '2026-2027' };
  const operations = {
    classes: [{ id: 'c-1', name: '10', section: 'A' }],
    feeStructures: [
      { id: 'fs-1', className: '10', category: 'Tuition Fee', amount: 4000, frequency: 'Annual' }
    ],
    feePayments: [{
      id: 'local-receipt', studentId: 's-1', category: 'Tuition Fee', amount: 1000,
      baseAmountReceived: 1000, status: 'Posted'
    }],
    externalFeeLedger: [{
      id: 'cloud-receipt', studentId: 's-1', kind: 'payment', amountRupees: 3000,
      reference: 'STAFF-01', description: 'Tuition Fee', date: '2026-11-16'
    }]
  };
  const calculate = getCalculateObligations();
  const snapshot = { institution: { institution }, students: [student], operations };
  const baseline = { ...snapshot, operations: { ...operations, externalFeeLedger: [] } };
  assert.equal(calculate(operations, student, institution)[0].balance, 0);
  const expected = buildProjection(baseline, calculate).fees;
  assert.equal(expected.find(fee => fee.kind === 'payment').amountRupees, 1000);
  assert.deepEqual(buildProjection(snapshot, calculate).fees, expected);
  assert.equal(snapshot.operations.externalFeeLedger.length, 1);
});
