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
import java.util.Map;
import org.json.JSONObject;

final class UrgentCircularMessages {
    static final String OPEN = "com.brightnexa.school.OPEN_URGENT_CIRCULAR";
    private static final String CHANNEL = "urgent-school-circulars";
    private static final String TAG = "urgent-circular:";
    private static final String SEEN = "received:";

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("urgent-school-circulars", Context.MODE_PRIVATE);
    }

    static boolean validPortal(String portal) {
        return "parent".equals(portal) || "teacher".equals(portal);
    }

    static boolean isId(String value) {
        return value != null && value.matches("[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}");
    }

    private static String binding(Context context, String portal) {
        return validPortal(portal) ? prefs(context).getString(portal + ":binding", "") : "";
    }

    static boolean enrolled(Context context, String portal, String school, String member) {
        SharedPreferences store = prefs(context);
        return !binding(context, portal).isEmpty() && school.equals(store.getString(portal + ":school", ""))
            && member.equals(store.getString(portal + ":member", ""));
    }

    static synchronized void enroll(Context context, String portal, String school, String member, String binding) {
        if (!enrolled(context, portal, school, member)) clear(context, portal);
        prefs(context).edit().putString(portal + ":binding", binding).putString(portal + ":school", school)
            .putString(portal + ":member", member).apply();
    }

    static synchronized void clear(Context context, String portal) {
        prefs(context).edit().remove(portal + ":binding").remove(portal + ":school").remove(portal + ":member").apply();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (StatusBarNotification shown : manager.getActiveNotifications()) {
            String tag = shown.getTag();
            if (tag != null && tag.startsWith(TAG + portal + ":")) manager.cancel(tag, shown.getId());
        }
    }

    static void onNewToken(Context context, String token) {
        for (String portal : new String[]{"parent", "teacher"}) {
            String binding = binding(context, portal);
            if (binding.isEmpty()) continue;
            try {
                JSONObject body = new JSONObject().put("p_installation", TeacherPeriodMessages.installation(context))
                    .put("p_portal", portal).put("p_binding", binding).put("p_token", token);
                TeacherPeriodMessages.rotateToken("bn_rotate_urgent_circular_token", body);
            } catch (Exception ignored) { }
        }
    }

    static String openPortal(Context context, Intent intent) {
        if (!OPEN.equals(intent.getAction())) return "";
        String portal = intent.getStringExtra("portal");
        String expected = binding(context, portal);
        return !expected.isEmpty() && expected.equals(intent.getStringExtra("binding")) ? portal : "";
    }

    static synchronized void receive(Context context, Map<String, String> data) {
        String portal = data.get("portal");
        String event = data.get("event");
        String expected = binding(context, portal);
        if (expected.isEmpty() || !expected.equals(data.get("binding")) || !isId(event)) return;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return;
        long expiry;
        try { expiry = Long.parseLong(data.get("expires")); }
        catch (NumberFormatException ignored) { return; }
        long now = System.currentTimeMillis();
        if (expiry <= now) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (!manager.areNotificationsEnabled()) return;
        SharedPreferences store = prefs(context);
        if (store.getLong(SEEN + event, 0L) > now) return;
        SharedPreferences.Editor history = store.edit();
        for (Map.Entry<String, ?> item : store.getAll().entrySet()) {
            if (item.getKey().startsWith(SEEN) && item.getValue() instanceof Long
                && (Long)item.getValue() <= now) history.remove(item.getKey());
        }

        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Urgent school circulars", NotificationManager.IMPORTANCE_HIGH));
        Intent open = new Intent(context, MainActivity.class).setAction(OPEN).putExtra("portal", portal).putExtra("binding", expected)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, event.hashCode(), open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification alert = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info).setCategory(Notification.CATEGORY_EVENT)
            .setContentTitle("Urgent school circular").setContentText("Open Bright Nexa to read the school update.")
            .setVisibility(Notification.VISIBILITY_PUBLIC).setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true).build();
        manager.notify(TAG + portal + ":" + event, 1, alert);
        history.putLong(SEEN + event, expiry).apply();
    }

    private UrgentCircularMessages() { }
}
