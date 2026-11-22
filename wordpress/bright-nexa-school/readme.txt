=== Bright Nexa School ===
Contributors: karangilotra555, karangilotra
Tags: school, admissions, education, school-management
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connect your WordPress school website to the free Bright Nexa School OS beta and receive admission enquiries in your school workspace.

== Description ==

Display an admission enquiry form with [bright_nexa_admissions]. School administrators can review incoming enquiries in Bright Nexa School OS. Enquiries do not create student records.

The full School OS is available during the free beta. Visit https://bright-nexa-school-os.onrender.com/school-beta.html to create a school and try the existing ERP and apps.

== Installation ==

1. Install and activate the plugin.
2. Sign in as the School Admin at Bright Nexa School OS. Use https://bright-nexa-school-os.onrender.com/teacher-access.html?view=wordpress on a desktop browser to open the inbox and generate a connection key.
3. Paste the key in WordPress under Settings → Bright Nexa School OS and save.
4. Add [bright_nexa_admissions] to a published page and exclude that page from full-page and CDN caching so the form security token stays current.
5. Submit a fictional enquiry and check the school inbox.

== Frequently Asked Questions ==

= Does this plugin create student records automatically? =
No. Admission enquiries are forwarded securely to the school's write-only Supabase intake and held in the School Admin workspace inbox for review. They do not create student records or change school database state without administrator action.

= Where are enquiry submissions stored? =
Enquiries are not stored in the WordPress database. They are securely forwarded via SSL directly to the school's isolated Bright Nexa School OS cloud workspace.

= What external services does this plugin communicate with? =
This plugin connects to the Bright Nexa School OS cloud service hosted on Render and the backend database hosted on Supabase to deliver admission enquiries.

== External services ==

This plugin uses the Bright Nexa School OS cloud service to deliver admission enquiries. It connects when a WordPress administrator saves the school connection key and a visitor submits the form with consent. The form forwards the parent or guardian name and email, any phone and year or grade provided, and the school's write-only key to the Bright Nexa Supabase project. The data is stored in that school's Bright Nexa workspace. No enquiry is stored by this plugin in the WordPress database. Clear the key in WordPress to disable the form, or revoke it in Bright Nexa to disconnect the site.

Service: https://bright-nexa-school-os.onrender.com/school-beta.html
Database provider: https://supabase.com/privacy

== Changelog ==

= 0.1.1 =
* Updated form input handling and verified compatibility with WordPress 7.1.

= 0.1.0 =
* Admission enquiry form and school-specific connection.
