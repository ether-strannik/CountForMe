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
 *   list()              -> { names }
 *   read({ name })      -> { base64 }
 *   write({ name, base64 })
 *   remove({ name })
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

  /** the document id of a top-level file by display name, or null */
  private String docId(Uri t, String name) {
    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
    String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME };
    try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
      while (c != null && c.moveToNext()) {
        if (name.equals(c.getString(1))) return c.getString(0);
      }
    }
    return null;
  }

  @PluginMethod
  public void list(PluginCall call) {
    Uri t = tree();
    JSArray names = new JSArray();
    if (t != null) {
      Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
      String[] cols = { DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE };
      List<String> out = new ArrayList<>();
      try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
        while (c != null && c.moveToNext()) {
          if (!DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(1))) out.add(c.getString(0));
        }
      } catch (Exception e) {
        call.reject("cannot list: " + e.getMessage());
        return;
      }
      for (String n : out) names.put(n);
    }
    JSObject r = new JSObject();
    r.put("names", names);
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
        Uri parent = DocumentsContract.buildDocumentUriUsingTree(t, DocumentsContract.getTreeDocumentId(t));
        String mime = name.endsWith(".json") ? "application/json" : "application/octet-stream";
        doc = DocumentsContract.createDocument(getContext().getContentResolver(), parent, mime, name);
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
