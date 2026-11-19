package com.brightnexa.school;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Map;
import java.util.UUID;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

public final class LeadershipLeaveAlerts {
    public static final String HOST = "bright-nexa-school-os.onrender.com";
    public static final String KIND = "emergency-leave";
    private static final String ORIGIN = "https://" + HOST;
    private static final String OPEN = "com.brightnexa.school.OPEN_EMERGENCY_LEAVE";
    private static final String CHANNEL = "leadership-emergency-leave";
    private static final String SEEN = "received:";
    private static final int PERMISSION = 409;
    private final Activity activity;
    private JavaScriptReplyProxy permissionReply;
    private String permissionNonce;

    public LeadershipLeaveAlerts(Activity activity, WebView web) {
        this.activity = activity;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(web, "BrightNexaLeadershipAlerts", Collections.singleton(ORIGIN),
            (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || view.getUrl() == null || !"https".equals(origin.getScheme())
                    || !HOST.equals(origin.getHost())) return;
                Uri page = Uri.parse(view.getUrl());
                if (!"https".equals(page.getScheme()) || !HOST.equals(page.getHost())) return;
                try {
                    JSONObject request = new JSONObject(message.getData());
                    String action = request.getString("action");
                    if ("clear".equals(action)) { clear(activity); return; }
                    if (!"/leadership.html".equals(page.getPath())) return;
                    String school = request.optString("school"), member = request.optString("member");
                    if (!isId(school) || !isId(member)) return;
                    if ("bind".equals(action)) {
                        String binding = request.optString("binding");
                        if (isId(binding)) bind(activity, school, member, binding);
                        return;
                    }
                    String nonce = request.optString("nonce");
                    if (!isId(nonce) || !("enable".equals(action) || "resume".equals(action))) return;
                    SharedPreferences store = prefs(activity);
                    if (!school.equals(store.getString("school", "")) || !member.equals(store.getString("member", ""))) {
                        clear(activity);
                        if ("resume".equals(action)) { respond(reply, nonce, "off", ""); return; }
                    }
                    if (FirebaseApp.getApps(activity).isEmpty()) { respond(reply, nonce, "unconfigured", ""); return; }
                    if (Build.VERSION.SDK_INT >= 33 && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                        if ("enable".equals(action) && permissionReply == null) {
                            permissionReply = reply;
                            permissionNonce = nonce;
                            activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISSION);
                        } else respond(reply, nonce, "denied", "");
                        return;
                    }
                    token(reply, nonce);
                } catch (Exception ignored) { }
            });
    }

    public void permissionResult(int code, int[] results) {
        if (code != PERMISSION || permissionReply == null) return;
        JavaScriptReplyProxy reply = permissionReply;
        String nonce = permissionNonce;
        permissionReply = null;
        permissionNonce = null;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) token(reply, nonce);
        else respond(reply, nonce, "denied", "");
    }

    private void token(JavaScriptReplyProxy reply, String nonce) {
        if (!activity.getSystemService(NotificationManager.class).areNotificationsEnabled()) {
            respond(reply, nonce, "denied", "");
            return;
        }
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(activity, task ->
            respond(reply, nonce, task.isSuccessful() ? "ready" : "error", task.isSuccessful() ? task.getResult() : ""));
    }

    private void respond(JavaScriptReplyProxy reply, String nonce, String status, String token) {
        try {
            JSONObject result = new JSONObject().put("status", status).put("nonce", nonce)
                .put("installation", installation(activity));
            if ("ready".equals(status)) result.put("token", token);
            reply.postMessage(result.toString());
        } catch (Exception ignored) { } // Navigation may close the receiving page.
    }

    private static boolean isId(String value) {
        return value != null && value.matches("[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}");
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(CHANNEL, Context.MODE_PRIVATE);
    }

    private static synchronized String installation(Context context) {
        SharedPreferences store = prefs(context);
        String id = store.getString("installation", "");
        if (!isId(id)) {
            id = UUID.randomUUID().toString();
            store.edit().putString("installation", id).apply();
        }
        return id;
    }

    private static synchronized void bind(Context context, String school, String member, String binding) {
        SharedPreferences store = prefs(context);
        if (!binding.equals(store.getString("binding", ""))) clear(context);
        store.edit().putString("school", school).putString("member", member).putString("binding", binding).apply();
    }

    public static synchronized void clear(Context context) {
        prefs(context).edit().remove("school").remove("member").remove("binding").apply();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (StatusBarNotification shown : manager.getActiveNotifications()) {
            if (CHANNEL.equals(shown.getNotification().getChannelId())) manager.cancel(shown.getTag(), shown.getId());
        }
    }

    public static void rotateToken(Context context, String token) {
        String binding = prefs(context).getString("binding", "");
        if (!isId(binding)) return;
        HttpsURLConnection connection = null;
        try {
            JSONObject body = new JSONObject().put("p_installation", installation(context))
                .put("p_portal", "leadership").put("p_binding", binding).put("p_token", token);
            URL endpoint = new URL("https://mrfvbwmyxndrakskqyas.supabase.co/rest/v1/rpc/bn_rotate_urgent_circular_token");
            connection = (HttpsURLConnection) endpoint.openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("apikey", "sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT");
            connection.setRequestProperty("Content-Type", "application/json");
            try (java.io.OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            connection.getResponseCode();
        } catch (Exception ignored) {
            // The verified WebView registers the latest token when it resumes.
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    public static synchronized String openUrl(Context context, Intent intent, boolean shared) {
        if (intent == null || !OPEN.equals(intent.getAction())) return null;
        SharedPreferences store = prefs(context);
        String leave = intent.getStringExtra("leave"), school = intent.getStringExtra("school");
        String binding = store.getString("binding", "");
        if (!isId(leave) || !isId(school) || binding.isEmpty() || !binding.equals(intent.getStringExtra("binding"))
            || !school.equals(store.getString("school", ""))) return null;
        Uri.Builder link = Uri.parse(ORIGIN + "/leadership.html").buildUpon()
            .appendQueryParameter("school", school).appendQueryParameter("leave", leave);
        if (shared) link.appendQueryParameter("entry", "launcher");
        return link.build().toString();
    }

    public static synchronized void receive(Context context, Map<String, String> data, Class<? extends Activity> target) {
        if (!KIND.equals(data.get("kind"))) return;
        SharedPreferences store = prefs(context);
        String leave = data.get("event"), school = data.get("school"), binding = store.getString("binding", "");
        if (!isId(leave) || !isId(school) || binding.isEmpty() || !binding.equals(data.get("binding"))
            || !school.equals(store.getString("school", ""))) return;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return;
        long expires;
        try { expires = Long.parseLong(data.get("expires")); }
        catch (NumberFormatException ignored) { return; }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        long now = System.currentTimeMillis();
        String eventKey = SEEN + binding + ":" + leave;
        if (expires <= now || !manager.areNotificationsEnabled() || store.getLong(eventKey, 0L) > now) return;

        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Emergency teacher leave", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(context, target).setAction(OPEN).setData(Uri.parse("brightnexa://leave/" + leave))
            .putExtra("leave", leave).putExtra("school", school).putExtra("binding", binding)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification publicAlert = new Notification.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Emergency leave request").setContentText("Open Bright Nexa to review.").build();
        Notification alert = new Notification.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(data.getOrDefault("title", "Emergency leave request")).setContentText(data.get("body"))
            .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicAlert)
            .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true).build();
        manager.notify(leave, 1, alert);
        SharedPreferences.Editor history = store.edit();
        for (Map.Entry<String, ?> entry : store.getAll().entrySet()) {
            if (entry.getKey().startsWith(SEEN) && entry.getValue() instanceof Long
                && (Long) entry.getValue() <= now) history.remove(entry.getKey());
        }
        history.putLong(eventKey, expires).apply();
    }
}
