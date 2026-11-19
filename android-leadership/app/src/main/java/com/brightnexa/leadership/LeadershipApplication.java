package com.brightnexa.leadership;

import android.app.Application;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

public final class LeadershipApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        if (BuildConfig.FCM_APP_ID.isEmpty() || BuildConfig.FCM_API_KEY.isEmpty()
            || BuildConfig.FCM_SENDER_ID.isEmpty() || BuildConfig.FCM_PROJECT_ID.isEmpty()
            || !FirebaseApp.getApps(this).isEmpty()) return;
        FirebaseApp.initializeApp(this, new FirebaseOptions.Builder().setApplicationId(BuildConfig.FCM_APP_ID)
            .setApiKey(BuildConfig.FCM_API_KEY).setGcmSenderId(BuildConfig.FCM_SENDER_ID)
            .setProjectId(BuildConfig.FCM_PROJECT_ID).build());
    }
}
