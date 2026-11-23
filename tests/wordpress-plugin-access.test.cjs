'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const plugin = path.join(__dirname, '..', 'wordpress', 'bright-nexa-school', 'bright-nexa-school.php');
const readme = fs.readFileSync(path.join(__dirname, '..', 'wordpress', 'bright-nexa-school', 'readme.txt'), 'utf8');
const source = fs.readFileSync(plugin, 'utf8');

test('WordPress bridge preserves admission integration and offers full hosted School OS entry points', () => {
  assert.match(source, /Version: 0\.2\.0/);
  assert.match(readme, /Stable tag: 0\.2\.0/);
  assert.match(source, /add_shortcode\( 'bright_nexa_admissions'/);
  assert.match(source, /add_shortcode\( 'bright_nexa_school_portal'/);
  assert.match(source, /function render_workspace\(\)/);
  assert.match(source, /function render_portal\(\)/);
  for (const route of [
    '/teacher-access.html',
    '/teacher-access.html?view=wordpress',
    '/leadership.html',
    '/parent-app-download.html',
    '/school-beta.html'
  ]) assert.ok(source.includes(route), 'Missing verified hosted route: ' + route);
  assert.match(readme, /full ERP runs on Bright Nexa School OS/);
  assert.match(source, /current_user_can\( 'manage_options' \)/);
  assert.match(source, /rel="noopener noreferrer"/);
});

test('admission forms keep the school key server-side and require consent and a published page', () => {
  assert.match(source, /wp_safe_remote_post\( INTAKE/);
  assert.match(source, /wp_verify_nonce/);
  assert.match(source, /'1' === input\( 'consent' \)/);
  assert.match(source, /\$published && 'POST' === \$method/);
  assert.match(source, /wp_unslash\( \$_POST\[ \$field \] \)/);
  assert.match(source, /sanitize_email\( trim\( input\( 'parent_email' \) \) \)/);
  assert.match(source, /\$key\s*= get_option\( OPTION, '' \)/);
  assert.doesNotMatch(source, /<input[^>]+name="school_connection_key"/);
});

test('PHP lints and WordPress stubs render portal and enquiry form without private school records', (t) => {
  const version = spawnSync('php', ['-v'], { encoding: 'utf8' });
  if (version.error && version.error.code === 'ENOENT') {
    t.skip('PHP CLI not installed on this runner');
    return;
  }
  const lint = spawnSync('php', ['-l', plugin], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stderr || lint.stdout);

  // No live WordPress site or school records: emulate only the used WordPress APIs.
  const mock = `
    define('ABSPATH', '/');
    function add_action(...$args) {}
    function add_shortcode(...$args) {}
    function __($v, $domain = '') { return $v; }
    function esc_html($v) { return htmlspecialchars($v, ENT_QUOTES, 'UTF-8'); }
    function esc_url($v) { return htmlspecialchars($v, ENT_QUOTES, 'UTF-8'); }
    function esc_attr($v) { return htmlspecialchars($v, ENT_QUOTES, 'UTF-8'); }
    function esc_attr_e($v, $domain = '') { echo esc_html($v); }
    function esc_html_e($v, $domain = '') { echo esc_html($v); }
    function current_user_can($cap) { return $cap === 'manage_options'; }
    function get_option($name, $default = '') { return str_repeat('a', 64); }
    function get_queried_object_id() { return 123; }
    function is_singular() { return true; }
    function wp_unique_id($prefix = '') { return $prefix . 'test'; }
    function admin_url($url = '') { return 'https://wp.example/wp-admin/' . $url; }
    function wp_nonce_field($action) { echo '<input type="hidden" name="_wpnonce" value="safe">'; }
    function wp_unslash($value) { return stripslashes($value); }
    require ${JSON.stringify(plugin)};
    $portal = \\BrightNexa\\School\\render_portal();
    $form = \\BrightNexa\\School\\render_form();
    ob_start(); \\BrightNexa\\School\\render_workspace(); $workspace = ob_get_clean();
    $_POST['parent_name'] = "Ravi O\\'Neil";
    $input = \\BrightNexa\\School\\input('parent_name');
    $key = str_repeat('a', 64);
    echo json_encode([
      'portal' => $portal,
      'form' => $form,
      'workspace' => $workspace,
      'unslashed' => $input,
      'leaks_key' => str_contains($portal . $form . $workspace, $key)
    ]);
  `;
  const response = spawnSync('php', ['-r', mock], { encoding: 'utf8' });
  assert.equal(response.status, 0, response.stderr || response.stdout);
  const output = JSON.parse(response.stdout);
  assert.match(output.portal, /School office sign-in/);
  assert.match(output.portal, /Teacher & Parent mobile apps/);
  assert.match(output.form, /Send enquiry/);
  assert.match(output.workspace, /Full School OS/);
  assert.match(output.workspace, /Configure admission enquiries/);
  assert.equal(output.unslashed, "Ravi O'Neil");
  assert.equal(output.leaks_key, false);
});
