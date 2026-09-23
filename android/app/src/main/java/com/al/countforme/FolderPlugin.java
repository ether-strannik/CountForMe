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
 *   remove({ name })
 *   share({ name, base64 })  hand the bytes to another app
 *   pickFile()          -> { name, base64 }  one audio file from anywhere
 */
@CapacitorPlugin(name = "Folder")
public class FolderPlugin extends Plugin {
  private static final String PREFS = "folder";
  private static final String KEY = "tree";

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
   *   pickFile() -> { name, base64 }   or { name: "" } when nothing was picked
   */
  @PluginMethod
  public void pickFile(PluginCall call) {
    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    i.addCategory(Intent.CATEGORY_OPENABLE);
    i.setType("audio/*");
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
      String name = "";
      String[] cols = { android.provider.OpenableColumns.DISPLAY_NAME };
      try (Cursor c = getContext().getContentResolver().query(u, cols, null, null, null)) {
        if (c != null && c.moveToFirst()) name = c.getString(0);
      }
      if (name == null || name.isEmpty()) name = u.getLastPathSegment();
      ByteArrayOutputStream buf = new ByteArrayOutputStream();
      byte[] b = new byte[65536];
      int n;
      while ((n = in.read(b)) > 0) buf.write(b, 0, n);
      r.put("name", name);
      r.put("base64", Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP));
      call.resolve(r);
    } catch (Exception e) {
      call.reject("cannot read: " + e.getMessage());
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
