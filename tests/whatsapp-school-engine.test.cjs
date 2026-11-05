'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const engine = require('../whatsapp-school-engine.js');

test('normalizeIndianPhone handles standard 10-digit, +91, leading 0 and dashes', () => {
  assert.equal(engine.normalizeIndianPhone('9876543210'), '919876543210');
  assert.equal(engine.normalizeIndianPhone('+91 98765-43210'), '919876543210');
  assert.equal(engine.normalizeIndianPhone('09876543210'), '919876543210');
  assert.equal(engine.normalizeIndianPhone('+91 (987) 654-3210'), '919876543210');
  assert.equal(engine.normalizeIndianPhone('919876543210'), '919876543210');
  assert.equal(engine.normalizeIndianPhone(''), '');
  assert.equal(engine.normalizeIndianPhone(null), '');
});

test('buildWhatsAppUrl creates valid WhatsApp Web and wa.me links with escaped text', () => {
  const urlWeb = engine.buildWhatsAppUrl('9876543210', 'Hello *World* & Test!', 'web');
  assert.ok(urlWeb.startsWith('https://web.whatsapp.com/send?phone=919876543210&text='));
  assert.ok(urlWeb.includes('Hello%20*World*%20%26%20Test!'));

  const urlWaMe = engine.buildWhatsAppUrl('+91 9876543210', 'Fee Due: ₹3,500', 'wa_me');
  assert.ok(urlWaMe.startsWith('https://wa.me/919876543210?text='));
  assert.ok(urlWaMe.includes('%E2%82%B93%2C500'));
});

test('createAbsenteeMessage formats Hindi/English polite notice with student and class', () => {
  const msg = engine.createAbsenteeMessage({
    schoolName: 'Haridwar Public School',
    studentName: 'Aarav Sharma',
    className: '7',
    section: 'A',
    date: '2026-11-05',
    schoolPhone: '+91 7500058655'
  });

  assert.ok(msg.includes('Haridwar Public School • Attendance Notice'));
  assert.ok(msg.includes('*Aarav Sharma* (Class: 7-A)'));
  assert.ok(msg.includes('ABSENT (Gairhaazir)'));
  assert.ok(msg.includes('7500058655'));
});

test('createFeeReminderMessage formats amount, month and admission number in INR', () => {
  const msg = engine.createFeeReminderMessage({
    schoolName: 'Haridwar Public School',
    studentName: 'Ishaan Verma',
    admissionNumber: 'HPS-2026-088',
    className: '8',
    section: 'B',
    month: 'November 2026',
    amountDue: 4500,
    dueDate: '2026-11-10',
    schoolPhone: '+91 7500058655'
  });

  assert.ok(msg.includes('Haridwar Public School • Fee Reminder'));
  assert.ok(msg.includes('*Ishaan Verma* (Class: 8-B) [Adm No: HPS-2026-088]'));
  assert.ok(msg.includes('₹4,500'));
  assert.ok(msg.includes('November 2026'));
  assert.ok(msg.includes('Accounts Helpline: +91 7500058655'));
});

test('createPtmMessage formats exam name, student, timing and venue', () => {
  const msg = engine.createPtmMessage({
    schoolName: 'Haridwar Public School',
    studentName: 'Riya Gupta',
    className: '10',
    section: 'A',
    examName: 'Mid-Term Periodic Assessment',
    ptmDate: '2026-11-15',
    ptmTime: '9:30 AM to 1:00 PM',
    venue: 'School Auditorium',
    schoolPhone: '+91 7500058655'
  });

  assert.ok(msg.includes('Haridwar Public School • PTM & Report Card Invite'));
  assert.ok(msg.includes('*Mid-Term Periodic Assessment*'));
  assert.ok(msg.includes('Riya Gupta (10-A)'));
  assert.ok(msg.includes('9:30 AM to 1:00 PM'));
  assert.ok(msg.includes('School Auditorium'));
});

test('createEmergencyNoticeMessage formats circular title, dates and school authority', () => {
  const msg = engine.createEmergencyNoticeMessage({
    schoolName: 'Haridwar Public School',
    title: 'Severe Cold Wave & Fog Holiday as per DM Order',
    description: 'As per District Magistrate orders, classes Nursery to 8th will remain closed.',
    startDate: '06-Nov-2026',
    reopeningDate: '09-Nov-2026',
    schoolPhone: '+91 7500058655'
  });

  assert.ok(msg.includes('Haridwar Public School • Official Circular'));
  assert.ok(msg.includes('Severe Cold Wave & Fog Holiday as per DM Order'));
  assert.ok(msg.includes('District Magistrate orders'));
  assert.ok(msg.includes('*Effective From:* 06-Nov-2026'));
  assert.ok(msg.includes('*School Reopens On:* 09-Nov-2026'));
});

test('WhatsAppQueue manages items, tracks progression, handles skip and completion', () => {
  const items = [
    { id: '1', name: 'Parent 1', phone: '9876543210', text: 'Msg 1' },
    { id: '2', name: 'Parent 2', phone: '9876543211', text: 'Msg 2' },
    { id: '3', name: 'Parent 3', phone: '9876543212', text: 'Msg 3' }
  ];

  let completed = false;
  const queue = new engine.WhatsAppQueue({
    items,
    delaySeconds: 1,
    onComplete: (progress) => {
      completed = true;
      assert.equal(progress.total, 3);
      assert.equal(progress.sent, 0);
      assert.equal(progress.confirmed, 2);
      assert.equal(progress.skipped, 1);
    }
  });

  assert.equal(queue.items.length, 3);
  assert.equal(queue.getCurrent().name, 'Parent 1');

  // Opening a draft is not a send receipt; explicit manual confirmation progresses.
  const priorWindow = global.window;
  global.window = {open: () => ({closed:false})};
  queue.sendCurrent();
  assert.equal(queue.currentIndex, 0);
  assert.equal(queue.items[0].status, 'opened');
  queue.confirmCurrentSent();
  assert.equal(queue.items[0].status, 'confirmed');
  assert.ok(queue.items[0].confirmedAt);
  assert.equal(queue.currentIndex, 1);

  // Skip second item
  queue.skipCurrent();
  assert.equal(queue.items[1].status, 'skipped');
  assert.equal(queue.currentIndex, 2);

  // Send third item
  queue.sendCurrent();
  queue.confirmCurrentSent();
  assert.equal(queue.items[2].status, 'confirmed');
  if (priorWindow === undefined) delete global.window; else global.window = priorWindow;
  assert.equal(completed, true);
});
