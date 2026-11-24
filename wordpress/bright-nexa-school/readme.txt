=== Bright Nexa School ===
Contributors: karangilotra555, karangilotra
Tags: school, admissions, education, school-management
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Connect your WordPress school website to the free Bright Nexa School OS beta. Receive admissions enquiries and open the full hosted school system from your WordPress admin.

== Description ==

Use [bright_nexa_admissions] to display a consent-based admission enquiry form. Enquiries arrive in the connected school's Bright Nexa inbox for review; submitting an enquiry never creates a student record.

WordPress administrators also get a Bright Nexa menu linking to the full hosted School OS for office staff, Leadership for verified Owners and Principals, the WordPress Admissions inbox, and Teacher/Parent mobile-app information. To offer school sign-in links on a selected public WordPress page, add [bright_nexa_school_portal]. No private school data or user passwords are stored by the WordPress integration.

The existing School OS, including its admissions, attendance, fees, timetable, exams, and other ERP screens, is hosted by Bright Nexa and requires separate verified school credentials. This plugin is a bridge and launcher, not a second standalone copy of the ERP in WordPress.

Visit https://bright-nexa-school-os.onrender.com/school-beta.html to create a free beta school or sign in. Review the service's privacy and terms links in the External services section before collecting real admission enquiries.

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

The plugin is an integration with the Bright Nexa School OS cloud service. It uses one external API for admission enquiries. The service is operated by the Bright Nexa project and uses Supabase for the backend database and Render for website hosting. The WordPress plugin is functional without connecting the form only as a launcher; its admission enquiry feature needs a valid school connection key and the external intake.

What is sent and when: Only when a site visitor submits the [bright_nexa_admissions] form with the required consent checkbox, the WordPress server sends a HTTPS POST request to https://mrfvbwmyxndrakskqyas.supabase.co/rest/v1/rpc/bn_wordpress_submit_enquiry. It contains parent/guardian name and email, optional phone and year/grade, and the school-specific write-only key. The key lets the service route the request to the correct school. The backend stores the enquiry in that school's private Bright Nexa admissions inbox for its authorized staff to review; it does not automatically create a student record. The plugin does not save the submitted enquiry in the WordPress database. The WordPress administrator's saved connection key is stored locally as a WordPress setting. Server providers may independently maintain technical access logs.

Navigation links opened from the Bright Nexa WordPress admin menu or the optional [bright_nexa_school_portal] shortcode lead to Bright Nexa's hosted site; they do not transfer WordPress school records or WordPress passwords. Separate Bright Nexa account sign-in may be required to use hosted features.

Bright Nexa service: https://bright-nexa-school-os.onrender.com/school-beta.html
Bright Nexa Privacy Policy: https://bright-nexa-school-os.onrender.com/privacy-policy.html
Bright Nexa Terms of Service: https://bright-nexa-school-os.onrender.com/terms-of-service.html
Supabase (database/API provider) privacy: https://supabase.com/privacy
Supabase terms: https://supabase.com/terms
Render (website hosting) privacy: https://render.com/privacy
Render terms: https://render.com/terms

To disconnect: Clear the key under Settings > Bright Nexa School OS and optionally revoke it in the Bright Nexa admin inbox. This disables new WordPress form transmissions but does not automatically delete earlier enquiries from the school's cloud inbox. Contact the school administrator or Bright Nexa support through the privacy policy for access/deletion requests.

== Changelog ==

= 0.2.1 =
* Documented the external intake, service providers, privacy policy, terms and data handling for WordPress.org review.
* Added privacy and terms links to the admission enquiry form and plugin settings.

= 0.2.0 =
* Added a WordPress admin launcher for the complete hosted School OS, Leadership and mobile-app instructions.
* Added an optional [bright_nexa_school_portal] public links shortcode.
* Tightened form input handling and server-side validation for published enquiry pages.

= 0.1.1 =
* Updated form input handling and verified compatibility with WordPress 7.1.

= 0.1.0 =
* Admission enquiry form and school-specific connection.
