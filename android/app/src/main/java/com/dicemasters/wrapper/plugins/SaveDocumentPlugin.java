package com.dicemasters.wrapper.plugins;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "SaveDocument")
public class SaveDocumentPlugin extends Plugin {
  private ActivityResultLauncher<Intent> createDocumentLauncher;
  private PluginCall pendingCall;
  private String pendingBase64;
  private String pendingMimeType;

  @Override
  public void load() {
    createDocumentLauncher = bridge.registerForActivityResult(
      new ActivityResultContracts.StartActivityForResult(),
      this::handleResult
    );
  }

  @PluginMethod
  public void saveDocument(PluginCall call) {
    if (pendingCall != null) {
      call.reject("Another save operation is already in progress.");
      return;
    }

    String filename = call.getString("filename");
    String data = call.getString("data");
    String mimeType = call.getString("mimeType", "application/octet-stream");

    if (filename == null || filename.trim().isEmpty()) {
      call.reject("filename must be provided.");
      return;
    }

    if (data == null) {
      call.reject("data must be provided.");
      return;
    }

    pendingCall = call;
    pendingBase64 = data;
    pendingMimeType = mimeType;

    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType(mimeType);
    intent.putExtra(Intent.EXTRA_TITLE, filename);

    try {
      createDocumentLauncher.launch(intent);
    } catch (Exception ex) {
      cleanup();
      call.reject("Unable to launch save dialog.", ex);
    }
  }

  private void handleResult(ActivityResult result) {
    if (pendingCall == null) {
      return;
    }

    PluginCall call = pendingCall;
    String base64 = pendingBase64;
    String mimeType = pendingMimeType;
    cleanup();

    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      call.reject("User canceled");
      return;
    }

    Uri uri = result.getData().getData();
    if (uri == null) {
      call.reject("No file selected.");
      return;
    }

    try {
      byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
      OutputStream outputStream = getContext().getContentResolver().openOutputStream(uri, "wt");
      if (outputStream == null) {
        call.reject("Unable to open destination.");
        return;
      }
      outputStream.write(bytes);
      outputStream.flush();
      outputStream.close();

      JSObject response = new JSObject();
      response.put("uri", uri.toString());
      response.put("mimeType", mimeType);
      call.resolve(response);
    } catch (IOException ex) {
      call.reject("Failed to save document.", ex);
    }
  }

  private void cleanup() {
    pendingCall = null;
    pendingBase64 = null;
    pendingMimeType = null;
  }
}
