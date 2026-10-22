# Bright Nexa — School OS 🎓

> **Cloud-first School & Coaching Management Platform — pilot release**  
> Developed by **Karan Gilotra** (Bright Nexa)

Bright Nexa is a cloud-first school management platform under active development. The desktop/offline build is optional, not the default product. The existing static School OS demo is **not yet connected end-to-end** to the production school database; role-protected teacher APIs and the Parents App are pilots until live tenant onboarding and complete sync are verified.

---

## ✨ Features

- 🏛️ **Student & Admission Management**: Complete record keeping, roll numbers, classes, sections, and parent contact information.
- 👨‍🏫 **Staff & Teacher Profiles**: Teaching & non-teaching staff registry, designation, attendance, and salary details.
- 🚌 **Transport Operations**: Vehicle registration, driver/helper profiles, route planning, stops, and student transport assignment.
- 💰 **Fee Management & Receipts**: Automated fee breakdown, balance calculations, receipts, and offline invoice generation.
- 📊 **Expenses & Budget Control**: Audit trails for institutional expenses, approvals, and category-wise spending.
- 🏫 **Campus & Infrastructure**: Inventory of physical classrooms, labs, furniture, computers, and maintenance schedules.
- ☁️ **Cloud Integration**: Supabase tenant-aware role security and teacher access pilot. Full School OS ↔ Parents App sync remains in development.
- 📱 **Browser / PWA + Optional Desktop**: Browser is the intended default; local install only on school request. Android Parents demo APK is for testing, not production records.

---

## 🚀 Live Web Access

Current test portals:
- School OS static demo: https://bright-nexa-school-os.onrender.com (demo content; not yet end-to-end cloud synced).
- Teacher and Staff Portal: https://bright-nexa-school-os.onrender.com/teacher-access.html (Supabase Auth + RLS; verified school onboarding required).
- Parents Android App: demo APK downloadable via School OS link. Verified guardian login is pending before real use.

See [teacher onboarding](docs/CLOUD_TEACHER_ROLLOUT.md) and [security review](docs/SECURITY_REVIEW_20261022.md) before connecting real records.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vanilla CSS (Modern Design System), Lucide Icons, ExcelJS
- **Desktop Runtime**: Electron
- **Sync & Backup**: Google OAuth 2.0 & Google Drive API
- **Offline Storage**: IndexedDB / LocalStorage / Service Worker (PWA)

---

## 📄 License

Proprietary © Bright Nexa — Karan Gilotra. All rights reserved.
