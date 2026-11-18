package com.brightnexa.parents;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.PopupMenu;
import android.widget.Toast;
import java.net.URI;
import java.util.Collections;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String STORAGE = "bn_parents_settings";
    private static final String KEY_URL = "school_url";
    private static final int FILE_REQUEST = 407;
    private static final int ALERT_PERMISSION = 408;
    private static final String ALERT_BRIDGE = "BrightNexaPeriodAlerts";
    private static final String URGENT_BRIDGE = "BrightNexaUrgentCirculars";
    private static final String SCHOOL_APP_HOST = "bright-nexa-school-os.onrender.com";
    private JavaScriptReplyProxy permissionReply;
    private String permissionNonce;
    private boolean alertBridgeAdded;
    private boolean urgentBridgeAdded;
    private ValueCallback<Uri[]> fileCallback;
    private WebView web;
    private LinearLayout toolbar;
    private String liveHost = "";
    private String configuredUrl = "";

    private int dp(float value) { return (int) (getResources().getDisplayMetrics().density * value + .5f); }

    private TextView makeToolbarChip(String label) {
        TextView v = new TextView(this);
        v.setText(label);
        v.setTextSize(12);
        v.setTypeface(null,Typeface.BOLD);
        v.setTextColor(Color.WHITE);
        v.setGravity(Gravity.CENTER);
        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(Color.rgb(14,62,107));
        bg.setCornerRadius(dp(11));
        bg.setStroke(dp(1),Color.rgb(43,125,190));
        v.setBackground(bg);
        v.setContentDescription(label.equals("Home") ? "Open school app" : "School app settings");
        return v;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(6,26,54));
        getWindow().setNavigationBarColor(Color.rgb(255,255,255));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        SharedPreferences preferences = getSharedPreferences(STORAGE, MODE_PRIVATE);
        configuredUrl = preferences.getString(KEY_URL, "https://bright-nexa-school-os.onrender.com");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(14), dp(7), dp(13), dp(7));
        toolbar.setBackgroundColor(Color.rgb(6,26,54));
        TextView heading = new TextView(this);
        heading.setText("Bright Nexa");
        heading.setContentDescription("Bright Nexa Parents");
        heading.setTextColor(Color.WHITE);
        heading.setTextSize(18);
        heading.setSingleLine(true);
        heading.setEllipsize(android.text.TextUtils.TruncateAt.END);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.setTypeface(null, Typeface.BOLD);
        toolbar.addView(heading, new LinearLayout.LayoutParams(0, dp(40), 1));

        // Compact branded actions instead of oversized Android default buttons.
        TextView preview = makeToolbarChip("Home");
        LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(dp(61),dp(36));
        previewParams.leftMargin=dp(6);
        toolbar.addView(preview,previewParams);
        TextView settings = makeToolbarChip("⋮");
        settings.setTextSize(20);
        LinearLayout.LayoutParams settingsParams = new LinearLayout.LayoutParams(dp(44),dp(44));
        settingsParams.leftMargin=dp(7);
        toolbar.addView(settings,settingsParams);
        root.addView(toolbar);

        web = new WebView(this);
        WebSettings opts = web.getSettings();
        opts.setJavaScriptEnabled(true);
        opts.setDomStorageEnabled(true);
        opts.setAllowFileAccess(false);
        opts.setAllowContentAccess(true);
        opts.setCacheMode(WebSettings.LOAD_NO_CACHE);
        opts.setJavaScriptCanOpenWindowsAutomatically(false);
        opts.setSupportMultipleWindows(false);
        opts.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        opts.setGeolocationEnabled(false);
        opts.setSafeBrowsingEnabled(true);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onReceivedTitle(WebView view, String title) {
                updateToolbar(view.getUrl(), title);
            }

            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                URI current = parse(view.getUrl());
                if (current == null || !"https".equalsIgnoreCase(current.getScheme()) || !liveHost.equalsIgnoreCase(current.getHost())) return false;
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "image/jpeg", "image/png", "image/webp"});
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent, FILE_REQUEST); }
                catch (Exception ex) { fileCallback = null; callback.onReceiveValue(null); Toast.makeText(MainActivity.this, "Unable to open file picker", Toast.LENGTH_LONG).show(); }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                updateToolbar(url, "");
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (url.equals(view.getUrl())) updateToolbar(url, view.getTitle());
            }

            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                URI uri = parse(request.getUrl().toString());
                if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return true;
                String host = uri.getHost();
                return !(liveHost.length()>0 && liveHost.equalsIgnoreCase(host));
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);

        preview.setOnClickListener(v -> openSchool(configuredUrl));
        settings.setOnClickListener(v -> {
            PopupMenu menu = new PopupMenu(this, v);
            menu.getMenu().add("Connect to school").setOnMenuItemClickListener(item -> {
                configureSchool();
                return true;
            });
            menu.show();
        });
        // Open the configured school; all records still require role-specific authentication.
        openSchool(configuredUrl);
    }

    private URI parse(String input) {
        try { return new URI(input); } catch (Exception ex) { return null; }
    }
    private void updateToolbar(String url, String title) {
        URI page = parse(url);
        boolean teacherWorkspace = page != null && "https".equalsIgnoreCase(page.getScheme())
            && liveHost.equalsIgnoreCase(page.getHost()) && "/teacher-access.html".equals(page.getPath())
            && "Bright Nexa | Teacher Workspace".equals(title);
        toolbar.setVisibility(teacherWorkspace ? View.GONE : View.VISIBLE);
    }
    private void openSchool(String hostUrl) {
        String url = hostUrl.trim();
        URI parsed = parse(url);
        if (parsed == null || !"https".equalsIgnoreCase(parsed.getScheme())
            || parsed.getHost() == null || parsed.getHost().isEmpty()
            || parsed.getUserInfo() != null || parsed.getPort() != -1
            || parsed.getQuery() != null || parsed.getFragment() != null) {
            Toast.makeText(this, "Enter a valid HTTPS school server URL", Toast.LENGTH_LONG).show();
            return;
        }
        // Do not load arbitrary subpaths or parameters.
        if (!liveHost.isEmpty() && !liveHost.equalsIgnoreCase(parsed.getHost())) {
            TeacherPeriodMessages.clear(this);
            UrgentCircularMessages.clear(this, "parent");
            UrgentCircularMessages.clear(this, "teacher");
        }
        liveHost = parsed.getHost();
        installAlertBridge();
        installUrgentCircularBridge();
        String base = "https://" + liveHost + (parsed.getPath()==null?"":parsed.getPath());
        String path = base.endsWith("/") ? base : base + "/";
        if (base.endsWith("/parents.html")) path = base;
        else path += "parents.html";
        configuredUrl = "https://" + liveHost;
        getSharedPreferences(STORAGE, MODE_PRIVATE).edit().putString(KEY_URL, configuredUrl).apply();
        updateToolbar(path, "");
        web.clearCache(true);
        String urgent = urgentCircularUrl(getIntent());
        web.loadUrl(urgent != null ? urgent : TeacherPeriodMessages.OPEN_TIMETABLE.equals(getIntent().getAction()) ? teacherTimetableUrl() : path);
        getIntent().setAction(null);
    }
    private String teacherTimetableUrl() {
        return "https://" + liveHost + "/teacher-access.html?view=timetable";
    }

    private String urgentCircularUrl(Intent intent) {
        if (!SCHOOL_APP_HOST.equalsIgnoreCase(liveHost)) return null;
        String portal = UrgentCircularMessages.openPortal(this, intent);
        if ("parent".equals(portal)) return "https://" + liveHost + "/parents.html?portal=parent&view=messages";
        if ("teacher".equals(portal)) return "https://" + liveHost + "/teacher-access.html?view=notices";
        return null;
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String urgent = urgentCircularUrl(intent);
        if (urgent != null) {
            web.loadUrl(urgent);
            return;
        }
        if (TeacherPeriodMessages.OPEN_TIMETABLE.equals(intent.getAction()) && !liveHost.isEmpty()) {
            URI page = parse(web.getUrl());
            if (page != null && "/teacher-access.html".equals(page.getPath()) && liveHost.equalsIgnoreCase(page.getHost())) {
                web.evaluateJavascript("window.dispatchEvent(new Event('bright-nexa-open-timetable'))", null);
            } else {
                web.loadUrl(teacherTimetableUrl());
            }
        }
    }

    private void installAlertBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        if (alertBridgeAdded) WebViewCompat.removeWebMessageListener(web, ALERT_BRIDGE);
        WebViewCompat.addWebMessageListener(web, ALERT_BRIDGE, Collections.singleton("https://" + liveHost),
            (view, message, origin, isMainFrame, reply) -> {
                URI page = parse(view.getUrl());
                if (!isMainFrame || page == null || !"/teacher-access.html".equals(page.getPath())
                    || !"https".equals(origin.getScheme()) || !liveHost.equalsIgnoreCase(origin.getHost())
                    || !liveHost.equalsIgnoreCase(page.getHost())) return;
                String nonce = "";
                try {
                    JSONObject request = new JSONObject(message.getData());
                    nonce = request.optString("nonce");
                    String school = request.optString("school");
                    String member = request.optString("member");
                    String action = request.getString("action");
                    if ("clear".equals(action)) {
                        TeacherPeriodMessages.clear(this);
                        return;
                    }
                    if (!school.matches("[0-9a-f-]{36}") || !member.matches("[0-9a-f-]{36}")) return;
                    if ("bind".equals(action)) {
                        String binding = request.getString("binding");
                        if (binding.matches("[0-9a-f-]{36}")) TeacherPeriodMessages.enroll(this, school, member, binding);
                        return;
                    }
                    if (!nonce.matches("[0-9a-f-]{36}")) return;
                    if ("resume".equals(action) && !TeacherPeriodMessages.enrolled(this, school, member)) {
                        TeacherPeriodMessages.clear(this);
                        replyAlert(reply, nonce, "off", "");
                        return;
                    }
                    if (!"enable".equals(action) && !"resume".equals(action)) return;
                    if (FirebaseApp.getApps(this).isEmpty()) {
                        replyAlert(reply, nonce, "unconfigured", "");
                        return;
                    }
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        if ("enable".equals(action) && permissionReply == null) {
                            permissionReply = reply;
                            permissionNonce = nonce;
                            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, ALERT_PERMISSION);
                        } else replyAlert(reply, nonce, "denied", "");
                        return;
                    }
                    sendAlertToken(reply, nonce);
                } catch (Exception ignored) {
                    replyAlert(reply, nonce, "error", "");
                }
            });
        alertBridgeAdded = true;
    }

    private void installUrgentCircularBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        if (urgentBridgeAdded) WebViewCompat.removeWebMessageListener(web, URGENT_BRIDGE);
        urgentBridgeAdded = false;
        if (!SCHOOL_APP_HOST.equalsIgnoreCase(liveHost)) return;
        WebViewCompat.addWebMessageListener(web, URGENT_BRIDGE, Collections.singleton("https://" + SCHOOL_APP_HOST),
            (view, message, origin, isMainFrame, reply) -> {
                URI page = parse(view.getUrl());
                if (!isMainFrame || page == null || !"https".equals(page.getScheme()) || !"https".equals(origin.getScheme())
                    || !SCHOOL_APP_HOST.equalsIgnoreCase(origin.getHost()) || !SCHOOL_APP_HOST.equalsIgnoreCase(page.getHost())) return;
                String portal;
                if ("/parents.html".equals(page.getPath())) portal = "parent";
                else if ("/teacher-access.html".equals(page.getPath())) portal = "teacher";
                else return;
                String nonce = "";
                try {
                    JSONObject request = new JSONObject(message.getData());
                    String action = request.getString("action");
                    if ("clear".equals(action)) {
                        UrgentCircularMessages.clear(this, portal);
                        return;
                    }
                    String school = request.optString("school");
                    String member = request.optString("member");
                    if (!UrgentCircularMessages.isId(school) || !UrgentCircularMessages.isId(member)) return;
                    if ("bind".equals(action)) {
                        String binding = request.optString("binding");
                        if (UrgentCircularMessages.isId(binding)) UrgentCircularMessages.enroll(this, portal, school, member, binding);
                        return;
                    }
                    nonce = request.optString("nonce");
                    if (!UrgentCircularMessages.isId(nonce) || !("enable".equals(action) || "resume".equals(action))) return;
                    if ("resume".equals(action) && !UrgentCircularMessages.enrolled(this, portal, school, member)) {
                        UrgentCircularMessages.clear(this, portal);
                        replyAlert(reply, nonce, "off", "");
                        return;
                    }
                    if (FirebaseApp.getApps(this).isEmpty()) {
                        replyAlert(reply, nonce, "unconfigured", "");
                        return;
                    }
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        if ("enable".equals(action) && permissionReply == null) {
                            permissionReply = reply;
                            permissionNonce = nonce;
                            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, ALERT_PERMISSION);
                        } else replyAlert(reply, nonce, "denied", "");
                        return;
                    }
                    sendAlertToken(reply, nonce);
                } catch (Exception ignored) {
                    replyAlert(reply, nonce, "error", "");
                }
            });
        urgentBridgeAdded = true;
    }

    private void sendAlertToken(JavaScriptReplyProxy reply, String nonce) {
        try {
            if (!getSystemService(NotificationManager.class).areNotificationsEnabled()) {
                replyAlert(reply, nonce, "denied", "");
                return;
            }
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(this, task ->
                replyAlert(reply, nonce, task.isSuccessful() ? "ready" : "error", task.isSuccessful() ? task.getResult() : ""));
        } catch (Exception ignored) {
            replyAlert(reply, nonce, "error", "");
        }
    }

    private void replyAlert(JavaScriptReplyProxy reply, String nonce, String status, String token) {
        try {
            JSONObject result = new JSONObject().put("status", status).put("nonce", nonce)
                .put("installation", TeacherPeriodMessages.installation(this));
            if ("ready".equals(status)) result.put("token", token);
            reply.postMessage(result.toString());
        } catch (Exception ignored) {
            // Navigation can close the originating page during permission/token setup.
        }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == ALERT_PERMISSION && permissionReply != null) {
            JavaScriptReplyProxy reply = permissionReply;
            String nonce = permissionNonce;
            permissionReply = null;
            permissionNonce = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) sendAlertToken(reply, nonce);
            else replyAlert(reply, nonce, "denied", "");
        }
    }

    private void configureSchool() {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setText(configuredUrl);
        input.setHint("https://your-school.example");
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        LinearLayout holder = new LinearLayout(this);
        holder.setPadding(dp(20),dp(12),dp(20),0);
        holder.addView(input, new LinearLayout.LayoutParams(-1,-2));
        new AlertDialog.Builder(this)
          .setTitle("Connect to school")
          .setMessage("Enter your school’s Bright Nexa HTTPS address. Teachers and students use separate secure logins in the same app.")
          .setView(holder)
          .setPositiveButton("Connect", (d,w) -> openSchool(input.getText().toString()))
          .setNegativeButton("Cancel",null)
          .show();
    }
    @Override public void onBackPressed() {
        if (web.canGoBack() && liveHost.length()>0) { web.goBack(); return; }

        super.onBackPressed();
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback; fileCallback = null;
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
        }
    }
    @Override protected void onDestroy() { if(fileCallback!=null) { fileCallback.onReceiveValue(null); fileCallback=null; } if(web!=null) { web.destroy(); web=null; } super.onDestroy(); }
}
