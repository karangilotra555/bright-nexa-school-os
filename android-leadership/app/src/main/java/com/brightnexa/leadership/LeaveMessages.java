package com.brightnexa.leadership;

import com.brightnexa.school.LeadershipLeaveAlerts;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class LeaveMessages extends FirebaseMessagingService {
    @Override public void onNewToken(String token) { LeadershipLeaveAlerts.rotateToken(this, token); }
    @Override public void onMessageReceived(RemoteMessage message) {
        LeadershipLeaveAlerts.receive(this, message.getData(), MainActivity.class);
    }
}
