package com.al.countforme;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * A running session, as Android sees it: one ongoing notification with a
 * countdown, and a foreground service so the process is neither frozen
 * nor killed while the user is in another app. Paused, it says so and
 * shows no clock; the exact time left is in the app, where you look.
 *
 * It makes no sound. The notification is posted on a low-importance
 * channel, so it appears in the shade without a chime of its own, and
 * the countdown is a chronometer the system ticks — nothing here redraws
 * it. What the session IS stays in the page; this only keeps it alive
 * and says so on screen.
 */
public class SessionService extends Service {
  static final String CHANNEL = "session";
  static final String ACTION_START = "com.al.countforme.SESSION_START";
  static final String ACTION_PAUSE = "com.al.countforme.SESSION_PAUSE";
  static final String ACTION_RESUME = "com.al.countforme.SESSION_RESUME";
  static final String ACTION_STOP = "com.al.countforme.SESSION_STOP";
  static final String EXTRA_MS = "ms";
  static final String EXTRA_TITLE = "title";
  private static final int ID = 1;

  /** kept from START, so pause and resume need not send it again */
  private String title = "Timer";

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent == null ? ACTION_STOP : intent.getAction();
    if (ACTION_STOP.equals(action)) {
      stopForeground(true);
      stopSelf();
      return START_NOT_STICKY;
    }
    channel();
    if (ACTION_START.equals(action)) {
      String t = intent.getStringExtra(EXTRA_TITLE);
      if (t != null) title = t;
    }
    if (ACTION_PAUSE.equals(action)) {
      // no clock at all: a paused session is not counting towards anything
      startForeground(ID, build(0, true));
    } else {
      int ms = intent.getIntExtra(EXTRA_MS, 0);
      startForeground(ID, build(ms > 0 ? System.currentTimeMillis() + ms : 0, false));
    }
    return START_NOT_STICKY;
  }

  /** silent and low importance: it appears, it does not announce itself */
  private void channel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
    NotificationChannel c = new NotificationChannel(CHANNEL, "Running session", NotificationManager.IMPORTANCE_LOW);
    c.setDescription("Shown while a session is running");
    c.setSound(null, null);
    c.enableVibration(false);
    c.setShowBadge(false);
    nm.createNotificationChannel(c);
  }

  private Notification build(long endsAt, boolean paused) {
    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent tap = PendingIntent.getActivity(
        this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

    Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        ? new Notification.Builder(this, CHANNEL)
        : new Notification.Builder(this);
    b.setSmallIcon(R.drawable.ic_session)
        .setContentTitle(title)
        .setContentIntent(tap)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(!paused && endsAt > 0);
    if (paused) {
      b.setContentText("Paused");
    } else if (endsAt > 0) {
      // the system ticks this down on its own; the service never redraws
      b.setWhen(endsAt).setUsesChronometer(true).setChronometerCountDown(true);
    }
    return b.build();
  }
}
