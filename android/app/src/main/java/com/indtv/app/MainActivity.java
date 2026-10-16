package com.indtv.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Build;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.Window;
import android.widget.FrameLayout;
import android.graphics.Color;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.util.Iterator;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * INDTV for Android TV / Google TV.
 *
 * The INDTV web app ships inside the APK (assets) and runs in a full-screen WebView.
 * Network requests made by the page (playlist, HLS manifests and segments) are fetched
 * natively and returned with permissive CORS headers. That lets public streams play even
 * when their servers do not send CORS headers or use plain http, which a normal browser blocks.
 * It does not touch DRM, sign-in or geo restrictions.
 */
public class MainActivity extends Activity {

    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + ASSET_HOST + "/assets/index.html";
    private static final int MAX_REDIRECTS = 5;

    private WebView web;
    private FrameLayout rootView;
    private NativePlayer exo;
    /** True while the page is recording a programme: the app then keeps running in the background. */
    private volatile boolean recording = false;
    private String recTitle = "";
    /** True while video keeps playing with the TV screen off (until the user returns, switches app or closes INDTV). */
    private boolean backgroundPlay = false;
    private boolean resumed = false;
    private boolean userLeft = false;
    private long screenOffAt = 0;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private BroadcastReceiver screenReceiver;
    private WebViewAssetLoader assets;

    /** host -> {userAgent, referrer} requested by the playlist (#EXTVLCOPT) for that stream. */
    private final Map<String, String[]> headersByHost = new ConcurrentHashMap<String, String[]>();

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        web = new WebView(this);
        // Keep the page's renderer at high priority so a recording keeps running while the app is in the background.
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        // Transparent page over a dark room: the TV's own video engine draws behind it when it is in use.
        web.setBackgroundColor(Color.TRANSPARENT);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        rootView = new FrameLayout(this);
        rootView.setBackgroundColor(0xFF0E0B14);
        rootView.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(rootView);
        exo = new NativePlayer(this, rootView, web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setUserAgentString(s.getUserAgentString() + " INDTV-AndroidTV/1.0");

        assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.addJavascriptInterface(new Bridge(), "INDTVNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new Client());

        // Remember when the TV screen goes off: leaving the app because of that keeps the video playing.
        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                if (Intent.ACTION_SCREEN_OFF.equals(i.getAction())) screenOffAt = System.currentTimeMillis();
            }
        };
        try { registerReceiver(screenReceiver, new IntentFilter(Intent.ACTION_SCREEN_OFF)); } catch (Exception ignored) { }

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(HOME);
        web.requestFocus();
    }

    /* ------------------------------------------------------------------ */
    /* Remote keys                                                         */
    /* ------------------------------------------------------------------ */

    /** D-pad and OK reach the page natively. Back, channel and media keys are forwarded to INDTV. */
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
            web.evaluateJavascript("window.INDTVKey ? INDTVKey('" + key + "') : 'not-ready'", null);
        }
        return true;
    }

    /* ------------------------------------------------------------------ */
    /* JavaScript bridge                                                   */
    /* ------------------------------------------------------------------ */

    private class Bridge {
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    // A running recording must survive "exit": just move the app to the background.
                    if (recording) moveTaskToBack(true); else finish();
                }
            });
        }

        /** Called by the page when a recording starts or stops: keeps the process alive in the background. */
        @JavascriptInterface
        public void setRecording(final boolean on, final String title) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { applyRecording(on, title); }
            });
        }

        /** Remember the User-Agent / Referer the playlist asks for, for that stream's host. */
        @JavascriptInterface
        public void setStreamHeaders(String url, String userAgent, String referrer) {
            try {
                String host = Uri.parse(url).getHost();
                if (host == null) return;
                String ua = userAgent == null || userAgent.isEmpty() ? null : userAgent;
                String ref = referrer == null || referrer.isEmpty() ? null : referrer;
                if (ua == null && ref == null) headersByHost.remove(host);
                else headersByHost.put(host, new String[]{ua, ref});
            } catch (Exception ignored) {
                // malformed URL from the playlist: ignore
            }
        }

        /* ---- the TV's own video engine (see NativePlayer) ---- */
        @JavascriptInterface
        public boolean hasExo() { return true; }

        @JavascriptInterface
        public void exoPlay(final String url, final String userAgent, final String referrer, final int maxHeight) {
            runOnUiThread(new Runnable() { @Override public void run() { if (exo != null) exo.play(url, userAgent, referrer, maxHeight); } });
        }

        @JavascriptInterface
        public void exoStop() {
            runOnUiThread(new Runnable() { @Override public void run() { if (exo != null) exo.stop(); } });
        }

        @JavascriptInterface
        public void exoPause(final boolean paused) {
            runOnUiThread(new Runnable() { @Override public void run() { if (exo != null) { if (paused) exo.pause(); else exo.resume(); } } });
        }

        @JavascriptInterface
        public void exoMute(final boolean on) {
            runOnUiThread(new Runnable() { @Override public void run() { if (exo != null) exo.mute(on); } });
        }

        @JavascriptInterface
        public void exoQuality(final int maxHeight) {
            runOnUiThread(new Runnable() { @Override public void run() { if (exo != null) exo.quality(maxHeight); } });
        }

        @JavascriptInterface
        public void exoAspect(final String mode) {
            runOnUiThread(new Runnable() { @Override public void run() { if (exo != null) exo.aspect(mode); } });
        }

        @JavascriptInterface
        public String platform() { return "android-tv"; }

        /**
         * Small HTTPS request made natively (used by live translation to reach the speech/translation
         * service the viewer configured). Runs off the UI thread; the answer comes back through
         * window.INDTVNativeResponse(id, status, base64Body).
         */
        @JavascriptInterface
        public void httpRequest(final String id, final String method, final String url, final String headersJson, final String bodyBase64) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    int status = 0;
                    String body64 = "";
                    HttpURLConnection c = null;
                    try {
                        URL target = new URL(url);
                        String scheme = target.getProtocol();
                        if (!"https".equals(scheme) && !"http".equals(scheme)) throw new IOException("scheme");
                        c = (HttpURLConnection) target.openConnection();
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(40000);
                        c.setRequestMethod("POST".equalsIgnoreCase(method) ? "POST" : "GET");
                        c.setRequestProperty("User-Agent", "INDTV-AndroidTV/1.0 (Android TV)");
                        if (headersJson != null && !headersJson.isEmpty()) {
                            JSONObject h = new JSONObject(headersJson);
                            Iterator<String> keys = h.keys();
                            while (keys.hasNext()) {
                                String k = keys.next();
                                c.setRequestProperty(k, h.optString(k));
                            }
                        }
                        if (bodyBase64 != null && !bodyBase64.isEmpty()) {
                            byte[] bytes = Base64.decode(bodyBase64, Base64.DEFAULT);
                            c.setDoOutput(true);
                            c.setFixedLengthStreamingMode(bytes.length);
                            OutputStream os = c.getOutputStream();
                            os.write(bytes);
                            os.close();
                        }
                        status = c.getResponseCode();
                        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                        if (in != null) {
                            ByteArrayOutputStream buf = new ByteArrayOutputStream();
                            byte[] chunk = new byte[8192];
                            int n;
                            while ((n = in.read(chunk)) > 0 && buf.size() < 2 * 1024 * 1024) buf.write(chunk, 0, n);
                            in.close();
                            body64 = Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP);
                        }
                    } catch (Exception e) {
                        status = 0;
                    } finally {
                        if (c != null) c.disconnect();
                    }
                    final String js = "window.INDTVNativeResponse && INDTVNativeResponse('" + id.replaceAll("[^A-Za-z0-9_-]", "")
                            + "'," + status + ",'" + body64 + "')";
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() { if (web != null) web.evaluateJavascript(js, null); }
                    });
                }
            }).start();
        }
    }

    /* ------------------------------------------------------------------ */
    /* Request handling                                                    */
    /* ------------------------------------------------------------------ */

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String host = url.getHost();
            String scheme = url.getScheme();
            if (ASSET_HOST.equals(host)) return assets.shouldInterceptRequest(url);
            if (scheme == null || !(scheme.equals("http") || scheme.equals("https"))) return null;
            if (request.isForMainFrame()) return null;

            String method = request.getMethod();
            if ("OPTIONS".equalsIgnoreCase(method)) return preflight();
            if (!"GET".equalsIgnoreCase(method)) return null;

            Map<String, String> headers = request.getRequestHeaders();
            String accept = headers == null ? null : headerValue(headers, "Accept");
            // Images and fonts load fine without help; let the WebView cache handle them.
            boolean cors = headers != null && headerValue(headers, "Origin") != null;
            if (accept != null && (accept.startsWith("image/") || accept.contains("font/")) && !cors) return null;
            if (host != null && (host.endsWith("fonts.googleapis.com") || host.endsWith("fonts.gstatic.com"))) return null;

            try {
                return proxy(url.toString(), headers);
            } catch (Exception e) {
                return null; // fall back to the WebView's own request
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Stay inside INDTV; ignore navigation to other sites.
            return !ASSET_HOST.equals(request.getUrl().getHost());
        }
    }

    private static String headerValue(Map<String, String> headers, String name) {
        for (Map.Entry<String, String> h : headers.entrySet()) {
            if (h.getKey() != null && h.getKey().equalsIgnoreCase(name)) return h.getValue();
        }
        return null;
    }

    private static WebResourceResponse preflight() {
        Map<String, String> out = new HashMap<String, String>();
        out.put("Access-Control-Allow-Origin", "*");
        out.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        out.put("Access-Control-Allow-Headers", "*");
        out.put("Access-Control-Max-Age", "600");
        return new WebResourceResponse("text/plain", "utf-8", 204, "No Content", out,
                new ByteArrayInputStream(new byte[0]));
    }

    private WebResourceResponse proxy(String url, Map<String, String> requestHeaders) throws IOException {
        HttpURLConnection c;
        int redirects = 0;
        while (true) {
            URL target = new URL(url);
            c = (HttpURLConnection) target.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(12000);
            c.setReadTimeout(20000);
            if (requestHeaders != null) {
                for (Map.Entry<String, String> h : requestHeaders.entrySet()) {
                    String k = h.getKey();
                    if (k == null || h.getValue() == null) continue;
                    String lk = k.toLowerCase(Locale.ROOT);
                    if (lk.equals("origin") || lk.equals("referer") || lk.equals("host")
                            || lk.equals("accept-encoding") || lk.equals("cookie")) continue;
                    c.setRequestProperty(k, h.getValue());
                }
            }
            String[] extra = headersByHost.get(target.getHost());
            if (extra != null) {
                if (extra[0] != null) c.setRequestProperty("User-Agent", extra[0]);
                if (extra[1] != null) c.setRequestProperty("Referer", extra[1]);
            }
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && code != 304) {
                String location = c.getHeaderField("Location");
                c.disconnect();
                if (location == null || ++redirects > MAX_REDIRECTS) throw new IOException("Too many redirects");
                url = new URL(target, location).toString();
                continue;
            }
            break;
        }

        int code = c.getResponseCode();
        String reason = c.getResponseMessage();
        if (reason == null || reason.trim().isEmpty()) reason = code < 400 ? "OK" : "Error";

        String mime = "application/octet-stream";
        String encoding = null;
        String contentType = c.getContentType();
        if (contentType != null) {
            String[] parts = contentType.split(";");
            if (!parts[0].trim().isEmpty()) mime = parts[0].trim();
            for (int i = 1; i < parts.length; i++) {
                String p = parts[i].trim();
                if (p.toLowerCase(Locale.ROOT).startsWith("charset=")) encoding = p.substring(8).replace("\"", "");
            }
        }

        Map<String, String> out = new HashMap<String, String>();
        Map<String, List<String>> fields = c.getHeaderFields();
        if (fields != null) {
            for (Map.Entry<String, List<String>> e : fields.entrySet()) {
                String k = e.getKey();
                if (k == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                String lk = k.toLowerCase(Locale.ROOT);
                if (lk.startsWith("access-control-") || lk.equals("content-encoding") || lk.equals("transfer-encoding")
                        || lk.equals("content-length") || lk.equals("set-cookie") || lk.equals("connection")) continue;
                out.put(k, e.getValue().get(0));
            }
        }
        out.put("Access-Control-Allow-Origin", "*");
        out.put("Access-Control-Expose-Headers", "*");

        InputStream body = code >= 400 ? c.getErrorStream() : c.getInputStream();
        if (body == null) body = new ByteArrayInputStream(new byte[0]);
        else body = new BufferedInputStream(body, 64 * 1024);   // fewer, larger reads keep segments flowing smoothly
        return new WebResourceResponse(mime, encoding, code, reason, out, body);
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */
    /* ------------------------------------------------------------------ */

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    private void applyRecording(boolean on, String title) {
        recording = on;
        recTitle = title == null ? "" : title;
        applyService();
    }

    /** One foreground service keeps INDTV alive for a recording, catch-up capture or playback with the screen off. */
    private void applyService() {
        boolean on = recording || backgroundPlay;
        try {
            Intent i = new Intent(this, RecordingService.class);
            if (on) {
                i.putExtra("title", recording ? recTitle : "");
                i.putExtra("playing", backgroundPlay);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
            } else {
                stopService(i);
            }
        } catch (Exception ignored) {
            // the system may refuse a background start; everything still works while the app is open
        }
    }

    private boolean screenIsOff() {
        if (System.currentTimeMillis() - screenOffAt < 4000) return true;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            return pm != null && !pm.isInteractive();
        } catch (Exception e) {
            return false;
        }
    }

    /** Home button / another app: the user really left. */
    @Override
    protected void onUserLeaveHint() {
        userLeft = true;
        super.onUserLeaveHint();
    }

    private final Runnable decideBackground = new Runnable() {
        @Override
        public void run() {
            if (resumed || web == null) return;
            if (!userLeft && screenIsOff()) {
                // The TV was switched off (standby): keep playing until the user closes INDTV,
                // opens another app or picks something else to watch.
                backgroundPlay = true;
                applyService();
                return;
            }
            pauseForLeaving();
        }
    };

    private void pauseForLeaving() {
        backgroundPlay = false;
        applyService();
        if (exo != null) exo.pause();
        if (web == null) return;
        // Leaving for another app pauses the stream so it does not keep playing behind it...
        web.evaluateJavascript("window.INDTV && INDTV.Player && INDTV.Player.video && INDTV.Player.video.pause()", null);
        // ...but a recording or catch-up capture must keep running, so timers and downloads are not frozen.
        if (!recording) web.onPause();
    }

    @Override
    protected void onPause() {
        resumed = false;
        if (userLeft) pauseForLeaving();
        else ui.postDelayed(decideBackground, 700);   // the screen-off broadcast and power state settle first
        super.onPause();
    }

    @Override
    protected void onStop() {
        // Another app took over while the screen is on: that always pauses.
        if (!resumed && !backgroundPlay && !screenIsOff()) { ui.removeCallbacks(decideBackground); pauseForLeaving(); }
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        userLeft = false;
        ui.removeCallbacks(decideBackground);
        web.onResume();
        if (backgroundPlay) { backgroundPlay = false; applyService(); }
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacks(decideBackground);
        if (exo != null) { exo.stop(); exo = null; }
        try { if (screenReceiver != null) unregisterReceiver(screenReceiver); } catch (Exception ignored) { }
        if (recording || backgroundPlay) {
            recording = false;
            backgroundPlay = false;
            try { stopService(new Intent(this, RecordingService.class)); } catch (Exception ignored) { }
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
