# Capacitor finds a plugin by reading its annotations at runtime:
# @CapacitorPlugin(name = "Session") is how the page reaches
# window.Capacitor.Plugins.Session, and @PluginMethod marks what it may
# call. R8 keeps the classes — Capacitor ships consumerProguardFiles for
# that — but it strips the annotation ATTRIBUTES, and the annotation
# types with them.
#
# The failure is silent. The class is there, the methods are there, and
# registerPlugin finds no name, so the plugin never appears on the
# bridge. No crash, no log: the folder, the session notification and
# keep-screen-on simply do nothing. Verified on device 2026-09-21.
-keepattributes *Annotation*, RuntimeVisibleAnnotations, AnnotationDefault
-keep @interface com.getcapacitor.** { *; }
-keep @interface com.getcapacitor.annotation.** { *; }
