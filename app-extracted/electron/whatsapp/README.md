# Bright Nexa — WhatsApp Cloud API & Scheduler Module 📱

> **Official Meta WhatsApp Cloud API Service for Bright Nexa School OS**  
> Developed by **Karan Gilotra (Bright Nexa)**

This module provides automated, reliable WhatsApp messaging directly from the School OS backend:
- **Fee Due & Overdue Reminders**
- **Student Attendance / Absent Alerts**
- **Fee Payment Receipts with receipt number and amount**
- **General Notices & Holiday Circulars**
- **Automated Background Scheduler**

---

## 🛠️ Architecture

1. **`whatsappService.cjs`**: Meta Graph API client that constructs template payloads and handles delivery.
2. **`scheduler.cjs`**: Background timer that processes reminder queues and checks for morning absent alerts and evening fee reminders.
3. **`templates.json`**: Definition of all Meta-approved utility message templates and their dynamic placeholders.
4. **`whatsapp-config.json`**: Local credentials file for the school (Phone Number ID, System User Access Token).

---

## 🚀 How to Enable Live WhatsApp Sending

1. Create a copy of `whatsapp-config.json.example` named `whatsapp-config.json`.
2. Fill in the school's Meta Cloud API credentials:
   ```json
   {
     "enabled": true,
     "mockMode": false,
     "phoneNumberId": "YOUR_META_PHONE_NUMBER_ID",
     "accessToken": "YOUR_META_ACCESS_TOKEN",
     "schoolName": "Bright Nexa Academy",
     "supportContact": "+91 7500058655"
   }
   ```
3. If `enabled` is set to `false` or credentials are left blank, the service automatically runs in **Simulation Mode** (logs messages locally without charging or failing).

---

## 📋 Available IPC Methods (for Frontend & Electron Main)

From the frontend (`window.electronAPI.whatsapp`) or Node.js:
- `whatsapp.sendFeeReminder({ studentName, parentPhone, dueAmount, dueDate })`
- `whatsapp.sendAbsentAlert({ studentName, parentPhone, date })`
- `whatsapp.sendReceipt({ studentName, parentPhone, receiptNo, amount, date })`
- `whatsapp.getConfig()`
- `whatsapp.saveConfig(patch)`
- `whatsapp.triggerSchedulerCheck()`

---

## 📄 License
Proprietary © Bright Nexa — Karan Gilotra. All rights reserved.
