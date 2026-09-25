package com.al.countforme;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.session.PlaybackState;
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
  static final String ACTION_MUSIC = "com.al.countforme.SESSION_MUSIC";
  static final String EXTRA_MS = "ms";
  static final String EXTRA_TITLE = "title";
  static final String EXTRA_PAUSED = "paused";
  static final String EXTRA_AT = "at";
  static final String EXTRA_LEN = "len";
  private static final int ID = 1;

  /** kept from START, so pause and resume need not send it again */
  private String title = "Timer";

  /**
   * The media session, made when music first holds the service.
   *
   * A song wants a different notification from a session: not a clock
   * counting down, but the transport Android already knows how to show.
   * Handing the system a media session is what buys the lock screen,
   * the panel in the shade and the buttons on a headset, all from the
   * one thing rather than three.
   */
  private android.media.session.MediaSession media;

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent == null ? ACTION_STOP : intent.getAction();
    if (ACTION_STOP.equals(action)) {
      release();
      stopForeground(true);
      stopSelf();
      return START_NOT_STICKY;
    }
    channel();
    if (ACTION_MUSIC.equals(action)) {
      String t = intent.getStringExtra(EXTRA_TITLE);
      if (t != null) title = t;
      boolean paused = intent.getBooleanExtra(EXTRA_PAUSED, false);
      startForeground(ID, music(paused, intent.getLongExtra(EXTRA_AT, 0), intent.getLongExtra(EXTRA_LEN, 0)));
      return START_NOT_STICKY;
    }
    // back to a session or the timers: the media session has no business
    // on a notification that is a clock
    release();
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

  // ---- the song: a media session, and the notification Android draws
  // around one ----

  /** the media session, made once and answered from the page */
  private android.media.session.MediaSession session() {
    if (media != null) return media;
    media = new android.media.session.MediaSession(this, "music");
    media.setCallback(new android.media.session.MediaSession.Callback() {
      @Override
      public void onPlay() {
        SessionPlugin.control("play");
      }

      @Override
      public void onPause() {
        SessionPlugin.control("pause");
      }

      @Override
      public void onSkipToNext() {
        SessionPlugin.control("next");
      }

      @Override
      public void onSkipToPrevious() {
        SessionPlugin.control("previous");
      }

      @Override
      public void onSeekTo(long pos) {
        SessionPlugin.control("seek", pos);
      }

      @Override
      public void onStop() {
        SessionPlugin.control("stop");
      }
    });
    media.setActive(true);
    return media;
  }

  /** the session goes when the notification stops being a song's */
  private void release() {
    if (media == null) return;
    media.setActive(false);
    media.release();
    media = null;
  }

  private Notification music(boolean paused, long at, long len) {
    android.media.session.MediaSession s = session();
    // The length is what makes the bar a bar. Without it the panel has
    // no scale to draw and the scrubber does nothing.
    s.setMetadata(new android.media.MediaMetadata.Builder()
        .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, title)
        .putLong(android.media.MediaMetadata.METADATA_KEY_DURATION, len)
        .build());
    long can = PlaybackState.ACTION_PLAY
        | PlaybackState.ACTION_PAUSE
        | PlaybackState.ACTION_SKIP_TO_NEXT
        | PlaybackState.ACTION_SKIP_TO_PREVIOUS
        | PlaybackState.ACTION_SEEK_TO
        | PlaybackState.ACTION_STOP;
    // The speed is how the bar moves between updates: the system carries
    // the position forward from here rather than being told it again, so
    // this is set when the song changes and not while it plays.
    s.setPlaybackState(new PlaybackState.Builder()
        .setActions(can)
        .setState(paused ? PlaybackState.STATE_PAUSED : PlaybackState.STATE_PLAYING, at, paused ? 0f : 1f)
        .build());

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
        .setOngoing(!paused)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        // No buttons of its own. The transport on the lock screen and in
        // the shade's media panel is drawn from the session's playback
        // state, so adding three more here would be the same controls
        // twice, each needing an icon nobody asked for.
        .setStyle(new Notification.MediaStyle().setMediaSession(s.getSessionToken()));
    return b.build();
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
