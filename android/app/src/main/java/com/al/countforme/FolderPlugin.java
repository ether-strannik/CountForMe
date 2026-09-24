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
 *   folders()           -> { folders }       the folders added for music, each its own grant
 *   addFolder()         -> { folders }       the picker again; what comes back is kept
 *   dropFolder({ uri }) -> { folders }       that grant given back
 *   browse({ uri })     -> { dirs, files }   inside one folder, by URI, for the added ones
 *   list({ path? })     -> { names, dirs }   files and subfolders of a folder
 *   read({ name })      -> { base64 }        name may be a path: "themes/x/y.mp3"
 *   write({ name, base64 })                  name may be a path; folders are made
 *   remove({ name })                         name may be a path; a folder goes with its contents
 *   copyDir({ from, to, asset? })            a folder's contents into another, streamed here
 *   share({ name, base64 })  hand the bytes to another app
 *   pickFile({ type? }) -> { name, base64 }  one file from anywhere
 *   pickSong()          -> { name, uri }     one song, kept, streamed not carried
 *   song()              -> { name, uri }     the song kept last time
 *   fileUri({ name })   -> { uri }           a file under the tree, to stream rather than read
 *   exportZip({ path, name, asset? }) -> { saved }   a folder and all under it, to where the user picks
 *   pickZip()           -> { names, manifest }       a zip the user picks, looked inside; names carry their paths
 *   unpackZip({ dest }) -> { ok }                    that zip, tree and all, into a folder under the tree
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

  /** what a granted tree is called: the last part of its document id */
  private static String treeName(Uri u) {
    String id = DocumentsContract.getTreeDocumentId(u); // "primary:Timer"
    int c = id.lastIndexOf(':');
    int s = id.lastIndexOf('/');
    String name = id.substring(Math.max(c, s) + 1);
    return name.isEmpty() ? id : name;
  }

  /**
   * Where a granted tree sits, for a human: "Internal storage / Music".
   * The document id carries a volume and a path, and neither is a real
   * filesystem path — this is a label, not something to open.
   */
  private static String treePath(Uri u) {
    String id = DocumentsContract.getTreeDocumentId(u); // "primary:Music/Rock"
    int c = id.indexOf(':');
    String volume = c < 0 ? "" : id.substring(0, c);
    String path = c < 0 ? id : id.substring(c + 1);
    String head = "primary".equals(volume) ? "Internal storage" : volume;
    return path.isEmpty() ? head : head + " / " + path.replace("/", " / ");
  }

  private JSObject status(Uri u) {
    JSObject r = new JSObject();
    r.put("granted", u != null);
    r.put("name", u == null ? "" : treeName(u));
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

  // ---- the folders the user keeps music in ----
  // The app declares no storage permission, so a folder it can read is
  // a folder the user handed it through the system picker. Adding one
  // here is another such grant, kept for good.
  //
  // Nothing is stored to remember them: Android already keeps the list
  // of what this app has been granted, and that list IS the answer. A
  // grant revoked from system settings therefore disappears from here
  // on its own, with nothing to go stale.
  //
  // Every tree grant but one: the folder chosen under General, which is
  // where themes and presets live and is not a place to scan for music.

  /** @return the tree grants that are not the app's own folder */
  private List<Uri> musicTrees() {
    Uri main = tree();
    List<Uri> out = new ArrayList<>();
    for (android.content.UriPermission up : getContext().getContentResolver().getPersistedUriPermissions()) {
      Uri u = up.getUri();
      if (!up.isReadPermission() || !DocumentsContract.isTreeUri(u)) continue;
      if (main != null && u.equals(main)) continue;
      out.add(u);
    }
    return out;
  }

  private JSObject folderList() {
    JSArray arr = new JSArray();
    for (Uri u : musicTrees()) {
      JSObject o = new JSObject();
      o.put("uri", u.toString());
      o.put("name", treeName(u));
      o.put("path", treePath(u));
      arr.put(o);
    }
    JSObject r = new JSObject();
    r.put("folders", arr);
    return r;
  }

  /** the folders added for music: name, where it sits, and its grant */
  @PluginMethod
  public void folders(PluginCall call) {
    call.resolve(folderList());
  }

  /** the system tree picker; what comes back is kept for good */
  @PluginMethod
  public void addFolder(PluginCall call) {
    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    startActivityForResult(call, i, "addedFolder");
  }

  @ActivityCallback
  private void addedFolder(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    if (result.getResultCode() == android.app.Activity.RESULT_OK && data != null && data.getData() != null) {
      try {
        getContext()
            .getContentResolver()
            .takePersistableUriPermission(data.getData(), Intent.FLAG_GRANT_READ_URI_PERMISSION);
      } catch (Exception wontPersist) {
        // a provider that will not keep the grant: nothing is added
      }
    }
    call.resolve(folderList());
  }

  /**
   * What one folder holds, by URI rather than by path.
   *
   * `list` above walks the app's own folder from its root, a name at a
   * time. That will not reach the folders added for music: each is its
   * own grant, with no shared root to walk from. So this takes a URI
   * and answers with URIs, and moving down the tree is following one
   * of them rather than joining strings.
   *
   * A document URI built inside a tree carries that tree with it, so
   * one URI is enough to ask again at the next level down.
   *
   *   browse({ uri }) -> { dirs: [{uri, name}], files: [{uri, name}] }
   */
  @PluginMethod
  public void browse(PluginCall call) {
    String s = call.getString("uri", "");
    JSArray dirs = new JSArray();
    JSArray files = new JSArray();
    try {
      Uri u = Uri.parse(s);
      String id = DocumentsContract.isTreeUri(u) && !s.contains("/document/")
          ? DocumentsContract.getTreeDocumentId(u)
          : DocumentsContract.getDocumentId(u);
      Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(u, id);
      String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
          DocumentsContract.Document.COLUMN_MIME_TYPE };
      try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
        while (c != null && c.moveToNext()) {
          JSObject o = new JSObject();
          o.put("uri", DocumentsContract.buildDocumentUriUsingTree(u, c.getString(0)).toString());
          o.put("name", c.getString(1));
          if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) dirs.put(o);
          else files.put(o);
        }
      }
    } catch (Exception notReadable) {
      // a grant taken back, or a folder that went: it lists as empty
    }
    JSObject r = new JSObject();
    r.put("dirs", dirs);
    r.put("files", files);
    call.resolve(r);
  }

  /** give a folder's grant back; the app can no longer read it */
  @PluginMethod
  public void dropFolder(PluginCall call) {
    String uri = call.getString("uri", "");
    if (!uri.isEmpty()) {
      try {
        getContext()
            .getContentResolver()
            .releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION);
      } catch (Exception gone) {
        // already released, or never ours
      }
    }
    call.resolve(folderList());
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

  /**
   * The content URI of one file under the tree.
   *
   * A picked song arrives with a URI already; a song sitting in a
   * theme's `media/` is only a path, and a path cannot be streamed.
   * This is the other half of the same idea: the page turns what comes
   * back into a URL and the decoder pulls from it, so a theme's music
   * is never read into the page either.
   *
   * A file the tree does not hold answers with "".
   *
   *   fileUri({ name }) -> { uri }   name may be a path
   */
  @PluginMethod
  public void fileUri(PluginCall call) {
    Uri t = tree();
    String name = call.getString("name", "");
    JSObject r = new JSObject();
    r.put("uri", "");
    String id = (t == null || name.isEmpty()) ? null : docId(t, name);
    if (id != null) r.put("uri", DocumentsContract.buildDocumentUriUsingTree(t, id).toString());
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
  // A theme is a tree: theme.json, sounds/ and media/. Export zips it
  // whole, paths and all, to a place the user picks; import reads a zip
  // the user picks and unpacks it into a folder under the tree, making
  // the folders it needs. Nothing goes through the page as bytes: the
  // zip is read and written here.

  /**
   * An entry path that may land under the destination: plain segments,
   * and no climbing out of it.
   *
   * This is the zip-slip guard, and it is the whole reason entries used
   * to be flattened. A zip is a list of names written by someone else,
   * and "../../../etc" is a valid name. Flattening made that safe by
   * throwing the path away; a theme is a tree now, so the path has to
   * be kept and checked instead.
   */
  private static boolean safePath(String n) {
    if (n == null || n.isEmpty() || n.length() > 512) return false;
    if (n.startsWith("/") || n.contains("\\")) return false;
    if (n.length() > 1 && n.charAt(1) == ':') return false; // a drive letter
    String[] segs = n.split("/", -1);
    if (segs.length > 8) return false;
    for (String seg : segs) {
      if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) return false;
      if (seg.length() > 120) return false;
    }
    return true;
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

  /**
   * Copy, with a ceiling only where one is needed: `theme.json` is
   * read into memory to be parsed, so that read is bounded. Files go
   * to and from storage in a stream and are as big as they are.
   *
   * What a zip has to be guarded against is a path that climbs out of
   * the folder, and `safePath` refuses that at any size. A file too
   * big to be what it claims is something the user can see.
   */
  private static void pump(InputStream in, OutputStream out, long cap) throws Exception {
    byte[] b = new byte[65536];
    long total = 0;
    int n;
    while ((n = in.read(b)) > 0) {
      total += n;
      if (cap > 0 && total > cap) throw new Exception("too large");
      out.write(b, 0, n);
    }
  }

  /**
   * Every file under a folder in the app's own files, written into the
   * zip under its path. `rel` is where we are below `base`, and what
   * the entry is named.
   *
   * An asset listing does not say what is a folder, and an empty one
   * lists the same as a file. Opening it does say: a folder will not
   * open.
   */
  private void zipAssets(java.util.zip.ZipOutputStream z, String base, String rel) throws Exception {
    String dir = rel.isEmpty() ? base : base + "/" + rel;
    for (String n : getContext().getAssets().list(dir)) {
      String path = rel.isEmpty() ? n : rel + "/" + n;
      InputStream in = null;
      try {
        in = getContext().getAssets().open(dir + "/" + n);
      } catch (Exception notAFile) {
        zipAssets(z, base, path);
        continue;
      }
      try {
        z.putNextEntry(new java.util.zip.ZipEntry(path));
        pump(in, z, 0);
        z.closeEntry();
      } finally {
        in.close();
      }
    }
  }

  /** the same for a folder under the tree, walking into its subfolders */
  private void zipTree(java.util.zip.ZipOutputStream z, Uri t, String id, String rel) throws Exception {
    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(t, id);
    String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE };
    try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
      while (c != null && c.moveToNext()) {
        String path = rel.isEmpty() ? c.getString(1) : rel + "/" + c.getString(1);
        if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) {
          zipTree(z, t, c.getString(0), path);
          continue;
        }
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(t, c.getString(0));
        try (InputStream in = getContext().getContentResolver().openInputStream(doc)) {
          z.putNextEntry(new java.util.zip.ZipEntry(path));
          pump(in, z, 0);
          z.closeEntry();
        }
      }
    }
  }

  /**
   * Zip a folder whole, to a file the user picks through the system's
   * save dialog. `path` is a folder under the tree, or, with `asset`
   * true, a folder inside the app's own files (the shipped theme).
   *
   * The tree goes in as a tree: `sounds/` and `media/` keep their
   * paths, so a theme arrives complete rather than as a heap of files.
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
        zipAssets(z, path, "");
      } else {
        Uri t = tree();
        String id = t == null ? null : docId(t, path);
        if (id == null) { call.reject("no such folder"); return; }
        zipTree(z, t, id, "");
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
      String rel = n.startsWith(strip) ? n.substring(strip.length()) : n;
      if (safePath(rel)) names.put(rel);
    }
    r.put("manifest", manifest);
    call.resolve(r);
  }

  /**
   * Unpack the zip picked last into a folder under the tree, made if
   * need be. An entry keeps its path and its folders are created; a
   * folder zipped whole has its one top folder stripped. Anything
   * `safePath` refuses is skipped.
   *
   * Entries stream straight to their file rather than through memory,
   * because a song does not fit in the buffer the flat version used.
   * An entry refused part way therefore leaves a short file behind, in
   * a folder made for this import, which the check then fails.
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
      if (dirId(t, dest) == null) { call.reject("cannot create folder"); return; }
      // One lookup per folder, not per file: a media folder is a lot of
      // entries and every one of them shares a parent.
      java.util.HashMap<String, String> folders = new java.util.HashMap<>();
      try (java.util.zip.ZipInputStream z = new java.util.zip.ZipInputStream(
          getContext().getContentResolver().openInputStream(src))) {
        java.util.zip.ZipEntry e;
        while ((e = z.getNextEntry()) != null) {
          if (e.isDirectory()) { z.closeEntry(); continue; }
          String n = e.getName();
          String rel = n.startsWith(strip) ? n.substring(strip.length()) : n;
          if (!safePath(rel)) { z.closeEntry(); continue; }
          int cut = rel.lastIndexOf('/');
          String leaf = cut < 0 ? rel : rel.substring(cut + 1);
          String under = cut < 0 ? dest : dest + "/" + rel.substring(0, cut);
          String parentId = folders.get(under);
          if (parentId == null) {
            parentId = dirId(t, under);
            if (parentId == null) { call.reject("cannot create folder for " + rel); return; }
            folders.put(under, parentId);
          }
          Uri parent = DocumentsContract.buildDocumentUriUsingTree(t, parentId);
          String mime = leaf.endsWith(".json") ? "application/json" : "application/octet-stream";
          String existing = childId(t, parentId, leaf);
          Uri doc = existing != null
              ? DocumentsContract.buildDocumentUriUsingTree(t, existing)
              : DocumentsContract.createDocument(getContext().getContentResolver(), parent, mime, leaf);
          if (doc == null) { call.reject("cannot create " + rel); return; }
          try (OutputStream out = getContext().getContentResolver().openOutputStream(doc, "wt")) {
            pump(z, out, 0);
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

  // ---- copying a folder into another, here rather than through the page ----
  // Copying a theme used to be a file at a time through the bridge, which
  // was tolerable while a theme was cue sounds. A theme carries its music
  // now, and bytes that size do not belong in a page: they would cross as
  // base64 and be decoded a character at a time. So the copy happens here,
  // streamed, and the page only says what to copy where.

  /** one file into a folder under the tree, replacing what is there */
  private void writeInto(Uri t, String dirPath, String leaf, InputStream in) throws Exception {
    String parentId = dirId(t, dirPath);
    if (parentId == null) throw new Exception("cannot make " + dirPath);
    Uri parent = DocumentsContract.buildDocumentUriUsingTree(t, parentId);
    String existing = childId(t, parentId, leaf);
    String mime = leaf.endsWith(".json") ? "application/json" : "application/octet-stream";
    Uri doc = existing != null
        ? DocumentsContract.buildDocumentUriUsingTree(t, existing)
        : DocumentsContract.createDocument(getContext().getContentResolver(), parent, mime, leaf);
    if (doc == null) throw new Exception("cannot make " + leaf);
    try (OutputStream out = getContext().getContentResolver().openOutputStream(doc, "wt")) {
      pump(in, out, 0);
    }
  }

  /** everything under an asset folder, into a folder under the tree */
  private void copyAssetsInto(Uri t, String from, String to) throws Exception {
    String[] kids = getContext().getAssets().list(from);
    if (kids == null) return;
    for (String n : kids) {
      InputStream in;
      try {
        in = getContext().getAssets().open(from + "/" + n);
      } catch (Exception notAFile) {
        copyAssetsInto(t, from + "/" + n, to + "/" + n);
        continue;
      }
      try {
        writeInto(t, to, n, in);
      } finally {
        in.close();
      }
    }
  }

  /** everything under one folder of the tree, into another */
  private void copyTreeInto(Uri t, String fromId, String to) throws Exception {
    Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(t, fromId);
    String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE };
    try (Cursor c = getContext().getContentResolver().query(children, cols, null, null, null)) {
      while (c != null && c.moveToNext()) {
        if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) {
          copyTreeInto(t, c.getString(0), to + "/" + c.getString(1));
          continue;
        }
        Uri doc = DocumentsContract.buildDocumentUriUsingTree(t, c.getString(0));
        try (InputStream in = getContext().getContentResolver().openInputStream(doc)) {
          writeInto(t, to, c.getString(1), in);
        }
      }
    }
  }

  /**
   * Copy a folder's contents into another folder under the tree, made
   * if need be. `from` is a path under the tree, or a folder in the
   * app's own files when `asset` is true.
   *
   * A source that is not there copies nothing and is not a failure: a
   * theme with no music has no `media/`, and copying it is a no-op, not
   * an error.
   *
   *   copyDir({ from, to, asset? }) -> { ok }
   */
  @PluginMethod
  public void copyDir(PluginCall call) {
    Uri t = tree();
    String from = call.getString("from", "");
    String to = call.getString("to", "");
    boolean asset = Boolean.TRUE.equals(call.getBoolean("asset", false));
    JSObject r = new JSObject();
    if (t == null || from.isEmpty() || to.isEmpty()) {
      call.reject("nothing to copy");
      return;
    }
    try {
      if (asset) {
        copyAssetsInto(t, from, to);
      } else {
        String id = docId(t, from);
        if (id != null) copyTreeInto(t, id, to);
      }
      r.put("ok", true);
      call.resolve(r);
    } catch (Exception e) {
      call.reject("cannot copy: " + e.getMessage());
    }
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
