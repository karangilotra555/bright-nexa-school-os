package com.brightnexa.parents;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
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
import android.widget.Button;
import android.widget.Toast;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String STORAGE = "bn_parents_settings";
    private static final String KEY_URL = "school_url";
    private static final String PREVIEW_BASE = "https://appassets.androidplatform.net/";
    private WebView web;
    private TextView status;
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
        v.setContentDescription(label.equals("Demo") ? "Open demo preview" : "Connect to school");
        return v;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(6,26,54));
        getWindow().setNavigationBarColor(Color.rgb(255,255,255));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        SharedPreferences preferences = getSharedPreferences(STORAGE, MODE_PRIVATE);
        configuredUrl = preferences.getString(KEY_URL, "");

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout toolbar = new LinearLayout(this);
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
        TextView preview = makeToolbarChip("Demo");
        LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(dp(61),dp(36));
        previewParams.leftMargin=dp(6);
        toolbar.addView(preview,previewParams);
        TextView settings = makeToolbarChip("Connect");
        LinearLayout.LayoutParams settingsParams = new LinearLayout.LayoutParams(dp(84),dp(36));
        settingsParams.leftMargin=dp(7);
        toolbar.addView(settings,settingsParams);
        root.addView(toolbar);

        status = new TextView(this);
        status.setTextSize(12);
        status.setTextColor(Color.rgb(80,91,82));
        status.setPadding(dp(15),dp(6),dp(15),dp(6));
        root.addView(status);

        web = new WebView(this);
        WebSettings opts = web.getSettings();
        opts.setJavaScriptEnabled(true);
        opts.setDomStorageEnabled(true);
        opts.setAllowFileAccess(false);
        opts.setAllowContentAccess(false);
        opts.setJavaScriptCanOpenWindowsAutomatically(false);
        opts.setSupportMultipleWindows(false);
        opts.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        opts.setGeolocationEnabled(false);
        opts.setSafeBrowsingEnabled(true);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                URI uri = parse(request.getUrl().toString());
                if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return true;
                String host = uri.getHost();
                return !(liveHost.length()>0 && liveHost.equalsIgnoreCase(host));
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1,0,1));
        setContentView(root);

        preview.setOnClickListener(v -> openPreview());
        settings.setOnClickListener(v -> configureSchool());
        // Never connect to a server implicitly; the parent must choose the institution.
        openPreview();
    }

    private URI parse(String input) {
        try { return new URI(input); } catch (Exception ex) { return null; }
    }
    private void openPreview() {
        liveHost = "";
        status.setVisibility(View.GONE);
        status.setText("DEMO MODE • Fictional student data • Not synced");
        try (InputStream in = getAssets().open("demo.html")) {
            byte[] bytes = in.readAllBytes();
            web.loadDataWithBaseURL(PREVIEW_BASE, new String(bytes, StandardCharsets.UTF_8), "text/html", "UTF-8", null);
        } catch(Exception ex) {
            Toast.makeText(this, "Unable to open preview", Toast.LENGTH_LONG).show();
        }
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
        liveHost = parsed.getHost();
        String base = "https://" + liveHost + (parsed.getPath()==null?"":parsed.getPath());
        String path = base.endsWith("/") ? base : base + "/";
        if (base.endsWith("/parents.html")) path = base;
        else path += "parents.html";
        configuredUrl = "https://" + liveHost;
        getSharedPreferences(STORAGE, MODE_PRIVATE).edit().putString(KEY_URL, configuredUrl).apply();
        status.setVisibility(View.VISIBLE);
        status.setText("SCHOOL PORTAL • " + liveHost + " • Testing only");
        web.loadUrl(path);
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
          .setMessage("For testing only. Enter the HTTPS address of the deployed Bright Nexa School OS server. Public launch needs verified parent login.")
          .setView(holder)
          .setPositiveButton("Connect", (d,w) -> openSchool(input.getText().toString()))
          .setNegativeButton("Cancel",null)
          .show();
    }
    @Override public void onBackPressed() {
        if (web.canGoBack() && liveHost.length()>0) { web.goBack(); return; }
        if (liveHost.length()>0) { openPreview(); return; }
        super.onBackPressed();
    }
    @Override protected void onDestroy() { if(web!=null) { web.destroy(); web=null; } super.onDestroy(); }
}
