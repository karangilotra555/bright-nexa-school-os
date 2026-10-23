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
- Secure School Login (owner + staff, one entry): https://bright-nexa-school-os.onrender.com/ (verified cloud school role required; no public owner dashboard).
- Read-only product sample: https://bright-nexa-school-os.onrender.com/school-preview.html (fictional data only).
- Owner-only interactive sample: https://bright-nexa-school-os.onrender.com/school-demo.html (signed-in cloud school_admin only; still not production school data).
- Teacher and Staff Portal legacy link: https://bright-nexa-school-os.onrender.com/teacher-access.html (same Supabase Auth + RLS as School Login; verified school onboarding required).
- Parents Android App: demo APK downloadable via School OS link. Verified guardian login is pending before real use.

See [teacher onboarding](docs/CLOUD_TEACHER_ROLLOUT.md) and [security review](docs/SECURITY_REVIEW_20261022.md) before connecting real records.

---

## Demo login (fictional school only)

On the School Login screen, use **ID: demo** and **Password: demo**.
This opens the isolated, locally simulated School OS dashboard. The demo marker
does not issue a Supabase Auth session, grant privileges, or access real school
data. Real staff must sign in with their invited email and password.

## 🏫 Create your first school

1. Open the secure login, choose **Create School (New Owner)**, enter the official school name, owner email and a strong password.
2. Verify the email via the Supabase Auth message, then return to the site and sign in (teacher/staff cannot self-assign to an existing school).
3. Confirm the school name in **Create your school**. The protected `register_first_school` RPC checks that the Auth email is verified, the account has no other school membership, and creates the school + admin membership + audit entry in one transaction.
4. Invite staff and assign class permissions using the school admin portal. The old React owner dashboard remains a fictional sample and is **not** connected to the live school database.

**Deployment prerequisite:** In Supabase Auth URL Configuration add `https://bright-nexa-school-os.onrender.com/teacher-access.html` as an approved redirect (and the site root, if the Site URL is used). Enable email verification and protect public email signup with rate limits/CAPTCHA for production. This establishes a trial account, **not proof of legal ownership of a school**.

## 🛠️ Technology Stack

- **Frontend**: React 19, Vanilla CSS (Modern Design System), Lucide Icons, ExcelJS
- **Desktop Runtime**: Electron
- **Sync & Backup**: Google OAuth 2.0 & Google Drive API
- **Offline Storage**: IndexedDB / LocalStorage / Service Worker (PWA)

---

## 📄 License

Proprietary © Bright Nexa — Karan Gilotra. All rights reserved.
