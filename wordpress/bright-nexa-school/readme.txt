=== Bright Nexa School ===
Contributors: karangilotra555, karangilotra
Tags: school, admissions, education, school-management
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connect your WordPress school website to the free Bright Nexa School OS beta. Receive admissions enquiries and open the full hosted school system from your WordPress admin.

== Description ==

Use [bright_nexa_admissions] to display a consent-based admission enquiry form. Enquiries arrive in the connected school's Bright Nexa inbox for review; submitting an enquiry never creates a student record.

WordPress administrators also get a Bright Nexa menu linking to the full hosted School OS for office staff, Leadership for verified Owners and Principals, the WordPress Admissions inbox, and Teacher/Parent mobile-app information. To offer school sign-in links on a selected public WordPress page, add [bright_nexa_school_portal]. No private school data or user passwords are stored by the WordPress integration.

The existing School OS, including its admissions, attendance, fees, timetable, exams, and other ERP screens, is hosted by Bright Nexa and requires separate verified school credentials. This plugin is a bridge and launcher, not a second standalone copy of the ERP in WordPress.

Visit https://bright-nexa-school-os.onrender.com/school-beta.html to create a free beta school or sign in.

== Installation ==

1. Install and activate the plugin.
2. Sign in as the School Admin at Bright Nexa School OS. Use https://bright-nexa-school-os.onrender.com/teacher-access.html?view=wordpress on a desktop browser to open the inbox and generate a connection key.
3. Paste the key in WordPress under Settings → Bright Nexa School OS and save.
4. Add [bright_nexa_admissions] to a published page and exclude that page from full-page and CDN caching so the form security token stays current.
5. For safe testing, use a separate test school and fictional enquiry details. For real admission enquiries, parents may submit genuine details with consent.
6. WordPress admins can open the Bright Nexa menu to launch the full School OS. Optionally publish [bright_nexa_school_portal] on a page to show office, leadership, and app-information links.

== Frequently Asked Questions ==

= Are all School OS functions available inside WordPress? =
The plugin provides a secure launcher and admissions integration. The full ERP runs on Bright Nexa School OS after a separate school-account sign-in; it is not reimplemented in WordPress. Office and Principal access rules remain enforced by Bright Nexa, not WordPress roles.

= Does this plugin create student records automatically? =
No. Admission enquiries are forwarded securely to the school's write-only Supabase intake and held in the School Admin workspace inbox for review. They do not create student records or change school database state without administrator action.

= Can I use it with real admissions? =
Yes. Real parents can submit enquiries with consent, and they go to the connected school's own inbox. For tests, use a separate school and fictional details so you do not mix sample records with a real school's data.

= Where are enquiry submissions stored? =
Enquiries are not stored in the WordPress database. They are securely forwarded via SSL directly to the school's isolated Bright Nexa School OS cloud workspace.

= What external services does this plugin communicate with? =
This plugin connects to the Bright Nexa School OS cloud service hosted on Render and the backend database hosted on Supabase to deliver admission enquiries.

== External services ==

This plugin uses the Bright Nexa School OS cloud service to deliver admission enquiries. It connects only when a visitor submits the enquiry form with consent, after a WordPress administrator has saved a school connection key. The WordPress navigation links open the Bright Nexa site in the visitor's browser but do not themselves transmit school records. The form forwards the parent or guardian name and email, any phone and year or grade provided, and the school's write-only key to the Bright Nexa Supabase project. The data is stored in that school's Bright Nexa workspace. No enquiry is stored by this plugin in the WordPress database. Clear the key in WordPress to disable the form, or revoke it in Bright Nexa to disconnect the site.

Service: https://bright-nexa-school-os.onrender.com/school-beta.html
Database provider: https://supabase.com/privacy

== Changelog ==

= 0.2.0 =
* Added a WordPress admin launcher for the complete hosted School OS, Leadership and mobile-app instructions.
* Added an optional [bright_nexa_school_portal] public links shortcode.
* Tightened form input handling and server-side validation for published enquiry pages.

= 0.1.1 =
* Updated form input handling and verified compatibility with WordPress 7.1.

= 0.1.0 =
* Admission enquiry form and school-specific connection.
