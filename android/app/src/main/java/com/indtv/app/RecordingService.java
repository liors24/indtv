package com.indtv.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps the app process alive (foreground service + wake lock) while INDTV records a programme, captures
 * catch-up channels, or keeps playing after the TV screen was switched off.
 * The recording itself still runs in the web page (js/player/dvr.js); this service only stops Android
 * from freezing or killing it.
 */
public class RecordingService extends Service {
    static final String ACTION_STOP = "com.indtv.app.STOP_REC";
    private static final String CHANNEL = "indtv_rec";
    private static final int NOTIF_ID = 4711;

    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            release();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        String title = intent != null ? intent.getStringExtra("title") : null;
        boolean playing = intent != null && intent.getBooleanExtra("playing", false);
        boolean rec = title != null && !title.isEmpty();
        Notification n = build(rec ? "INDTV \u25CF REC" : "INDTV \u25B6", rec ? title : (playing ? "Playing in the background" : "INDTV"));
        if (Build.VERSION.SDK_INT >= 29) {
            int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
            if (playing) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            try {
                startForeground(NOTIF_ID, n, type);
            } catch (Exception e) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            }
        } else {
            startForeground(NOTIF_ID, n);
        }
        acquire();
        return START_NOT_STICKY;
    }

    private Notification build(String head, String title) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Recording", NotificationManager.IMPORTANCE_LOW));
            }
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        int pf = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        return b.setContentTitle(head)
                .setContentText(title)
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .setContentIntent(PendingIntent.getActivity(this, 0, open, pf))
                .build();
    }

    private void acquire() {
        try {
            if (wake == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "indtv:rec");
                    wake.setReferenceCounted(false);
                }
            }
            if (wake != null && !wake.isHeld()) wake.acquire(12L * 60 * 60 * 1000);   // safety cap; released when INDTV stops needing it
            if (wifi == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    wifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "indtv:rec");
                    wifi.setReferenceCounted(false);
                }
            }
            if (wifi != null && !wifi.isHeld()) wifi.acquire();
        } catch (Exception ignored) {
            // a missing permission or service must never crash the app
        }
    }

    private void release() {
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) { }
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) { }
    }

    @Override
    public void onDestroy() {
        release();
        super.onDestroy();
    }
}
