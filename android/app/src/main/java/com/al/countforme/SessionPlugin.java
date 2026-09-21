package com.al.countforme;

import android.content.Intent;
import android.os.Build;

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
 *   stop()
 *
 * The notification permission is asked for at the first START, which is
 * the moment it means something. Refusing it is not fatal: the service
 * still runs and holds the process, the notification is just not shown.
 */
@CapacitorPlugin(
    name = "Session",
    permissions = { @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }) })
public class SessionPlugin extends Plugin {

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
