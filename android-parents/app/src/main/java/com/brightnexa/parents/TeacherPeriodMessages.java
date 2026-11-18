package com.brightnexa.parents;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public final class TeacherPeriodMessages extends FirebaseMessagingService {
    static final String OPEN_TIMETABLE = "com.brightnexa.school.OPEN_TIMETABLE";
    private static final String CHANNEL = "teacher-periods";
    private static final String STORAGE = "teacher-period-alerts";
    private static final String BINDING = "binding";
    private static final String SCHOOL = "school";
    private static final String MEMBER = "member";
    private static final String INSTALLATION = "installation";

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(STORAGE, MODE_PRIVATE);
    }

    static synchronized String installation(Context context) {
        SharedPreferences store = preferences(context);
        String value = store.getString(INSTALLATION, "");
        if (value.isEmpty()) {
            value = java.util.UUID.randomUUID().toString();
            store.edit().putString(INSTALLATION, value).apply();
        }
        return value;
    }

    static boolean enrolled(Context context, String school, String member) {
        SharedPreferences store = preferences(context);
        return school.equals(store.getString(SCHOOL, "")) && member.equals(store.getString(MEMBER, ""))
            && !store.getString(BINDING, "").isEmpty();
    }

    static void enroll(Context context, String school, String member, String binding) {
        preferences(context).edit().putString(BINDING, binding).putString(SCHOOL, school).putString(MEMBER, member).apply();
    }

    static void clear(Context context) {
        preferences(context).edit().remove(BINDING).remove(SCHOOL).remove(MEMBER).apply();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (StatusBarNotification shown : manager.getActiveNotifications()) {
            if (CHANNEL.equals(shown.getNotification().getChannelId())) manager.cancel(shown.getTag(), shown.getId());
        }
    }

    @Override public void onNewToken(String token) {
        UrgentCircularMessages.onNewToken(this, token);
        SharedPreferences store = preferences(this);
        String binding = store.getString(BINDING, "");
        String installation = store.getString(INSTALLATION, "");
        if (binding.isEmpty() || installation.isEmpty()) return;
        try {
            JSONObject body = new JSONObject().put("p_installation", installation).put("p_binding", binding).put("p_token", token);
            rotateToken("bn_rotate_teacher_period_alert_token", body);
        } catch (Exception ignored) { }
    }

    static void rotateToken(String rpc, JSONObject body) {
        HttpsURLConnection connection = null;
        try {
            URL endpoint = new URL("https://mrfvbwmyxndrakskqyas.supabase.co/rest/v1/rpc/" + rpc);
            connection = (HttpsURLConnection)endpoint.openConnection();
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
            // The signed-in WebView also refreshes the token on resume.
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        if ("urgent-circular".equals(data.get("kind"))) {
            UrgentCircularMessages.receive(this, data);
            return;
        }
        String binding = data.get("binding");
        String event = data.get("event");
        String title = data.get("title");
        String body = data.get("body");
        if (binding == null || binding.isEmpty() || event == null || title == null || body == null
            || !binding.equals(preferences(this).getString(BINDING, ""))) return;
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        try {
            String expires = data.get("expires");
            if (expires == null || Long.parseLong(expires) <= System.currentTimeMillis()) return;
        } catch (NumberFormatException ignored) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (!manager.areNotificationsEnabled()) return;
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Teacher timetable", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(this, MainActivity.class).setAction(OPEN_TIMETABLE)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent click = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(click).setAutoCancel(true).setOnlyAlertOnce(true).build();
        manager.notify(binding + ":" + event, 1, notification);
    }
}
