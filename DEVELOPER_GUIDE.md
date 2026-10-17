# Bright Nexa — School OS 🎓
## Developer & AI Collaboration Guide (Codex / ChatGPT / Developers)

This repository has been structured so that **Codex, GitHub Copilot, ChatGPT, and human developers** can easily read, search, understand, and edit every component without hitting token/line-length errors.

---

## 📁 Repository Directory Structure

```text
├── app-extracted/
│   ├── src/
│   │   └── BrightNexaApp.jsx           <-- Fully unminified, readable React/JSX source code (~43,000 lines)
│   ├── dist/
│   │   ├── assets/
│   │   │   ├── index-brightnexa-v2.js  <-- Prettier-formatted active JS bundle (~36,000 lines, cleanly indented)
│   │   │   └── index-C1ADVAqn.css      <-- Prettier-formatted CSS (~8,000 lines, includes A4 marksheet styles)
│   │   └── index.html                  <-- Frontend web shell & PWA manifest
│   ├── electron/
│   │   ├── main.cjs                    <-- Electron main process, Google Drive & WhatsApp IPC handlers
│   │   ├── preload.cjs                 <-- Secure context bridge exposing window.brightNexa
│   │   ├── googleDrive.cjs             <-- Google Drive OAuth & Encrypted Cloud Backup
│   │   └── whatsapp/                   <-- Modular WhatsApp Cloud API Service & Scheduler
│   │       ├── whatsappService.cjs     <-- Meta Cloud API client (sendTemplateMessage, etc.)
│   │       ├── scheduler.cjs           <-- Background timer for automatic daily reminders
│   │       ├── templates.json          <-- Meta-approved template definitions & variables
│   │       ├── whatsapp-config.json.example
│   │       └── README.md               <-- Step-by-step WhatsApp setup guide
│   └── package.json
├── docs/                               <-- Standalone web portal build (GitHub Pages / browser hosting)
│   ├── assets/
│   │   ├── index-brightnexa-v2.js      <-- Formatted runtime bundle
│   │   └── index-C1ADVAqn.css
│   └── index.html
├── resources/
│   └── app.asar                        <-- Packaged desktop application bundle
├── Bright Nexa School OS.exe           <-- Portable Windows Desktop application executable
└── README.md
```

---

## 🛠️ Key Modules & Where to Make Changes

### 1. Student Marksheet (A4 Academic Certificate)
* **CSS Layout:** Located in `app-extracted/dist/assets/index-C1ADVAqn.css` and `docs/assets/index-C1ADVAqn.css` under `.marksheet-certificate`, `.marksheet-border-frame`, `.marksheet-table`.
* **Logic & Print:** Located in `BrightNexaApp.jsx` and `index-brightnexa-v2.js` around marksheet rendering and student report card export.

### 2. WhatsApp Cloud API & Automated Reminders
* Located in `app-extracted/electron/whatsapp/`.
* **`whatsappService.cjs`**: Sends Fee Due reminders, Absent alerts, and Payment Receipts. Supports simulation mode if credentials are not configured.
* **`scheduler.cjs`**: Periodic cron check for morning absent alerts and evening fee reminders.
* **Frontend Access:** Use `window.brightNexa.whatsapp` in the browser or Electron renderer.

### 3. Google Drive Auto-Sync
* Located in `app-extracted/electron/googleDrive.cjs`.
* Backs up encrypted institutional data directly to the school's own Google Drive account with zero server hosting costs.

### 4. Branding & Contact Details
* Official Developer: **Karan Gilotra (Bright Nexa)**
* WhatsApp: **+91 7500058655**
* Office: **Shivalik Enclave, Phase 1, Shivalik Nagar, Haridwar**

---

## ⚡ How to Edit and Verify Changes

1. **Editing Frontend Code:**
   * You can edit `app-extracted/src/BrightNexaApp.jsx` for JSX structure or directly edit `app-extracted/dist/assets/index-brightnexa-v2.js`.
   * Both files are formatted with regular line lengths (no 645,000-character single-line freezes).
   * Verify JavaScript syntax after editing:
     ```bash
     node -c "app-extracted/dist/assets/index-brightnexa-v2.js"
     ```

2. **Syncing to Web / GitHub Pages:**
   * Always keep `docs/assets/` synchronized with `app-extracted/dist/assets/` so the GitHub Pages web version matches.

3. **Repacking for Windows Desktop App:**
   * To update `resources/app.asar` after modifying `app-extracted`:
     ```bash
     npx -y @electron/asar pack app-extracted resources/app.asar --unpack "{*.node,*.exe,node_modules/@rollup/*,node_modules/@rolldown/*,node_modules/lightningcss*/*,node_modules/jszip/*}"
     ```

---

## 📄 License
Proprietary © Bright Nexa — Karan Gilotra. All rights reserved.
