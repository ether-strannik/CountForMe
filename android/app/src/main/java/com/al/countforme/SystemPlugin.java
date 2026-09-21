package com.al.countforme;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The bridge behind src/system.js: what Android is currently letting
 * this app do, and the screen that changes it.
 *
 *   status()         -> { notifications, battery }
 *   notifications()  the app's own notification settings
 *   battery()        the exemption dialog, or the list to undo it
 *   "changed"        pushed whenever the app comes back to the front
 *
 * Both are read, never assumed: a permission granted once can be taken
 * away later from settings. The change event matters because the screens
 * these methods open sit ON TOP of the app rather than replacing it, so
 * the page is never hidden and never learns on its own that it is back.
 */
@CapacitorPlugin(name = "System")
public class SystemPlugin extends Plugin {

  private JSObject state() {
    JSObject r = new JSObject();
    r.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
    r.put("battery", exempt());
    return r;
  }

  @PluginMethod
  public void status(PluginCall call) {
    call.resolve(state());
  }

  /** back from a settings screen, and something may have changed */
  @Override
  protected void handleOnResume() {
    notifyListeners("changed", state());
  }

  /** is the app out of Android's battery optimisation? */
  private boolean exempt() {
    PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
    return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
  }

  @PluginMethod
  public void notifications(PluginCall call) {
    Intent i;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
      i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
    } else {
      i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
      i.setData(Uri.parse("package:" + getContext().getPackageName()));
    }
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(i);
    call.resolve();
  }

  @PluginMethod
  public void battery(PluginCall call) {
    Intent i;
    if (exempt()) {
      // already exempt: the list is the only place it can be given back
      i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    } else {
      // the system dialog grants it in one tap, with no list to hunt through
      i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
      i.setData(Uri.parse("package:" + getContext().getPackageName()));
    }
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(i);
    call.resolve();
  }
}
