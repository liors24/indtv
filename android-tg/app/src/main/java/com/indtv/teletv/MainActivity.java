package com.indtv.teletv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/** TeleTV: a full-screen WebView that hosts the TeleTV web app from the APK's assets. */
public class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + ASSET_HOST + "/assets/index.html";

    private WebView web;
    private WebViewAssetLoader assets;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0E1621);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // the Telegram session is kept in localStorage
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " TeleTV-AndroidTV/1.0");

        assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.addJavascriptInterface(new Bridge(), "TeleTVNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (ASSET_HOST.equals(url.getHost())) return assets.shouldInterceptRequest(url);
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !ASSET_HOST.equals(request.getUrl().getHost());
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(HOME);
        web.requestFocus();
    }

    /** D-pad and OK reach the page natively. Back, channel and media keys are forwarded to the app. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String key = null;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                key = "Escape"; break;
            case KeyEvent.KEYCODE_CHANNEL_UP:
                key = "PageUp"; break;
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                key = "PageDown"; break;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                key = "MediaPlayPause"; break;
            case KeyEvent.KEYCODE_MEDIA_PLAY:
                key = "MediaPlay"; break;
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                key = "MediaPause"; break;
            case KeyEvent.KEYCODE_MEDIA_STOP:
                key = "MediaStop"; break;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                key = "MediaFastForward"; break;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                key = "MediaRewind"; break;
            default:
                break;
        }
        if (key == null) return super.dispatchKeyEvent(event);
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            web.evaluateJavascript("window.TGKey ? TGKey('" + key + "') : false", null);
        }
        return true;
    }

    private class Bridge {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                @Override public void run() { finish(); }
            });
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
