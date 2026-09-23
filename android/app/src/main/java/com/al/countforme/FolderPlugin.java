package com.al.countforme;

import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * The bridge behind src/files.js: one folder the user picks through the
 * system picker (Storage Access Framework). The grant is persistable and
 * scoped to that tree; no storage permission is declared. Everything goes
 * through DocumentsContract on the framework, so no androidx library is
 * pulled in for it.
 *
 *   status()            -> { granted, name }
 *   pick()              -> { granted, name }
 *   list({ path? })     -> { names, dirs }   files and subfolders of a folder
 *   read({ name })      -> { base64 }        name may be a path: "themes/x/y.mp3"
 *   write({ name, base64 })                  name may be a path; folders are made
 *   remove({ name })                         name may be a path; a folder goes with its contents
 *   share({ name, base64 })  hand the bytes to another app
 *   pickFile({ type? }) -> { name, base64 }  one file from anywhere
 *   pickSong()          -> { name, uri }     one song, kept, streamed not carried
 *   song()              -> { name, uri }     the song kept last time
 *   exportZip({ path, name, asset? }) -> { saved }   a folder, zipped flat, to where the user picks
 *   pickZip()           -> { names, manifest }       a zip the user picks, looked inside
 *   unpackZip({ dest }) -> { ok }                    that zip, into a folder under the tree
 */
@CapacitorPlugin(name = "Folder")
public class FolderPlugin extends Plugin {
  private static final String PREFS = "folder";
  private static final String KEY = "tree";
  private static final String KEY_SONG = "song";
  private static final String KEY_SONG_NAME = "songName";

  private Uri tree() {
    SharedPreferences p = getContext().getSharedPreferences(PREFS, 0);
    String s = p.getString(KEY, null);
    if (s == null) return null;
    Uri u = Uri.parse(s);
    // the grant can be revoked from settings; then it is as if never picked
    for (android.content.UriPermission up : getContext().getContentResolver().getPersistedUriPermissions()) {
      if (up.getUri().equals(u) && up.isReadPermission()) return u;
    }
    return null;
  }

  private JSObject status(Uri u) {
    JSObject r = new JSObject();
    r.put("granted", u != null);
    String name = "";
    if (u != null) {
      String id = DocumentsContract.getTreeDocumentId(u); // "primary:Timer"
      int c = id.lastIndexOf(':');
      int s = id.lastIndexOf('/');
      name = id.substring(Math.max(c, s) + 1);
      if (name.isEmpty()) name = id;
    }
    r.put("name", name);
    return r;
  }

  @PluginMethod
  public void status(PluginCall call) {
    call.resolve(status(tree()));
  }

  @PluginMethod
  public void pick(PluginCall call) {
    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    startActivityForResult(call, i, "picked");
  }

  /**
   * One audio file from anywhere, through the system file picker. The
   * pick is a one-time read on that file; the bytes come back and the
   * page writes them where it wants, into a theme's folder.
   *
   *   pickFile({ type? }) -> { name, base64 }   or { name: "" } when nothing was picked
   *   type is a mime filter for the picker; "audio/*" when left out
   */
  @PluginMethod
  public void pickFile(PluginCall call) {
    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType(call.getString("type", "audio/*"));
    startActivityForResult(call, i, "pickedFile");
  }

  @ActivityCallback
  private void pickedFile(PluginCall call, ActivityResult result) {
    if (call == null) return;
    JSObject r = new JSObject();
    r.put("name", "");
    Intent data = result.getData();
    if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null || data.getData() == null) {
      call.resolve(r);
      return;
    }
    Uri u = data.getData();
    try (InputStream in = getContext().getContentResolver().openInputStream(u)) {
      ByteArrayOutputStream buf = new ByteArrayOutputStream();
      byte[] b = new byte[65536];
      int n;
      while ((n = in.read(b)) > 0) buf.write(b, 0, n);
      r.put("name", displayName(u));
      r.put("base64", Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP));
      call.resolve(r);
    } catch (Exception e) {
      call.reject("cannot read: " + e.getMessage());
    }
  }

  /** what the provider calls a file, falling back to the last path segment */
  private String displayName(Uri u) {
    String name = "";
    String[] cols = { android.provider.OpenableColumns.DISPLAY_NAME };
    try (Cursor c = getContext().getContentResolver().query(u, cols, null, null, null)) {
      if (c != null && c.moveToFirst()) name = c.getString(0);
    } catch (Exception e) {
      // a provider with no columns: the path is all there is
    }
    if (name == null || name.isEmpty()) name = u.getLastPathSegment();
    return name == null ? "" : name;
  }

  /** is this URI still ours to read, after a restart or a revoke */
  private boolean readable(Uri u) {
    for (android.content.UriPermission up : getContext().getContentResolver().getPersistedUriPermissions()) {
      if (up.getUri().equals(u) && up.isReadPermission()) return true;
    }
    return false;
  }

  // ---- the song ----
  // Not read here, and never carried as bytes. The grant is made
  // persistable and the URI is kept, so the page turns it into a URL
  // through Capacitor's own local server and the media decoder streams
  // it: playing starts on the first chunk instead of the last, and a
  // long track costs no memory. `pickFile` above is the other shape,
  // for the short cue sounds that get copied into a theme.

  /** one song, through the system picker, with a grant that outlives the run */
  @PluginMethod
  public void pickSong(PluginCall call) {
    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType("audio/*");
    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    startActivityForResult(call, i, "pickedSong");
  }

  @ActivityCallback
  private void pickedSong(PluginCall call, ActivityResult result) {
    if (call == null) return;
    JSObject r = new JSObject();
    r.put("name", "");
    Intent data = result.getData();
    if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null || data.getData() == null) {
      call.resolve(r);
      return;
    }
    Uri u = data.getData();
    try {
      getContext().getContentResolver().takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION);
    } catch (Exception e) {
      // a provider that will not persist still plays for this run
    }
    String name = displayName(u);
    getContext()
        .getSharedPreferences(PREFS, 0)
        .edit()
        .putString(KEY_SONG, u.toString())
        .putString(KEY_SONG_NAME, name)
        .apply();
    r.put("name", name);
    r.put("uri", u.toString());
    call.resolve(r);
  }

  /** the song kept last time, if the grant survived */
  @PluginMethod
  public void song(PluginCall call) {
    JSObject r = new JSObject();
    r.put("name", "");
    SharedPreferences p = getContext().getSharedPreferences(PREFS, 0);
    String s = p.getString(KEY_SONG, null);
    if (s != null && readable(Uri.parse(s))) {
      r.put("name", p.getString(KEY_SONG_NAME, ""));
      r.put("uri", s);
    }
    call.resolve(r);
  }

  // ---- a theme as a zip: Android's own zip, nothing added ----
  // A theme is a folder of files. Export zips that folder, flat, to a
  // place the user picks; import reads a zip the user picks and unpacks
  // it into a folder under the tree. Nothing goes through the page as
  // bytes: the zip is read and written here.

  /** an entry name that may land in a theme folder: plain, no path */
  private static boolean plainName(String n) {
    return n != null && !n.isEmpty() && !n.contains("/") && !n.contains("\\") && !n.equals(".") && !n.equals("..")
        && n.length() <= 120;
  }

  /** what a zip's entry names have in common at the front: "nord/" when a folder was zipped */
  private static String commonDir(List<String> names) {
    String prefix = null;
    for (String n : names) {
      int cut = n.indexOf('/');
      String head = cut < 0 ? "" : n.substring(0, cut + 1);
      if (prefix == null) prefix = head;
      else if (!prefix.equals(head)) return "";
    }
    return prefix == null ? "" : prefix;
  }

  private static final long MAX_ENTRY = 20L * 1024 * 1024;
  private static final long MAX_TOTAL = 64L * 1024 * 1024;

  private static void pump(InputStream in, OutputStream out, long cap) throws Exception {
    byte[] b = new byte[65536];
    long total = 0;
    int n;
    while ((n = in.read(b)) > 0) {
      total += n;
      if (total > cap) throw new Exception("too large");
      out.write(b, 0, n);
    }
  }

  /**
   * Zip a folder, flat, to a file the user picks through the system's
   * save dialog. `path` is a folder under the tree, or, with `asset`
   * true, a folder inside the app's own files (the shipped theme).
   *
   *   exportZip({ path, name, asset? }) -> { saved }
   */
  @PluginMethod
  public void exportZip(PluginCall call) {
    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType("application/zip");
    i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "theme.zip"));
    startActivityForResult(call, i, "exportTarget");
  }

  @ActivityCallback
  private void exportTarget(PluginCall call, ActivityResult result) {
    if (call == null) return;
    JSObject r = new JSObject();
    r.put("saved", false);
    Intent data = result.getData();
    if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null || data.getData() == null) {
      call.resolve(r);
      return;
    }
    String path = call.getString("path", "");
    boolean asset = Boolean.TRUE.equals(call.getBoolean("asset", false));
    try (java.util.zip.ZipOutputStream z = new java.util.zip.ZipOutputStream(
        getContext().getContentResolver().openOutputStream(data.getData(), "wt"))) {
      if (asset) {
        for (String n : getContext().getAssets().list(path)) {
          try (InputStream in = getContext().getAssets().open(path + "/" + n)) {
            z.putNextEntry(new java.util.zip.ZipEntry(n));
            pump(in, z, MAX_ENTRY);
            z.closeEntry();
          }
        }
      } else {
        Uri t = tree();
        String id = t == null ? null : docId(t, path);
        if (id == null) { call.reject("no such folder"); return; }
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(t, id);
        String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE };
        try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
          while (c != null && c.moveToNext()) {
            if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) continue;
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(t, c.getString(0));
            try (InputStream in = getContext().getContentResolver().openInputStream(doc)) {
              z.putNextEntry(new java.util.zip.ZipEntry(c.getString(1)));
              pump(in, z, MAX_ENTRY);
              z.closeEntry();
            }
          }
        }
      }
      r.put("saved", true);
      call.resolve(r);
    } catch (Exception e) {
      call.reject("cannot zip: " + e.getMessage());
    }
  }

  /** the zip picked for import, held between the look inside and the unpack */
  private Uri pendingZip;

  /**
   * Pick a zip and look inside: the names of its files, and the text
   * of its theme.json. Nothing is written yet; the page checks the
   * theme first and says where it goes.
   *
   *   pickZip() -> { names, manifest }   names: [] when nothing was picked
   */
  @PluginMethod
  public void pickZip(PluginCall call) {
    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType("*/*");
    i.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/zip", "application/octet-stream" });
    startActivityForResult(call, i, "pickedZip");
  }

  @ActivityCallback
  private void pickedZip(PluginCall call, ActivityResult result) {
    if (call == null) return;
    JSObject r = new JSObject();
    JSArray names = new JSArray();
    r.put("names", names);
    r.put("manifest", "");
    Intent data = result.getData();
    if (result.getResultCode() != android.app.Activity.RESULT_OK || data == null || data.getData() == null) {
      call.resolve(r);
      return;
    }
    pendingZip = data.getData();
    List<String> all = new ArrayList<>();
    String manifest = "";
    try (java.util.zip.ZipInputStream z = new java.util.zip.ZipInputStream(
        getContext().getContentResolver().openInputStream(pendingZip))) {
      java.util.zip.ZipEntry e;
      while ((e = z.getNextEntry()) != null) {
        if (e.isDirectory()) continue;
        all.add(e.getName());
        if (e.getName().endsWith("theme.json")) {
          ByteArrayOutputStream buf = new ByteArrayOutputStream();
          pump(z, buf, 1024 * 1024);
          manifest = buf.toString("UTF-8");
        }
        z.closeEntry();
      }
    } catch (Exception ex) {
      pendingZip = null;
      call.reject("cannot read: " + ex.getMessage());
      return;
    }
    String strip = commonDir(all);
    for (String n : all) {
      String leaf = n.startsWith(strip) ? n.substring(strip.length()) : n;
      if (plainName(leaf)) names.put(leaf);
    }
    r.put("manifest", manifest);
    call.resolve(r);
  }

  /**
   * Unpack the zip picked last into a folder under the tree, made if
   * need be. Entries with a path of their own are skipped; a folder
   * zipped whole has its one top folder stripped.
   *
   *   unpackZip({ dest }) -> { ok }
   */
  @PluginMethod
  public void unpackZip(PluginCall call) {
    Uri src = pendingZip;
    String dest = call.getString("dest", "");
    Uri t = tree();
    if (src == null || t == null || dest.isEmpty()) { call.reject("nothing to unpack"); return; }
    try {
      List<String> all = new ArrayList<>();
      try (java.util.zip.ZipInputStream z = new java.util.zip.ZipInputStream(
          getContext().getContentResolver().openInputStream(src))) {
        java.util.zip.ZipEntry e;
        while ((e = z.getNextEntry()) != null) { if (!e.isDirectory()) all.add(e.getName()); z.closeEntry(); }
      }
      String strip = commonDir(all);
      String parentId = dirId(t, dest);
      if (parentId == null) { call.reject("cannot create folder"); return; }
      Uri parent = DocumentsContract.buildDocumentUriUsingTree(t, parentId);
      long total = 0;
      try (java.util.zip.ZipInputStream z = new java.util.zip.ZipInputStream(
          getContext().getContentResolver().openInputStream(src))) {
        java.util.zip.ZipEntry e;
        while ((e = z.getNextEntry()) != null) {
          if (e.isDirectory()) { z.closeEntry(); continue; }
          String n = e.getName();
          String leaf = n.startsWith(strip) ? n.substring(strip.length()) : n;
          if (!plainName(leaf)) { z.closeEntry(); continue; }
          String mime = leaf.endsWith(".json") ? "application/json" : "application/octet-stream";
          String existing = childId(t, parentId, leaf);
          Uri doc = existing != null
              ? DocumentsContract.buildDocumentUriUsingTree(t, existing)
              : DocumentsContract.createDocument(getContext().getContentResolver(), parent, mime, leaf);
          if (doc == null) { call.reject("cannot create " + leaf); return; }
          ByteArrayOutputStream buf = new ByteArrayOutputStream();
          pump(z, buf, MAX_ENTRY);
          total += buf.size();
          if (total > MAX_TOTAL) { call.reject("too large"); return; }
          try (OutputStream out = getContext().getContentResolver().openOutputStream(doc, "wt")) {
            out.write(buf.toByteArray());
          }
          z.closeEntry();
        }
      }
      pendingZip = null;
      JSObject r = new JSObject();
      r.put("ok", true);
      call.resolve(r);
    } catch (Exception ex) {
      call.reject("cannot unpack: " + ex.getMessage());
    }
  }

  @ActivityCallback
  private void picked(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    if (result.getResultCode() == android.app.Activity.RESULT_OK && data != null && data.getData() != null) {
      Uri u = data.getData();
      try {
        getContext().getContentResolver().takePersistableUriPermission(u,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        getContext().getSharedPreferences(PREFS, 0).edit().putString(KEY, u.toString()).apply();
      } catch (SecurityException e) {
        call.reject("grant refused");
        return;
      }
    }
    call.resolve(status(tree()));
  }

  /** the id of the child of `parent` with this display name, or null */
  private String childId(Uri t, String parent, String name) {
    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(t, parent);
    String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME };
    try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
      while (c != null && c.moveToNext()) {
        if (name.equals(c.getString(1))) return c.getString(0);
      }
    }
    return null;
  }

  /**
   * The document id at a path under the tree, or null. A path is display
   * names joined by "/"; "" is the tree itself. Each segment is one
   * child lookup, which is how a theme's folder is reached.
   */
  private String docId(Uri t, String path) {
    String id = DocumentsContract.getTreeDocumentId(t);
    if (path == null || path.isEmpty()) return id;
    for (String seg : path.split("/")) {
      if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) return null;
      id = childId(t, id, seg);
      if (id == null) return null;
    }
    return id;
  }

  /**
   * What a folder holds: `names` are its files, `dirs` its subfolders.
   * `path` picks the folder; left out, the tree itself. A path that does
   * not exist lists as empty.
   */
  @PluginMethod
  public void list(PluginCall call) {
    Uri t = tree();
    JSArray names = new JSArray();
    JSArray dirs = new JSArray();
    String id = t == null ? null : docId(t, call.getString("path", ""));
    if (id != null) {
      Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(t, id);
      String[] cols = { DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE };
      List<String> files = new ArrayList<>();
      List<String> folders = new ArrayList<>();
      try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
        while (c != null && c.moveToNext()) {
          if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(1))) folders.add(c.getString(0));
          else files.add(c.getString(0));
        }
      } catch (Exception e) {
        call.reject("cannot list: " + e.getMessage());
        return;
      }
      for (String n : files) names.put(n);
      for (String n : folders) dirs.put(n);
    }
    JSObject r = new JSObject();
    r.put("names", names);
    r.put("dirs", dirs);
    call.resolve(r);
  }

  @PluginMethod
  public void read(PluginCall call) {
    String name = call.getString("name");
    Uri t = tree();
    if (t == null || name == null) { call.reject("no folder"); return; }
    String id = docId(t, name);
    if (id == null) { call.reject("no such file"); return; }
    Uri doc = DocumentsContract.buildDocumentUriUsingTree(t, id);
    try (InputStream in = getContext().getContentResolver().openInputStream(doc)) {
      ByteArrayOutputStream buf = new ByteArrayOutputStream();
      byte[] b = new byte[65536];
      int n;
      while ((n = in.read(b)) > 0) buf.write(b, 0, n);
      JSObject r = new JSObject();
      r.put("base64", Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP));
      call.resolve(r);
    } catch (Exception e) {
      call.reject("cannot read: " + e.getMessage());
    }
  }

  /**
   * The id of the folder at a path, creating each missing segment on
   * the way. "" is the tree itself. Null when a segment cannot be made.
   */
  private String dirId(Uri t, String path) throws Exception {
    String id = DocumentsContract.getTreeDocumentId(t);
    if (path == null || path.isEmpty()) return id;
    for (String seg : path.split("/")) {
      if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) return null;
      String next = childId(t, id, seg);
      if (next == null) {
        Uri parent = DocumentsContract.buildDocumentUriUsingTree(t, id);
        Uri made = DocumentsContract.createDocument(getContext().getContentResolver(), parent,
            DocumentsContract.Document.MIME_TYPE_DIR, seg);
        if (made == null) return null;
        next = DocumentsContract.getDocumentId(made);
      }
      id = next;
    }
    return id;
  }

  /**
   * Write bytes under a name, which may be a path: "themes/mine/x.json".
   * Folders on the way are created. An existing file is replaced.
   */
  @PluginMethod
  public void write(PluginCall call) {
    String name = call.getString("name");
    String b64 = call.getString("base64");
    Uri t = tree();
    if (t == null || name == null || b64 == null) { call.reject("no folder"); return; }
    try {
      String id = docId(t, name);
      Uri doc;
      if (id != null) {
        doc = DocumentsContract.buildDocumentUriUsingTree(t, id);
      } else {
        int cut = name.lastIndexOf('/');
        String dir = cut < 0 ? "" : name.substring(0, cut);
        String leaf = cut < 0 ? name : name.substring(cut + 1);
        String parentId = dirId(t, dir);
        if (parentId == null) { call.reject("cannot create folder"); return; }
        Uri parent = DocumentsContract.buildDocumentUriUsingTree(t, parentId);
        String mime = leaf.endsWith(".json") ? "application/json" : "application/octet-stream";
        doc = DocumentsContract.createDocument(getContext().getContentResolver(), parent, mime, leaf);
        if (doc == null) { call.reject("cannot create"); return; }
      }
      // "wt": truncate, so a shorter file does not keep the old tail
      try (OutputStream out = getContext().getContentResolver().openOutputStream(doc, "wt")) {
        out.write(Base64.decode(b64, Base64.DEFAULT));
      }
      call.resolve();
    } catch (Exception e) {
      call.reject("cannot write: " + e.getMessage());
    }
  }

  /**
   * Hand the bytes to whatever the user picks from the share sheet.
   *
   * Nothing goes in the user's folder: the file lands in the app's own
   * cache, and the FileProvider grants the receiving app read access to
   * that one file. Sharing needs no folder to have been picked at all.
   */
  @PluginMethod
  public void share(PluginCall call) {
    String name = call.getString("name");
    String b64 = call.getString("base64");
    if (name == null || b64 == null) { call.reject("nothing to share"); return; }
    try {
      java.io.File dir = new java.io.File(getContext().getCacheDir(), "share");
      dir.mkdirs();
      for (java.io.File old : dir.listFiles() == null ? new java.io.File[0] : dir.listFiles()) old.delete();
      java.io.File f = new java.io.File(dir, name);
      try (OutputStream out = new java.io.FileOutputStream(f)) {
        out.write(Base64.decode(b64, Base64.DEFAULT));
      }
      Uri uri = androidx.core.content.FileProvider.getUriForFile(
        getContext(),
        getContext().getPackageName() + ".fileprovider",
        f
      );
      Intent send = new Intent(Intent.ACTION_SEND);
      send.setType("application/json");
      send.putExtra(Intent.EXTRA_STREAM, uri);
      send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      Intent chooser = Intent.createChooser(send, name);
      chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(chooser);
      call.resolve();
    } catch (Exception e) {
      call.reject("cannot share: " + e.getMessage());
    }
  }

  @PluginMethod
  public void remove(PluginCall call) {
    String name = call.getString("name");
    Uri t = tree();
    if (t == null || name == null) { call.reject("no folder"); return; }
    String id = docId(t, name);
    if (id == null) { call.resolve(); return; }
    try {
      DocumentsContract.deleteDocument(getContext().getContentResolver(), DocumentsContract.buildDocumentUriUsingTree(t, id));
      call.resolve();
    } catch (Exception e) {
      call.reject("cannot remove: " + e.getMessage());
    }
  }
}
