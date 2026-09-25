package com.al.countforme;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The bridge behind src/session.js: start and stop {@link SessionService}.
 *
 *   start({ ms, title })   ms = the whole run, lead-in included
 *   pause()
 *   resume({ ms })         ms = what is left of the run
 *   music({ title, paused })   a song instead of a clock
 *   stop()
 *   "control"              pushed when the lock screen or a headset
 *                          asks for play, pause, next or previous
 *
 * The notification permission is asked for at the first START, which is
 * the moment it means something. Refusing it is not fatal: the service
 * still runs and holds the process, the notification is just not shown.
 */
@CapacitorPlugin(
    name = "Session",
    permissions = { @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }) })
public class SessionPlugin extends Plugin {

  /**
   * The plugin, for the service to reach.
   *
   * The lock screen's buttons arrive at the media session, which lives
   * in the service, and what they mean is the page's to decide. Both are
   * in one process, so this is a field rather than a broadcast.
   */
  private static SessionPlugin live;

  @Override
  public void load() {
    live = this;
  }

  /** a button pressed outside the app: play, pause, next or previous */
  static void control(String what) {
    if (live == null) return;
    JSObject o = new JSObject();
    o.put("action", what);
    live.notifyListeners("control", o);
  }

  @PluginMethod
  public void start(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
      requestPermissionForAlias("notifications", call, "asked");
      return;
    }
    begin(call);
  }

  @PermissionCallback
  private void asked(PluginCall call) {
    begin(call);
  }

  private void begin(PluginCall call) {
    Intent i = new Intent(getContext(), SessionService.class);
    i.setAction(SessionService.ACTION_START);
    i.putExtra(SessionService.EXTRA_MS, call.getInt("ms", 0));
    i.putExtra(SessionService.EXTRA_TITLE, call.getString("title", "Timer"));
    send(i, call);
  }

  /** a song is what the service is holding for, and what it shows */
  @PluginMethod
  public void music(PluginCall call) {
    Intent i = new Intent(getContext(), SessionService.class);
    i.setAction(SessionService.ACTION_MUSIC);
    i.putExtra(SessionService.EXTRA_TITLE, call.getString("title", "Music"));
    i.putExtra(SessionService.EXTRA_PAUSED, Boolean.TRUE.equals(call.getBoolean("paused", false)));
    send(i, call);
  }

  @PluginMethod
  public void pause(PluginCall call) {
    Intent i = new Intent(getContext(), SessionService.class);
    i.setAction(SessionService.ACTION_PAUSE);
    send(i, call);
  }

  @PluginMethod
  public void resume(PluginCall call) {
    Intent i = new Intent(getContext(), SessionService.class);
    i.setAction(SessionService.ACTION_RESUME);
    i.putExtra(SessionService.EXTRA_MS, call.getInt("ms", 0));
    send(i, call);
  }

  @PluginMethod
  public void stop(PluginCall call) {
    getContext().stopService(new Intent(getContext(), SessionService.class));
    call.resolve();
  }

  private void send(Intent i, PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(i);
    else getContext().startService(i);
    call.resolve();
  }
}
