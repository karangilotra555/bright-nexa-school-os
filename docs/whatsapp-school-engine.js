/**
 * Bright Nexa School OS - WhatsApp School Operations Engine
 * WhatsApp Web draft preparation and explicit manual confirmation
 * Covers:
 * 1. Daily Absentee Alerts (Attendance)
 * 2. Pending Fee Reminders (Fees)
 * 3. Report Card / PTM Invites (Academics)
 * 4. Emergency Holiday / Weather / DM Notices (Circulars)
 */
(function(root) {
  'use strict';

  /**
   * Normalizes Indian mobile number to clean digits with '91' prefix.
   * Strips spaces, dashes, parentheses, '+', and leading '0'.
   */
  function normalizeIndianPhone(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/\D+/g, '');
    if (!digits) return '';

    // If starts with 0 and is 11 digits (e.g. 09876543210), strip the leading 0
    if (digits.length === 11 && digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    // If 10 digits (standard Indian mobile), prepend 91
    if (digits.length === 10) {
      digits = '91' + digits;
    }

    // Valid Indian mobile numbers with country code must be 12 digits (91 + 10 digits starting with 6, 7, 8, or 9)
    if (digits.length === 12 && digits.startsWith('91')) {
      const firstMobileDigit = digits.charAt(2);
      if (['6', '7', '8', '9'].includes(firstMobileDigit)) {
        return digits;
      }
    }

    return '';
  }

  /**
   * Builds direct WhatsApp Web or wa.me chat URL with pre-filled message text.
   * Default target is 'web' for WhatsApp Web (`https://web.whatsapp.com/send?...`).
   */
  function buildWhatsAppUrl(phone, text, target = 'web') {
    const cleanPhone = normalizeIndianPhone(phone);
    if (!cleanPhone || !String(text || '').trim()) return '';
    const encodedText = encodeURIComponent(text || '');

    if (target === 'wa_me') {
      return `https://wa.me/${cleanPhone}?text=${encodedText}`;
    }

    // Default: WhatsApp Web direct chat trigger
    return `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }

  /**
   * 1. Attendance Absentee Alert Message
   */
  function createAbsenteeMessage({
    schoolName = 'Haridwar Public School',
    studentName = 'Student',
    className = '',
    section = '',
    date = '',
    schoolPhone = '+91 7500058655',
    reason = ''
  } = {}) {
    const classLabel = [className, section].filter(Boolean).join('-');
    const formattedDate = date ? new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) : 'aaj';

    return (
      `🔔 *${schoolName} • Attendance Notice*\n\n` +
      `Namaste,\n` +
      `Aapka bacha *${studentName}*${classLabel ? ` (Class: ${classLabel})` : ''} aaj *${formattedDate}* ko school me *ABSENT (Gairhaazir)* hai.\n\n` +
      (reason ? `📝 Note: ${reason}\n\n` : '') +
      `Agar bacha kisi kaaran se nahi aa paya hai toh kripya school office ko suchit karein.\n` +
      `📞 School Helpline: ${schoolPhone}\n\n` +
      `_Dhanyawaad • ${schoolName}_`
    );
  }

  /**
   * 2. Pending Fee Reminder Message
   */
  function createFeeReminderMessage({
    schoolName = 'Haridwar Public School',
    studentName = 'Student',
    admissionNumber = '',
    className = '',
    section = '',
    month = '',
    amountDue = 0,
    dueDate = '',
    schoolPhone = '+91 7500058655'
  } = {}) {
    const classLabel = [className, section].filter(Boolean).join('-');
    const inrAmount = Number(amountDue || 0).toLocaleString('en-IN', {
      maximumFractionDigits: 0
    });
    const formattedDue = dueDate ? new Date(dueDate + 'T00:00:00Z').toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) : 'turant';

    return (
      `💳 *${schoolName} • Fee Reminder*\n\n` +
      `Namaste Parent,\n` +
      `Aapke bache *${studentName}*${classLabel ? ` (Class: ${classLabel})` : ''}${admissionNumber ? ` [Adm No: ${admissionNumber}]` : ''} ki school fees pending hai:\n\n` +
      `📌 *Total Baaki Fees:* ₹${inrAmount}\n` +
      (month ? `📅 *Month / Period:* ${month}\n` : '') +
      `⏳ *Due Date:* ${formattedDue}\n\n` +
      `Kripya baaki fees school accounts counter par ya authorized mode se jama karein.\n` +
      `Kisi bhi jaankari ya receipt ke liye accounts office se sampark karein:\n` +
      `📞 Accounts Helpline: ${schoolPhone}\n\n` +
      `_Dhanyawaad • ${schoolName}_`
    );
  }

  /**
   * 3. Report Card / PTM Invitation Message
   */
  function createPtmMessage({
    schoolName = 'Haridwar Public School',
    studentName = 'Student',
    className = '',
    section = '',
    examName = 'Term Examination',
    ptmDate = '',
    ptmTime = '9:00 AM - 12:30 PM',
    venue = 'School Campus',
    schoolPhone = '+91 7500058655'
  } = {}) {
    const classLabel = [className, section].filter(Boolean).join('-');
    const formattedDate = ptmDate ? new Date(ptmDate + 'T00:00:00Z').toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) : 'Upcoming PTM';

    return (
      `📝 *${schoolName} • PTM & Report Card Invite*\n\n` +
      `Respected Parents,\n` +
      `*${examName}* ke report cards aur bache ki academic progress discuss karne ke liye Parent-Teacher Meeting (PTM) aayojit ki gayi hai.\n\n` +
      `👤 *Student:* ${studentName}${classLabel ? ` (${classLabel})` : ''}\n` +
      `📅 *Date:* ${formattedDate}\n` +
      `⏰ *Timing:* ${ptmTime}\n` +
      `📍 *Venue:* ${venue}\n\n` +
      `Aapki upasthiti bache ke utsahwardhan ke liye zaroori hai. Kripya nirdharit samay par padhaarein.\n` +
      `📞 Sampark: ${schoolPhone}\n\n` +
      `_Warm Regards • ${schoolName}_`
    );
  }

  /**
   * 4. Emergency Holiday / Circular Notice Message
   */
  function createEmergencyNoticeMessage({
    schoolName = 'Haridwar Public School',
    title = 'School Notice',
    description = '',
    startDate = '',
    reopeningDate = '',
    schoolPhone = '+91 7500058655'
  } = {}) {
    return (
      `📢 *${schoolName} • Official Circular*\n\n` +
      `*Subject: ${title}*\n\n` +
      (description ? `${description}\n\n` : '') +
      (startDate ? `📅 *Effective From:* ${startDate}\n` : '') +
      (reopeningDate ? `🏫 *School Reopens On:* ${reopeningDate}\n` : '') +
      `Kripya dhyan dein aur bacho ko nirdeshon ka paalan karne kahein.\n\n` +
      `Kisi bhi emergency ya jaankari ke liye school helpdesk se sampark karein:\n` +
      `📞 Helpline: ${schoolPhone}\n\n` +
      `_Issued by: Administration • ${schoolName}_`
    );
  }

  /**
   * Fast-Track Queue Controller for Human-Paced WhatsApp Sending
   */
  class WhatsAppQueue {
    constructor({ items = [], delaySeconds = 3, onUpdate = null, onComplete = null } = {}) {
      this.items = items.map((item, idx) => ({
        id: item.id || 'wa_' + idx,
        name: item.name || 'Parent',
        phone: item.phone || '',
        text: item.text || '',
        meta: item.meta || {},
        status: 'pending', // 'pending' | 'sent' | 'skipped'
        sentAt: null
      }));
      this.delaySeconds = Math.max(1, delaySeconds || 3);
      this.currentIndex = 0;
      this.isRunning = false;
      this.countdown = 0;
      this.timerId = null;
      this.onUpdate = onUpdate;
      this.onComplete = onComplete;
    }

    getCurrent() {
      if (this.currentIndex < 0 || this.currentIndex >= this.items.length) {
        return null;
      }
      return this.items[this.currentIndex];
    }

    getProgress() {
      const sent = this.items.filter(x => x.status === 'sent').length;
      const confirmed = this.items.filter(x => x.status === 'confirmed').length;
      const opened = this.items.filter(x => x.status === 'opened').length;
      const skipped = this.items.filter(x => x.status === 'skipped').length;
      const total = this.items.length;
      return {
        currentIndex: this.currentIndex,
        sent,
        confirmed,
        opened,
        skipped,
        total,
        remaining: total - (sent + confirmed + skipped),
        percent: total ? Math.round(((sent + confirmed + skipped) / total) * 100) : 0,
        isRunning: this.isRunning,
        countdown: this.countdown
      };
    }

    notify() {
      if (typeof this.onUpdate === 'function') {
        this.onUpdate(this.getProgress(), this.getCurrent());
      }
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.runNext();
    }

    pause() {
      this.isRunning = false;
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }
      this.countdown = 0;
      this.notify();
    }

    sendCurrent(openWindow = true) {
      const curr = this.getCurrent();
      if (!curr) return false;
      const url = buildWhatsAppUrl(curr.phone, curr.text, 'web');
      if (!url) {
        curr.status = 'invalid';
        this.notify();
        return false;
      }
      let popup = null;
      try {
        if (openWindow && typeof window !== 'undefined' && typeof window.open === 'function') {
          popup = window.open(url, 'BN_WhatsApp_Runner', 'width=1000,height=720,left=150,top=100');
        }
      } catch (_) {}
      if (!popup) {
        curr.status = 'blocked';
        this.notify();
        return false;
      }
      curr.status = 'opened';
      curr.openedAt = new Date().toISOString();
      this.notify();
      return true;
    }

    confirmCurrentSent() {
      const curr = this.getCurrent();
      if (!curr || curr.status !== 'opened') return false;
      curr.status = 'confirmed';
      curr.confirmedAt = new Date().toISOString();
      this.advance();
      return true;
    }

    skipCurrent() {
      const curr = this.getCurrent();
      if (!curr) return false;

      curr.status = 'skipped';
      this.advance();
      return true;
    }

    advance() {
      if (this.timerId) {
        clearTimeout(this.timerId);
        this.timerId = null;
      }

      this.currentIndex++;
      if (this.currentIndex >= this.items.length) {
        this.isRunning = false;
        this.countdown = 0;
        this.notify();
        if (typeof this.onComplete === 'function') {
          this.onComplete(this.getProgress(), this.items);
        }
        return;
      }

      this.notify();

      if (this.isRunning) {
        this.countdown = this.delaySeconds;
        this.tickCountdown();
      }
    }

    tickCountdown() {
      if (!this.isRunning) return;
      this.notify();

      if (this.countdown > 0) {
        this.countdown--;
        this.timerId = setTimeout(() => this.tickCountdown(), 1000);
      } else {
        this.runNext();
      }
    }

    runNext() {
      const curr = this.getCurrent();
      if (!curr) {
        this.isRunning = false;
        this.notify();
        return;
      }

      // A browser draft is not a send receipt. Opening requires a user gesture;
      // progressing requires explicit confirmation or skip.
      this.notify();
    }
  }

  const api = {
    normalizeIndianPhone,
    buildWhatsAppUrl,
    createAbsenteeMessage,
    createFeeReminderMessage,
    createPtmMessage,
    createEmergencyNoticeMessage,
    WhatsAppQueue
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.BNWhatsApp = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
