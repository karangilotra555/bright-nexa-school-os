<?php
/**
 * Plugin Name: Bright Nexa School
 * Plugin URI: https://bright-nexa-school-os.onrender.com/school-beta.html
 * Description: Connect admission enquiries and access the hosted Bright Nexa School OS from WordPress.
 * Version: 0.2.0
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Author: Bright Nexa
 * Author URI: https://bright-nexa-school-os.onrender.com
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: bright-nexa-school
 */

namespace BrightNexa\School;

defined( 'ABSPATH' ) || exit;

const CLOUD = 'https://bright-nexa-school-os.onrender.com';
const INTAKE = 'https://mrfvbwmyxndrakskqyas.supabase.co/rest/v1/rpc/bn_wordpress_submit_enquiry';
const PUBLISHABLE_KEY = 'sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
const OPTION = 'bright_nexa_school_enquiry_key';
const ACTION = 'bright_nexa_school_enquiry';

add_action( 'admin_menu', __NAMESPACE__ . '\\add_settings_page' );
add_action( 'admin_init', __NAMESPACE__ . '\\register_settings' );
add_shortcode( 'bright_nexa_admissions', __NAMESPACE__ . '\\render_form' );
add_shortcode( 'bright_nexa_school_portal', __NAMESPACE__ . '\\render_portal' );
add_action( 'admin_post_' . ACTION, __NAMESPACE__ . '\\submit' );
add_action( 'admin_post_nopriv_' . ACTION, __NAMESPACE__ . '\\submit' );

function add_settings_page() {
	add_options_page(
		__( 'Bright Nexa School OS', 'bright-nexa-school' ),
		__( 'Bright Nexa School OS', 'bright-nexa-school' ),
		'manage_options', 'bright-nexa-school', __NAMESPACE__ . '\\render_settings'
	);
	add_menu_page(
		__( 'Bright Nexa School OS', 'bright-nexa-school' ),
		__( 'Bright Nexa', 'bright-nexa-school' ),
		'manage_options', 'bright-nexa-school-workspace', __NAMESPACE__ . '\\render_workspace',
		'dashicons-welcome-learn-more', 58
	);
}


/**
 * Only navigation is hosted in WordPress. All school records and role checks
 * stay in the signed-in Bright Nexa service; no school credentials are copied
 * to WordPress, and these links perform no background requests.
 */
function workspace_links() {
	return array(
		__( 'Full School OS — Owner, Admin & Accountant', 'bright-nexa-school' ) => CLOUD . '/teacher-access.html',
		__( 'Leadership App — Owner & Principal', 'bright-nexa-school' ) => CLOUD . '/leadership.html',
		__( 'WordPress Admissions inbox — School Admin', 'bright-nexa-school' ) => CLOUD . '/teacher-access.html?view=wordpress',
		__( 'Teacher & Parent mobile app information', 'bright-nexa-school' ) => CLOUD . '/parent-app-download.html',
		__( 'Create a free school or sign in', 'bright-nexa-school' ) => CLOUD . '/school-beta.html',
	);
}

function render_workspace() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Bright Nexa School OS', 'bright-nexa-school' ); ?></h1>
		<p><?php esc_html_e( 'These links open Bright Nexa School OS securely in a new tab. School users sign in there with their existing school account; WordPress administrator access does not grant access to student records.', 'bright-nexa-school' ); ?></p>
		<ul>
			<?php foreach ( workspace_links() as $title => $url ) : ?>
				<li><a href="<?php echo esc_url( $url ); ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html( $title ); ?></a></li>
			<?php endforeach; ?>
		</ul>
		<p><a class="button button-primary" href="<?php echo esc_url( admin_url( 'options-general.php?page=bright-nexa-school' ) ); ?>"><?php esc_html_e( 'Configure admission enquiries', 'bright-nexa-school' ); ?></a></p>
		<p><?php esc_html_e( 'The full ERP is hosted by Bright Nexa and is not installed inside WordPress. No student, staff, fee, or attendance data is copied into WordPress by these links.', 'bright-nexa-school' ); ?></p>
	</div>
	<?php
}

/**
 * Optional school-site portal: the site owner explicitly places the shortcode.
 * Only public sign-in or app-information links are shown, never private records.
 */
function render_portal() {
	$links = array(
		__( 'School office sign-in', 'bright-nexa-school' ) => CLOUD . '/teacher-access.html',
		__( 'Owner & Principal leadership', 'bright-nexa-school' ) => CLOUD . '/leadership.html',
		__( 'Teacher & Parent mobile apps', 'bright-nexa-school' ) => CLOUD . '/parent-app-download.html',
	);
	ob_start();
	?>
	<nav class="bright-nexa-school-portal" aria-label="<?php esc_attr_e( 'Bright Nexa School portals', 'bright-nexa-school' ); ?>">
		<p><?php esc_html_e( 'Open the Bright Nexa School OS service. Your school account is required; this WordPress site does not handle school passwords.', 'bright-nexa-school' ); ?></p>
		<ul>
			<?php foreach ( $links as $title => $url ) : ?>
				<li><a href="<?php echo esc_url( $url ); ?>" rel="noopener noreferrer"><?php echo esc_html( $title ); ?></a></li>
			<?php endforeach; ?>
		</ul>
	</nav>
	<?php
	return ob_get_clean();
}

function register_settings() {
	register_setting( 'bright_nexa_school', OPTION, array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => __NAMESPACE__ . '\\sanitize_key',
	) );
}

function sanitize_key( $incoming ) {
	$incoming = is_string( $incoming ) ? trim( $incoming ) : '';
	if ( '' === $incoming || preg_match( '/^[a-f0-9]{64}$/D', $incoming ) ) {
		return $incoming;
	}
	add_settings_error( OPTION, 'invalid_key', __( 'Enter the connection key shown in Bright Nexa School OS.', 'bright-nexa-school' ) );
	return get_option( OPTION, '' );
}

function render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$key = get_option( OPTION, '' );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Bright Nexa School OS', 'bright-nexa-school' ); ?></h1>
		<p><a href="<?php echo esc_url( CLOUD . '/teacher-access.html?view=wordpress' ); ?>"><?php esc_html_e( 'Open WordPress Admissions', 'bright-nexa-school' ); ?></a> · <a href="<?php echo esc_url( CLOUD . '/school-beta.html' ); ?>"><?php esc_html_e( 'Create a free school or sign in', 'bright-nexa-school' ); ?></a></p>
		<ol>
			<li><?php esc_html_e( 'In Bright Nexa School OS, open the School Admin workspace, then WordPress Admissions. Generate a connection key.', 'bright-nexa-school' ); ?></li>
			<li><?php esc_html_e( 'Paste the key below. Add the shortcode to a published page and exclude that page from full-page caching.', 'bright-nexa-school' ); ?> <code>[bright_nexa_admissions]</code></li>
			<li><?php esc_html_e( 'Submit one fictional enquiry and check the WordPress Admissions inbox in Bright Nexa.', 'bright-nexa-school' ); ?></li>
		</ol>
		<p><?php esc_html_e( 'Saving a key enables sending the parent or guardian name, email, optional phone and grade to Bright Nexa School OS when an enquiry is submitted. Clear the key here to disable the form.', 'bright-nexa-school' ); ?></p>
		<p><?php esc_html_e( 'To display links to the full hosted school system on a WordPress page, use [bright_nexa_school_portal]. This does not copy private school information or make it accessible without Bright Nexa sign-in.', 'bright-nexa-school' ); ?></p>
		<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=bright-nexa-school-workspace' ) ); ?>"><?php esc_html_e( 'Open the full School OS dashboard links', 'bright-nexa-school' ); ?></a></p>
		<p><?php echo esc_html( $key ? __( 'A connection key is saved.', 'bright-nexa-school' ) : __( 'No connection key saved.', 'bright-nexa-school' ) ); ?></p>
		<form method="post" action="options.php">
			<?php settings_fields( 'bright_nexa_school' ); ?>
			<label for="bright-nexa-key"><?php esc_html_e( 'School connection key', 'bright-nexa-school' ); ?></label>
			<input id="bright-nexa-key" type="password" class="regular-text" name="<?php echo esc_attr( OPTION ); ?>"
				value="<?php echo esc_attr( $key ); ?>" maxlength="64" autocomplete="new-password">
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

function render_form() {
	$key = get_option( OPTION, '' );
	if ( ! is_string( $key ) || ! preg_match( '/^[a-f0-9]{64}$/D', $key ) ) {
		if ( current_user_can( 'manage_options' ) ) {
			return '<p>' . esc_html__( 'Connect your school in Settings → Bright Nexa School OS to enable this form.', 'bright-nexa-school' ) . '</p>';
		}
		return '';
	}
	$post = get_queried_object_id();
	if ( ! $post || ! is_singular() ) {
		return '';
	}
	$status = filter_input( INPUT_GET, 'bright_nexa_enquiry' );
	$result = in_array( $status, array( 'received', 'invalid', 'unavailable' ), true ) ? $status : '';
	$instance = wp_unique_id( 'bright-nexa-admission-' );
	ob_start();
	?>
	<?php if ( 'received' === $result ) : ?>
		<p role="status"><?php esc_html_e( 'Your enquiry was received. The school can contact you using the details you provided.', 'bright-nexa-school' ); ?></p>
	<?php elseif ( 'invalid' === $result ) : ?>
		<p role="alert"><?php esc_html_e( 'Please check your name, email and optional phone number and try again.', 'bright-nexa-school' ); ?></p>
	<?php elseif ( 'unavailable' === $result ) : ?>
		<p role="alert"><?php esc_html_e( 'Your enquiry could not be confirmed. Please retry or contact the school directly.', 'bright-nexa-school' ); ?></p>
	<?php endif; ?>
	<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" aria-labelledby="<?php echo esc_attr( $instance ); ?>">
		<p><strong id="<?php echo esc_attr( $instance ); ?>"><?php esc_html_e( 'Admission enquiry', 'bright-nexa-school' ); ?></strong></p>
		<input type="hidden" name="action" value="<?php echo esc_attr( ACTION ); ?>">
		<input type="hidden" name="school_page" value="<?php echo esc_attr( $post ); ?>">
		<?php wp_nonce_field( ACTION . '_' . $post ); ?>
		<p><label><?php esc_html_e( 'Parent or guardian name', 'bright-nexa-school' ); ?><br><input name="parent_name" autocomplete="name" required minlength="2" maxlength="120"></label></p>
		<p><label><?php esc_html_e( 'Email', 'bright-nexa-school' ); ?><br><input type="email" name="parent_email" autocomplete="email" required maxlength="254"></label></p>
		<p><label><?php esc_html_e( 'Phone with country code (optional)', 'bright-nexa-school' ); ?><br><input type="tel" name="parent_phone" autocomplete="tel" maxlength="30"></label></p>
		<p><label><?php esc_html_e( 'Year or grade of interest (optional)', 'bright-nexa-school' ); ?><br><input name="year_group" maxlength="60"></label></p>
		<p hidden><label><?php esc_html_e( 'Leave this field empty', 'bright-nexa-school' ); ?><input name="website_confirm" autocomplete="off" tabindex="-1"></label></p>
		<p><label><input type="checkbox" name="consent" value="1" required> <?php esc_html_e( 'I agree that the school may receive these details through Bright Nexa School OS and contact me about admissions.', 'bright-nexa-school' ); ?></label></p>
		<button type="submit"><?php esc_html_e( 'Send enquiry', 'bright-nexa-school' ); ?></button>
	</form>
	<?php
	return ob_get_clean();
}

function input( $field ) {
	// WordPress forms are processed from $_POST; wp_unslash restores submitted input.
	if ( ! isset( $_POST[ $field ] ) || ! is_string( $_POST[ $field ] ) ) {
		return '';
	}
	return wp_unslash( $_POST[ $field ] );
}

function forward_enquiry( $key, $name, $email, $phone, $year ) {
	$response = wp_safe_remote_post( INTAKE, array(
		'timeout'     => 10,
		'redirection' => 0,
		'headers'     => array( 'apikey' => PUBLISHABLE_KEY, 'Content-Type' => 'application/json' ),
		'body'        => wp_json_encode( array(
			'p_key' => $key, 'p_name' => $name, 'p_email' => $email, 'p_phone' => $phone, 'p_year_group' => $year,
		) ),
	) );
	if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
		return false;
	}
	$ref = json_decode( wp_remote_retrieve_body( $response ), true );
	return is_string( $ref ) && wp_is_uuid( $ref );
}

function submit() {
	$page = absint( input( 'school_page' ) );
	$published = $page > 0 && 'publish' === get_post_status( $page );
	$back = $published ? get_permalink( $page ) : home_url( '/' );
	$result = 'invalid';

	$method = isset( $_SERVER['REQUEST_METHOD'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) : '';
	if ( $published && 'POST' === $method
		&& wp_verify_nonce( sanitize_text_field( input( '_wpnonce' ) ), ACTION . '_' . $page )
		&& '' === input( 'website_confirm' ) && '1' === input( 'consent' ) ) {
		$key   = get_option( OPTION, '' );
		$name  = sanitize_text_field( input( 'parent_name' ) );
		$email = sanitize_email( trim( input( 'parent_email' ) ) );
		$phone = sanitize_text_field( trim( input( 'parent_phone' ) ) );
		$year  = sanitize_text_field( input( 'year_group' ) );
		if ( strlen( trim( $name ) ) >= 2 && strlen( $name ) <= 480 && strlen( $email ) <= 254 && is_email( $email )
			&& strlen( $year ) <= 240 && ( '' === $phone || preg_match( '/^\+?[0-9][0-9 ()-]{4,28}$/D', $phone ) ) ) {
			$result = is_string( $key ) && preg_match( '/^[a-f0-9]{64}$/D', $key )
				&& forward_enquiry( $key, $name, $email, $phone, $year ) ? 'received' : 'unavailable';
		}
	}
	nocache_headers();
	wp_safe_redirect( add_query_arg( 'bright_nexa_enquiry', $result, $back ), 303 );
	exit;
}
