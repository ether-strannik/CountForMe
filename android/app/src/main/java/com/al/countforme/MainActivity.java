package com.al.countforme;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // the bridges the page reaches for, registered before the bridge starts
    registerPlugin(FolderPlugin.class); // src/files.js
    registerPlugin(SessionPlugin.class); // src/session.js
    registerPlugin(SystemPlugin.class); // src/system.js
    super.onCreate(savedInstanceState);

    // Android back: the page pushes a history entry for each screen it
    // opens (src/nav.js), so back pops the page's history first and only
    // leaves the app when there is nothing left to pop.
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        if (getBridge().getWebView().canGoBack()) {
          getBridge().getWebView().goBack();
        } else {
          setEnabled(false);
          getOnBackPressedDispatcher().onBackPressed();
        }
      }
    });
  }
}
