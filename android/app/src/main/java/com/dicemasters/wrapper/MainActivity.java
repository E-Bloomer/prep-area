package com.dicemasters.wrapper;

import android.os.Bundle;

import com.dicemasters.wrapper.plugins.SaveDocumentPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(SaveDocumentPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
